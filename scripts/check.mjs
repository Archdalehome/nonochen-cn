/**
 * Local sanity check: parses every module, imports them (which also executes
 * them), then renders a few views against the seed content so a broken template
 * or a typo in a field name fails here instead of at request time.
 *
 *   npm run check
 */
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const failures = [];

/** `node --check` in stdin/module mode - reports syntax errors without running the file. */
const parseCheck = (relative) => {
  const source = readFileSync(new URL(relative, root), 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
  if (result.status !== 0) {
    const message = (result.stderr || '').split('\n').slice(0, 6).join(' ').trim();
    failures.push(`${relative}: ${message}`);
    return false;
  }
  return true;
};

const listFiles = (directory) =>
  readdirSync(new URL(directory, root))
    .filter((file) => file.endsWith('.js'))
    .map((file) => `${directory}${file}`);

// 1. every source file must parse
const files = [...listFiles('src/lib/'), ...listFiles('src/views/'), 'src/index.js'];
const parseable = files.filter(parseCheck);

// 2. its imports must resolve and the router must expose a fetch handler
if (parseable.length === files.length) {
  for (const file of files) {
    try {
      await import(new URL(file, root).href);
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
    }
  }

  const worker = await import(new URL('src/index.js', root).href);
  if (typeof (worker.default && worker.default.fetch) !== 'function') {
    failures.push('src/index.js: default export has no fetch handler');
  }
}

// 3. the seed data must line up with the schema (ids, handles, colours)
const [{ products, collections, settings, sections: seedSections }, { productCard }, { render }] = await Promise.all([
  import(new URL('scripts/data/content.mjs', root).href),
  import(new URL('src/views/partials.js', root).href),
  import(new URL('src/lib/html.js', root).href),
]);

for (const product of products) {
  if (!product.handle) failures.push(`content: product ${product.title} has no handle`);
  const colours = product.colours || [];
  for (const colour of colours) {
    if (!colour.name || !colour.hex) failures.push(`content: ${product.handle} has a colour without a name or hex`);
  }
  const card = render(
    productCard(
      { ...product, id: product.sort, image: '/images/placeholder.png' },
      { symbol: '¥' }
    )
  );
  if (!card.includes(product.handle)) failures.push(`views: productCard did not render ${product.handle}`);
  if (!card.includes(product.title)) failures.push(`views: productCard did not render the title of ${product.handle}`);
}

for (const collection of collections) {
  if (!collection.handle) failures.push('content: collection without a handle');
}

for (const setting of settings) {
  if (!setting.key) failures.push('content: setting without a key');
}

// The homepage reads its blocks from `sections` ordered by `position`: the hero,
// then the product blocks the shop asked for, then the banner blocks.
// `migrations/0009_home_block_order.sql`, `0010_best_selling_row.sql` and
// `0011_drop_masonry_section.sql` move the same rows in a database that is
// already seeded, so the rows have to keep the same names.
const homeBlocks = seedSections
  .filter((section) => section.page === 'home' && section.enabled !== 0)
  .sort((a, b) => (a.position || 0) - (b.position || 0))
  .map((section) => section.name);
const wantedBlocks = ['Homepage carousel', 'New Products', 'Best Selling', 'All Products'];
for (const [index, name] of wantedBlocks.entries()) {
  if (homeBlocks[index] !== name) {
    failures.push(`content: homepage block ${index + 1} should be ${name}, not ${homeBlocks[index] || '(none)'}`);
  }
}

// The "Discover Products & Ranges" masonry block that used to sit between "Best
// Selling" and "All Products" was deleted from the homepage
// (migrations/0011_drop_masonry_section.sql), so it must not come back with the
// seed either.
if (seedSections.some((section) => section.page === 'home' && section.type === 'masonry')) {
  failures.push('content: the deleted "Discover Products & Ranges" block is back on the homepage');
}

// 4. the header categories and the admin screens must render
const [
  { categoryNav, header, mobileNav },
  { adminPage, categoriesView, categoryProductsView, footerView, homeView, loginView },
  {
    MEDIA_MAX_BYTES,
    mediaKey,
    normalizeAnnouncement,
    normalizeCategory,
    normalizeFooterBrand,
    normalizeFooterGroup,
    normalizeFooterLink,
    normalizeHero,
    normalizeImageBanner,
    normalizeLinkGridItem,
    normalizeProduct,
    normalizeProductRow,
  },
  { hero: storefrontHero },
  { footer: storefrontFooter },
] = await Promise.all([
  import(new URL('src/views/chrome.js', root).href),
  import(new URL('src/views/admin.js', root).href),
  import(new URL('src/lib/admin.js', root).href),
  import(new URL('src/views/home.js', root).href),
  import(new URL('src/views/footer.js', root).href),
]);

const links = [
  { name: 'Indoor Range', href: '/collections/indoor-range', enabled: true },
  { name: 'New Products', href: '/category/new-products', enabled: true },
];

const nav = render(categoryNav(links, '/collections/indoor-range'));
if (!nav.includes('/collections/indoor-range') || !nav.includes('Indoor Range')) {
  failures.push('views: categoryNav did not render the managed categories');
}
if (!nav.includes('aria-current="page"')) failures.push('views: categoryNav did not mark the current category');
if (render(categoryNav([], '/')) !== '') failures.push('views: categoryNav should render nothing without categories');

// The categories belong in the header row (between the logo, the search and the
// cart) and at the top of the mobile drawer, whose only other content is the
// three links under them - the scraped mega menu must be gone for good.
const chrome = render(
  header(
    { announcement_text: 'Free Mainland UK Shipping On All Orders' },
    { count: 0 },
    links,
    '/collections/indoor-range'
  )
);
const rowStart = chrome.indexOf('top-navbar');
const rowEnd = chrome.indexOf('</nav>', rowStart);
const categoriesAt = chrome.indexOf('header-categories__link', rowStart);
if (rowStart < 0 || rowEnd < 0 || categoriesAt < 0 || categoriesAt > rowEnd) {
  failures.push('views: the categories are missing from the header row');
}
if (!chrome.includes('mobile-nav__category-link')) failures.push('views: the categories are missing from the mobile menu');
if (chrome.includes('mega-menu')) failures.push('views: the header still renders the old mega menu');

// The drawer lists the categories, then Search / Contact Details / Store Locator
// and nothing in between.
const drawer = render(mobileNav(links, '/collections/indoor-range'));
if (!drawer.includes('mobile-nav__category-link')) failures.push('views: the mobile menu did not render the categories');
for (const [label, href] of [
  ['搜索', '/search'],
  ['联系方式', '/pages/contact-details'],
  ['门店位置', '/pages/store-locator'],
]) {
  if (!drawer.includes(`href="${href}">${label}</a>`)) failures.push(`views: the mobile menu is missing the ${label} link`);
}
for (const scraped of ['mobileNavAccordion', 'accordion-button', 'border-bottom py-3', 'Shop all']) {
  if (drawer.includes(scraped)) failures.push(`views: the mobile menu still renders the scraped menu (${scraped})`);
}
if (!render(mobileNav([], '/')).includes('门店位置')) {
  failures.push('views: the mobile menu links should survive an empty category list');
}

const login = render(loginView({ siteName: 'Chen Furniture', error: 'nope', next: '/admin/categories' }));
if (!login.includes('name="username"') || !login.includes('name="password"')) {
  failures.push('views: loginView is missing the sign in form');
}

const admin = render(
  adminPage({
    user: 'admin',
    siteName: 'Chen Furniture',
    title: 'Product categories',
    body: categoriesView({
      list: [
        {
          id: 1,
          slug: 'outdoor-range',
          name: 'Outdoor Range',
          url: '',
          href: '/category/outdoor-range',
          filterType: 'collection',
          filterValue: 'outdoor-range',
          position: 1,
          enabled: true,
        },
      ],
    }),
    flash: { kind: 'success', message: 'Category saved.' },
  })
);
const adminMarkup = [
  'admin-header',
  'action="/admin/categories"',
  'action="/admin/categories/save"',
  'action="/admin/categories/delete"',
  'action="/admin/categories/move"',
  '/admin/categories/products?slug=outdoor-range',
  '/category/outdoor-range',
  'Category saved.',
];
for (const expected of adminMarkup) {
  if (!admin.includes(expected)) failures.push(`views: the category admin screen is missing ${expected}`);
}

// The product detail page reads *Home / the category the product was filed under
// in /admin / the product*. `categoryOfProduct` matches the product's own category
// fields first - the same match `productCategoryIndex` uses to decide which
// category owns a product - and only falls back to the category that owns the
// product's collection, so the seeded catalogue still gets a crumb. A
// `/collections/<handle>` in the middle is what the shop reported as the wrong
// category: a curated collection is not ownership.
const [{ categoryOfProduct, invalidate }, { productView: productPage }] = await Promise.all([
  import(new URL('src/lib/db.js', root).href),
  import(new URL('src/views/product.js', root).href),
]);
invalidate('categories'); // the 30 second memo lives per isolate - start from an empty cache

const categoryRows = [
  { id: 1, slug: 'pets-range', name: 'Pets Range', url: '', filter_type: 'collection', filter_value: 'pets-range', position: 1, enabled: 1 },
  { id: 2, slug: 'accessories', name: 'Accessories', url: '/collections/accessories', filter_type: 'tag', filter_value: 'accessories', position: 2, enabled: 1 },
  { id: 3, slug: 'everything', name: 'Everything', url: '', filter_type: 'all', filter_value: '', position: 3, enabled: 1 },
  { id: 4, slug: 'hidden', name: 'Hidden Range', url: '', filter_type: 'collection', filter_value: 'secret', position: 4, enabled: 0 },
];
// `categories()` asks for the rows the header shows (`WHERE enabled = 1`), so the
// stub answers that query the way D1 would - the disabled row stays out of it.
const stubDb = {
  prepare: (sql) => ({
    all: async () => ({
      results: /enabled = 1/.test(sql) ? categoryRows.filter((row) => row.enabled === 1) : categoryRows,
    }),
  }),
};

const filedProduct = {
  id: 9,
  handle: 'b-blanket-grey',
  title: 'B-Blanket Grey',
  price: 129,
  image: '/images/placeholder.png',
  media: [],
  colours: [],
  sizes: [],
  specs: [],
  features: [],
  cat_handle: 'accessories',
  cat_label: 'Accessories',
  collection_handle: 'b-blanket',
};

const filed = await categoryOfProduct(stubDb, filedProduct);
if (!filed || filed.name !== 'Accessories') failures.push('db: categoryOfProduct ignored the product category fields');
if (filed && filed.href !== '/collections/accessories') {
  failures.push('db: categoryOfProduct ignored the category link override');
}

const byCollection = await categoryOfProduct(stubDb, {
  ...filedProduct,
  cat_handle: 'indoor-range',
  cat_label: 'Indoor Range',
  collection_handle: 'pets-range',
});
if (!byCollection || byCollection.name !== 'Pets Range') {
  failures.push('db: categoryOfProduct did not fall back to the category that owns the collection');
}
const hidden = await categoryOfProduct(stubDb, { ...filedProduct, cat_handle: '', cat_label: '', collection_handle: 'secret' });
if (hidden !== null) failures.push('db: categoryOfProduct should skip a category the header hides');
const orphan = await categoryOfProduct(stubDb, { ...filedProduct, cat_handle: '', cat_label: '', collection_handle: 'gone' });
if (orphan !== null) failures.push('db: categoryOfProduct invented a category for a product that has none');

const detail = render(productPage({ product: filedProduct, settings: {}, symbol: '¥', category: filed }));
if (!detail.includes('<a class="text-secondary" href="/">首页</a>')) {
  failures.push('views: the product breadcrumb did not start at 首页');
}
if (!detail.includes('<a class="text-secondary" href="/collections/accessories">Accessories</a>')) {
  failures.push('views: the product breadcrumb did not name the category and its link');
}
if (detail.includes('/collections/b-blanket')) {
  failures.push('views: the product breadcrumb still points at the product collection');
}
const looseProduct = render(productPage({ product: filedProduct, settings: {}, symbol: '¥' }));
if (!looseProduct.includes('<a class="text-secondary" href="/products">全部商品</a>')) {
  failures.push('views: a product without a category should breadcrumb through 全部商品');
}


// 5. the category form rules behind those screens
const valid = normalizeCategory({ name: 'Outdoor  Bean Bags', slug: '', url: '', filter_type: 'tag', enabled: '1' });
if (valid.error) failures.push(`admin: a valid category was rejected (${valid.error})`);
if (valid.values.slug !== 'outdoor-bean-bags') failures.push(`admin: expected slug outdoor-bean-bags, got ${valid.values.slug}`);
if (valid.values.filterValue !== 'outdoor-bean-bags') failures.push('admin: an empty filter value should fall back to the slug');
if (valid.values.position !== null) failures.push('admin: an empty order should keep the current slot');
if (normalizeCategory({ name: '' }).error !== 'name') failures.push('admin: an empty name should be rejected');
if (normalizeCategory({ name: 'Lighting', slug: 'Not A Slug' }).error !== 'slug') failures.push('admin: a bad slug should be rejected');
if (normalizeCategory({ name: 'Lighting', slug: 'lighting', url: 'https://example.com' }).error !== 'url') {
  failures.push('admin: an external link override should be rejected');
}
if (normalizeCategory({ name: 'Lighting', slug: 'lighting', enabled: '0' }).values.enabled !== 0) {
  failures.push('admin: an unchecked visible switch should save 0');
}

// 6. the products of one category, and the rules behind their forms
const categoryProducts = render(
  adminPage({
    user: 'admin',
    siteName: 'Chen Furniture',
    title: 'Products in Outdoor Range',
    body: categoryProductsView({
      category: {
        id: 1,
        slug: 'outdoor-range',
        name: 'Outdoor Range',
        href: '/category/outdoor-range',
        filterType: 'collection',
        filterValue: 'outdoor-range',
      },
      list: [
        {
          id: 7,
          handle: 'b-bag-grey',
          title: 'B-Bag - Grey',
          price: 249,
          compare_at_price: null,
          price_from: 0,
          badge: 'Best seller',
          image: '/images/b-bag-grey.png',
          cat_handle: 'outdoor',
          cat_label: 'Outdoor',
          colour_hex: '#5f6062',
          summary: 'A bean bag.',
          description: 'The long copy.',
          collection_handle: 'outdoor-range',
          sold_out: 0,
          is_new: 0,
          show_in_home_grid: 1,
          sort_order: 3,
          soldOut: false,
          inGrid: true,
        },
      ],
      picker: [
        { id: 7, title: 'B-Bag - Grey', cat_handle: 'outdoor', cat_label: 'Outdoor', collection_handle: 'outdoor-range' },
        { id: 9, title: 'B-Lamp - Grey', cat_handle: 'lighting', cat_label: 'Lighting', collection_handle: 'indoor-range' },
      ],
      symbol: '¥',
    }),
    flash: { kind: 'success', message: 'Product saved.' },
  })
);
const productMarkup = [
  'action="/admin/products/create"',
  'action="/admin/products/add"',
  'action="/admin/products/save"',
  'action="/admin/products/remove"',
  'action="/admin/products/delete"',
  'name="category_slug" value="outdoor-range"',
  'id="p-7-title"',
  'id="new-title"',
  'name="sold_out" value="0"',
  'name="show_in_home_grid" value="1"',
  'Product saved.',
];
for (const expected of productMarkup) {
  if (!categoryProducts.includes(expected)) failures.push(`views: the product screen is missing ${expected}`);
}
// The picker only offers the products that are not in the category yet.
if (!categoryProducts.includes('<option value="9">B-Lamp - Grey')) {
  failures.push('views: the add-product picker did not list the product outside the category');
}
if (categoryProducts.includes('<option value="7">')) {
  failures.push('views: the add-product picker offered a product that is already in the category');
}

const product = normalizeProduct({ title: 'B-Bag  Grey', price: '¥249.50', image: '/images/b-bag-grey.png' });
if (product.error) failures.push(`admin: a valid product was rejected (${product.error})`);
if (product.values.handle !== 'b-bag-grey') failures.push(`admin: expected slug b-bag-grey, got ${product.values.handle}`);
if (product.values.price !== 249.5) failures.push(`admin: a price with a currency symbol should parse (${product.values.price})`);
if (product.values.compareAtPrice !== null) failures.push('admin: an empty "was" price should save NULL');
if (product.values.inGrid !== 1) failures.push('admin: a missing homepage switch should keep a product in the grid');
if (normalizeProduct({ title: '', price: '1', image: '/x.png' }).error !== 'title') {
  failures.push('admin: a product without a title should be rejected');
}
if (normalizeProduct({ title: 'X', price: 'free', image: '/x.png' }).error !== 'price') {
  failures.push('admin: a price that is not a number should be rejected');
}
if (normalizeProduct({ title: 'X', price: '1', compare_at_price: 'nope', image: '/x.png' }).error !== 'compare') {
  failures.push('admin: a "was" price that is not a number should be rejected');
}
if (normalizeProduct({ title: 'X', price: '1', image: 'b-bag.png' }).error !== 'image') {
  failures.push('admin: an image that is neither a path nor a URL should be rejected');
}
if (normalizeProduct({ title: 'X', price: '1', image: '/x.png', sort_order: 'later' }).values.sortOrder !== null) {
  failures.push('admin: a nonsense order should keep the current slot');
}
if (normalizeProduct({ title: 'X', price: '1', image: '/x.png', sold_out: '0' }).values.soldOut !== 0) {
  failures.push('admin: an unchecked sold out switch should save 0');
}

// The product screen's four repeaters: specs, feature bullets, sizes/colours and
// the media gallery. They post as `name="..."[]` arrays and are written to
// `products.specs` / `products.features`, `product_variants` and `product_media`
// by `saveProductDetails` - `scripts/verify-product-editor.mjs` runs that path
// against a seeded SQLite database.
const repeated = normalizeProduct({
  title: '真皮方形脚凳',
  handle: 'leather-square-ottoman',
  price: '2680',
  image: '/images/ottoman.png',
  has_details: '1',
  spec_label: ['尺寸', '  ', '材质'],
  spec_value: ['62 × 62 × 40 cm', '', '头层牛皮'],
  feature: ['头层牛皮', '  ', '可拆洗'],
  size_name: ['中号', '大号'],
  size_price: ['2680', ''],
  colour_name: ['焦糖棕', '深咖'],
  colour_swatch: ['#8b5e3c', 'not-a-colour'],
  media_src: ['/images/a.png', '/images/b.mp4', 'images/c.png'],
  media_kind: ['image', 'video', 'image'],
});
if (repeated.error) failures.push(`admin: the repeater form was rejected (${repeated.error})`);
if (repeated.values.specs.length !== 2 || repeated.values.specs[1].label !== '材质') {
  failures.push(`admin: the spec table should keep its filled rows only (${JSON.stringify(repeated.values.specs)})`);
}
if (repeated.values.features.length !== 2) failures.push('admin: blank feature bullets should be dropped');
if (repeated.values.sizes.length !== 2) failures.push('admin: both sizes should be kept');
if (repeated.values.sizes[1].price !== null) failures.push('admin: a blank size price should mean "use the product price"');
if (repeated.values.colours.length !== 2) failures.push('admin: both colours should be kept');
if (repeated.values.colours[1].hex !== '#18181b') {
  failures.push(`admin: a colour without a valid hex should fall back to the default (${repeated.values.colours[1].hex})`);
}
if (repeated.values.media.length !== 2 || repeated.values.media[1].kind !== 'video') {
  failures.push('admin: the gallery should keep valid paths and drop a relative one');
}
const emptySizes = normalizeProduct({ title: 'X', price: '1', image: '/x.png', has_details: '1' });
if (emptySizes.values.sizes.length !== 1 || emptySizes.values.sizes[0].name !== '默认') {
  failures.push('admin: a product with no size should still get one default size');
}
if (normalizeProduct({ title: 'X', price: '1', image: '/x.png' }).values.hasDetails !== false) {
  failures.push('admin: a form without has_details should not rewrite the product details');
}
// A Chinese title has nothing to slug from, so it falls back to a stable alias
// instead of failing the save.
const chineseOnly = normalizeProduct({ title: '真皮方形脚凳', price: '2680', image: '/images/x.png' });
if (chineseOnly.error) failures.push(`admin: a Chinese title alone should save (${chineseOnly.error})`);
if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(chineseOnly.values.handle)) {
  failures.push(`admin: a Chinese title should fall back to a valid alias (${chineseOnly.values.handle})`);
}
if (normalizeProduct({ title: '真皮方形脚凳', price: '2680', image: '/images/x.png' }).values.handle !== chineseOnly.values.handle) {
  failures.push('admin: the fallback alias should be stable for the same title');
}

// 7. the home page screen (the announcement bar and the hero) and its rules
const heroSection = {
  id: 3,
  name: 'Homepage carousel',
  position: 1,
  enabled: true,
  data: {
    interval: 3000,
    slides: [
      {
        interval: 5000,
        url: '/collections/outdoor-range',
        title: 'Embrace the Outdoors',
        text: '',
        button: { label: 'Shop Outdoor', url: '/collections/outdoor-range', style: 'btn-white', color: '#000000' },
        video: '/images/hero-outdoor-desktop.mp4',
        video_mobile: '/images/hero-outdoor-mobile.mp4',
        poster: '',
        poster_mobile: '',
      },
    ],
  },
};

const home = render(
  adminPage({
    user: 'admin',
    siteName: 'Chen Furniture',
    title: 'Home page content',
    body: homeView({
      settings: {
        announcement_text: 'Free Mainland UK Shipping On All Orders',
        announcement_icon: '/images/icon-delivery.svg',
      },
      hero: heroSection,
      media: true,
    }),
  })
);
const homeMarkup = [
  'action="/admin/home/announcement"',
  'action="/admin/home/hero"',
  'enctype="multipart/form-data"',
  'name="announcement_text" value="Free Mainland UK Shipping On All Orders"',
  'name="announcement_icon" value="/images/icon-delivery.svg"',
  'name="section_id" value="3"',
  'name="slide" value="0"',
  'name="video" value="/images/hero-outdoor-desktop.mp4"',
  'name="video_mobile" value="/images/hero-outdoor-mobile.mp4"',
  'name="title" value="Embrace the Outdoors"',
  'name="link" value="/collections/outdoor-range"',
  'name="button_label" value="Shop Outdoor"',
  'name="button_url" value="/collections/outdoor-range"',
  'name="video_file"',
];
for (const expected of homeMarkup) {
  if (!home.includes(expected)) failures.push(`views: the home page screen is missing ${expected}`);
}
// It previews the real bar, and it only offers a file picker when there is a
// bucket behind it.
if (!home.includes('announcement-bar')) failures.push('views: the home page screen does not preview the announcement bar');
if (!render(homeView({ settings: {}, hero: null })).includes('没有可编辑的视频')) {
  failures.push('views: the home page screen should say so when the homepage has no hero');
}
if (render(homeView({ settings: {}, hero: heroSection, media: false })).includes('type="file"')) {
  failures.push('views: the home page screen should not offer uploads without a MEDIA bucket');
}
// A hero the homepage is not showing says so, so a save is not a surprise.
if (!render(homeView({ settings: {}, hero: { ...heroSection, enabled: false } })).includes('该首页轮播区块已关闭')) {
  failures.push('views: the home page screen should flag a hero that is switched off');
}
if (render(homeView({ settings: {}, hero: heroSection })).includes('该首页轮播区块已关闭')) {
  failures.push('views: an enabled hero should not be flagged as switched off');
}

// The product rows and the bottom blocks under the hero are on that same screen,
// and each block posts one field set against its own section id, so a save can
// never rewrite a neighbour. The rows read a product switch; the tiles and the
// banners carry images, and the banner carries the button under its copy.
const blockRow = {
  id: 7,
  type: 'product_row',
  name: 'Best Selling',
  position: 3,
  enabled: true,
  data: { heading: 'Best Selling', subheading: '', source: 'best', view_all: { label: 'VIEW ALL', url: '/products' } },
};
const blockTiles = {
  id: 8,
  type: 'link_grid',
  name: 'Shop Outdoor / Shop Indoor',
  position: 6,
  enabled: true,
  data: {
    items: [
      { label: 'Shop Outdoor', image: '/images/banner-shop-outdoor.jpg', url: '/collections/outdoor-range', height: '60vh' },
      { label: 'Shop Indoor', image: '/images/banner-shop-indoor.jpg', url: '/collections/indoor-range', height: '60vh' },
    ],
  },
};
const blockBanner = {
  id: 9,
  type: 'image_banner',
  name: 'Keep Cosy Anywhere',
  position: 8,
  enabled: false,
  data: {
    image: '/images/banner-b-blanket.png',
    title: 'Keep Cosy Anywhere',
    button: { label: 'EXPLORE B-BLANKET', url: '/collections/b-blanket', style: 'btn-white', color: '#18181B' },
  },
};
const blocks = render(
  homeView({ settings: {}, hero: heroSection, sections: [blockRow, blockTiles, blockBanner], media: true })
);
for (const expected of [
  'action="/admin/home/product-row"',
  'action="/admin/home/link-grid"',
  'action="/admin/home/image-banner"',
  'action="/admin/home/section"',
  'name="section_id" value="7"',
  'name="section_id" value="8"',
  'name="section_id" value="9"',
  'name="heading" value="Best Selling"',
  'name="subheading" value=""',
  'name="view_all_label" value="VIEW ALL"',
  'name="view_all_url" value="/products"',
  'name="item" value="1"',
  'name="label" value="Shop Indoor"',
  'name="height" value="60vh"',
  'name="object_position"',
  'name="button_label" value="EXPLORE B-BLANKET"',
  'name="button_style"',
  '商品通过其分类页面加入该栏目',
]) {
  if (!blocks.includes(expected)) failures.push(`views: the home page screen is missing ${expected} in a block form`);
}
// Every block carries the switch that takes it off the homepage, and the switch
// reads on for exactly the blocks the homepage is showing.
const switchesOn = blocks.match(/type="checkbox" role="switch" name="enabled" value="1"[^>]*checked/g) || [];
if (switchesOn.length !== 2) {
  failures.push(`views: the block switches should read on for the two shown blocks and off for the hidden one (found ${switchesOn.length})`);
}
// A block that names collections says so instead, since those rows keep their
// pickers - the screen does not edit them.
const pickerRow = render(
  homeView({
    settings: {},
    sections: [{ ...blockRow, id: 10, data: { heading: 'New Products', source: 'collection', pickers: [{ label: 'B-Mat', collection: 'b-mat' }] } }],
  })
);
if (!pickerRow.includes('该栏目仍在按选择器数据列出系列')) {
  failures.push('views: a collection row should say that its pickers are not edited here');
}
// Without a MEDIA bucket there is nothing to upload to, so no file picker.
if (render(homeView({ settings: {}, sections: [blockTiles], media: false })).includes('type="file"')) {
  failures.push('views: the tile form should not offer uploads without a MEDIA bucket');
}

// One tile keeps every field its form did not carry, and an empty height falls
// back to the renderer's own default instead of to a stored one.
const storedTiles = {
  items: [
    { label: 'Shop Outdoor', image: '/images/banner-shop-outdoor.jpg', url: '/collections/outdoor-range', height: '60vh' },
    { label: 'Shop Indoor', image: '/images/banner-shop-indoor.jpg', url: '/collections/indoor-range', height: '60vh' },
  ],
};
const savedTile = normalizeLinkGridItem(
  { item: '1', label: '  Shop   Indoor ', url: '/collections/indoor-range', image: '/images/banner-shop-indoor.jpg', height: '  ' },
  storedTiles
);
if (savedTile.error) failures.push(`admin: a valid tile was rejected (${savedTile.error})`);
if (savedTile.values.items[1].label !== 'Shop Indoor') failures.push('admin: a tile label should lose its double spaces');
if (savedTile.values.items[1].height) failures.push('admin: an empty tile height should fall back to the renderer default');
if (savedTile.values.items[0].height !== '60vh') failures.push('admin: saving one tile should leave the other tiles alone');
for (const [fields, expected] of [
  [{ item: '9', label: 'Shop', url: '/x', image: '/images/a.jpg' }, 'item'],
  [{ item: '0', label: '   ', url: '/x', image: '/images/a.jpg' }, 'label'],
  [{ item: '0', label: 'Shop', url: 'pages/about', image: '/images/a.jpg' }, 'url'],
  [{ item: '0', label: 'Shop', url: '/x', image: '' }, 'image'],
  [{ item: '0', label: 'Shop', url: '/x', image: '/images/a.jpg', height: 'tall' }, 'height'],
]) {
  const outcome = normalizeLinkGridItem(fields, storedTiles);
  if (outcome.error !== expected) {
    failures.push(`admin: a tile should be rejected with ${expected}, got ${outcome.error || '(none)'}`);
  }
}

// The banner keeps its copy while it has a heading, copy or a button, the button
// needs both a label and a link, and an empty image position means centre.
const storedBanner = {
  image: '/images/banner-facts.jpg',
  object_position: '88% 86%',
  title: 'Old',
  text: 'Old',
  button: { label: 'OLD', url: '/old', style: 'btn-primary', color: '#000000' },
};
const savedBanner = normalizeImageBanner(
  {
    image: '/images/banner-b-blanket.png',
    object_position: '   ',
    title: ' Keep Cosy Anywhere ',
    text: 'Wrapped up warm.',
    button_label: 'EXPLORE B-BLANKET',
    button_url: '/collections/b-blanket',
    button_style: 'btn-white',
    button_color: '#18181B',
  },
  storedBanner
);
if (savedBanner.error) failures.push(`admin: a valid banner was rejected (${savedBanner.error})`);
if (savedBanner.values.title !== 'Keep Cosy Anywhere') failures.push('admin: a banner heading should lose its outer spaces');
if (savedBanner.values.object_position) failures.push('admin: an empty image position should fall back to the centre');
if (savedBanner.values.button.label !== 'EXPLORE B-BLANKET' || savedBanner.values.button.style !== 'btn-white') {
  failures.push('admin: the banner button should keep the label and the style it was saved with');
}
for (const [fields, expected] of [
  [{ image: '' }, 'image'],
  [{ image: '/images/a.jpg', object_position: '88%; color: red' }, 'position'],
  [{ image: '/images/a.jpg', button_label: 'GO' }, 'button'],
  [{ image: '/images/a.jpg', button_label: 'GO', button_url: 'b-blanket' }, 'link'],
  [{ image: '/images/a.jpg', button_label: 'GO', button_url: '/x', button_color: 'red' }, 'colour'],
]) {
  const outcome = normalizeImageBanner(fields, storedBanner);
  if (outcome.error !== expected) {
    failures.push(`admin: a banner should be rejected with ${expected}, got ${outcome.error || '(none)'}`);
  }
}
// The banner the homepage closes on has no button at all, and it still saves:
// posting its empty button fields back must not read as a broken link.
if (normalizeImageBanner({ image: '/images/banner-facts.jpg', title: 'Are you sitting comfortably?', text: 'Copy' }, storedBanner).error) {
  failures.push('admin: a banner without a button should still save');
}
if (normalizeImageBanner({ image: '/images/a.jpg', title: 'Hello', button_label: '   ' }, storedBanner).values.button) {
  failures.push('admin: clearing the banner button label should drop the button');
}


// What a product row lists is one of the product switches, its wording is tidied
// up, and its "view all" button only exists while it has words.
const savedRow = normalizeProductRow(
  { heading: '  New   Products ', subheading: '  Just   in ', source: 'new', view_all_label: ' VIEW ALL ', view_all_url: '/products' },
  { heading: 'New Products', source: 'collection', pickers: [{ label: 'B-Mat', collection: 'b-mat' }] }
);
if (savedRow.error) failures.push(`admin: a valid product row was rejected (${savedRow.error})`);
if (savedRow.values.heading !== 'New Products') failures.push('admin: a product row heading should lose its double spaces');
if (savedRow.values.subheading !== 'Just in') failures.push('admin: a product row subheading should lose its double spaces');
if (savedRow.values.source !== 'new') failures.push('admin: a product row should keep the switch it reads');
if (!Array.isArray(savedRow.values.pickers)) failures.push('admin: saving a product row should leave the pickers it does not edit alone');
if (savedRow.values.view_all.url !== '/products') failures.push('admin: a product row should keep the button link it was saved with');
for (const [fields, expected] of [
  [{ heading: '   ', source: 'new' }, 'heading'],
  [{ heading: 'New Products', source: 'trending' }, 'source'],
  [{ heading: 'New Products', source: 'grid', view_all_label: 'VIEW ALL', view_all_url: 'products' }, 'link'],
]) {
  const outcome = normalizeProductRow(fields);
  if (outcome.error !== expected) {
    failures.push(`admin: a product row should be rejected with ${expected}, got ${outcome.error || '(none)'}`);
  }
}
if ('view_all' in normalizeProductRow({ heading: 'New Products', source: 'new', view_all_label: '   ' }).values) {
  failures.push('admin: clearing the button label should drop the product row button');
}


const bar = normalizeAnnouncement({
  announcement_text: '  Free   Mainland UK Shipping  ',
  announcement_icon: '/images/icon-delivery.svg',
});
if (bar.error) failures.push(`admin: a valid announcement bar was rejected (${bar.error})`);
if (bar.values.announcement_text !== 'Free Mainland UK Shipping') {
  failures.push('admin: the bar message should lose its double spaces');
}
if (normalizeAnnouncement({ announcement_text: '   ' }).error !== 'text') {
  failures.push('admin: an empty bar message should be rejected');
}
if (normalizeAnnouncement({ announcement_text: 'Hi', announcement_icon: 'icon-delivery.svg' }).error !== 'icon') {
  failures.push('admin: a bar icon that is neither a path nor a URL should be rejected');
}
if (normalizeAnnouncement({ announcement_text: 'Hi' }).values.announcement_icon !== '') {
  failures.push('admin: an empty bar icon should stay empty - no icon is rendered then');
}

const heroForm = (fields = {}) =>
  normalizeHero({ slide: '0', video: '/images/hero-outdoor-desktop.mp4', ...fields }, heroSection.data);
const saved = heroForm({
  video_mobile: '',
  poster: '',
  poster_mobile: '',
  title: 'Embrace the Outdoors',
  text: 'Made to last',
  link: '/collections/outdoor-range',
  button_label: '',
  button_url: '',
});
if (saved.error) failures.push(`admin: a valid hero slide was rejected (${saved.error})`);
const slide = saved.values.slides[0];
if (slide.text !== 'Made to last') failures.push('admin: the text over the hero video was not saved');
if (slide.video_mobile !== '/images/hero-outdoor-desktop.mp4') {
  failures.push('admin: a hero with no phone video should reuse the desktop one');
}
if (slide.button) failures.push('admin: clearing the button label should drop the button');
if (saved.values.slides.length !== 1) failures.push('admin: saving one slide should not add or drop slides');
if (saved.values.interval !== 3000) {
  failures.push('admin: saving the hero should keep the fields the form does not show');
}

const kept = heroForm({ button_label: 'SHOP OUTDOOR', button_url: '/collections/outdoor-range' });
if (kept.values.slides[0].button.style !== 'btn-white' || kept.values.slides[0].button.color !== '#000000') {
  failures.push('admin: saving the hero button should keep its style and colour');
}
if (!kept.values.slides[0].button.url) failures.push('admin: the hero button should keep its link');
if (heroForm({ video: '' }).error !== 'video') failures.push('admin: a hero without a video should be rejected');
if (heroForm({ video: 'hero.mp4' }).error !== 'video') {
  failures.push('admin: a hero video that is neither a path nor a URL should be rejected');
}
if (heroForm({ poster: 'poster.jpg' }).error !== 'media') {
  failures.push('admin: a hero still that is neither a path nor a URL should be rejected');
}
if (heroForm({ link: 'collections/outdoor-range' }).error !== 'link') {
  failures.push('admin: a hero link that is neither a path nor a URL should be rejected');
}
if (heroForm({ button_label: 'Shop', button_url: '' }).error !== 'button') {
  failures.push('admin: a button without a link should be rejected');
}
if (normalizeHero({ slide: '9', video: '/x.mp4' }, heroSection.data).error !== 'slide') {
  failures.push('admin: a slide that is not in the hero should be rejected');
}

// Uploads: the extension follows the declared type (never the file name) and the
// object keeps the `images/` prefix the /images/* route reads.
const upload = mediaKey({ name: 'Hero Outdoor! .MP4', type: 'video/mp4', size: 4 * 1024 * 1024 }, 'video', 123);
if (upload.error) failures.push(`admin: a valid hero video was rejected (${upload.error})`);
if (upload.key !== 'images/hero/123-hero-outdoor.mp4') failures.push(`admin: unexpected upload key ${upload.key}`);
if (upload.path !== '/images/hero/123-hero-outdoor.mp4') {
  failures.push('admin: the upload path should be the one the /images/* route serves');
}
if (upload.contentType !== 'video/mp4') {
  failures.push(`admin: an upload of a video/mp4 file should be served as video/mp4, got ${upload.contentType}`);
}
if (mediaKey({ name: 'a.svg', type: 'image/svg+xml', size: 10 }, 'image').error !== 'type') {
  failures.push('admin: an upload of a type the site cannot serve should be rejected');
}
if (mediaKey({ name: 'huge.mp4', type: 'video/mp4', size: MEDIA_MAX_BYTES + 1 }, 'video').error !== 'size') {
  failures.push('admin: an oversized upload should be rejected');
}
// Every upload keeps the folder of the form it came from: the hero videos land in
// `images/hero/`, the company logo in `images/footer/`.
const logoUpload = mediaKey({ name: 'Chen Logo.PNG', type: 'image/png', size: 2048 }, 'image', 42, 'footer');
if (logoUpload.error) failures.push(`admin: a valid logo upload was rejected (${logoUpload.error})`);
if (logoUpload.key !== 'images/footer/42-chen-logo.png') failures.push(`admin: unexpected logo key ${logoUpload.key}`);
if (logoUpload.path !== '/images/footer/42-chen-logo.png') {
  failures.push('admin: the logo path should be the one the /images/* route serves');
}

// The storefront renders the same hero it rendered before the editor existed.
const heroMarkup = render(storefrontHero(heroSection));
for (const expected of [
  '<source src="/images/hero-outdoor-desktop.mp4" type="video/mp4">',
  '<source src="/images/hero-outdoor-mobile.mp4" type="video/mp4">',
  'Embrace the Outdoors',
  'Shop Outdoor',
  'href="/collections/outdoor-range"',
]) {
  if (!heroMarkup.includes(expected)) failures.push(`views: the storefront hero lost ${expected}`);
}

// 6. the footer columns: what /admin/footer writes is what the storefront shows
const footerColumn = (id, label, order, links) => ({
  id,
  parent_id: null,
  kind: 'group_heading',
  label,
  url: '',
  sort_order: order,
  enabled: true,
  links: links.map(([linkId, linkLabel, url, linkOrder]) => ({
    id: linkId,
    parent_id: id,
    kind: 'link',
    label: linkLabel,
    url,
    sort_order: linkOrder,
    enabled: true,
  })),
});
const footerGroups = [
  footerColumn(1, 'Company', 1, [
    [11, 'About', '/pages/about', 1],
    [12, 'Contact', '/pages/contact-details', 2],
    [13, 'FAQ', '/pages/faq', 3],
  ]),
  footerColumn(2, 'Follow', 2, [
    [21, 'Instagram', 'https://www.instagram.com/', 1],
    [22, 'Facebook', 'https://www.facebook.com/', 2],
    [23, 'TikTok', 'https://www.tiktok.com/', 3],
  ]),
  footerColumn(3, 'Help', 3, [[31, 'Returns', '/pages/returns', 1]]),
];
const footerSettings = {
  footer_copyright: '© 2026 Chen Furniture',
  site_name: 'Chen Furniture',
  brand_line: 'Premium bean bags and furniture crafted for ultimate comfort and effortless style, indoors and out.',
};

const footerAdmin = render(footerView({ groups: footerGroups, settings: footerSettings, media: true }));
for (const expected of [
  '页脚</h1>',
  'action="/admin/footer/group"',
  'action="/admin/footer/group/save"',
  'action="/admin/footer/group/move"',
  'action="/admin/footer/group/delete"',
  'action="/admin/footer/link"',
  'action="/admin/footer/link/save"',
  'action="/admin/footer/link/move"',
  'action="/admin/footer/link/delete"',
  'value="Company"',
  'value="Follow"',
  'value="/pages/about"',
  'value="https://www.instagram.com/"',
]) {
  if (!footerAdmin.includes(expected)) failures.push(`views: the footer admin screen is missing ${expected}`);
}
// The Location heading and the currency picker - and the forms that used to edit
// them - are gone.
if (footerAdmin.includes('Location heading') || footerAdmin.includes('action="/admin/footer/location"')) {
  failures.push('views: the footer admin screen still offers the Location heading');
}
if (footerAdmin.includes('country_options')) {
  failures.push('views: the footer admin screen still mentions the currency picker');
}

// The company block that opens the screen: the logo (a file picker plus the path
// the site shows), the name and the description. All three are settings rows the
// storefront reads back, and the picker only appears while MEDIA is bound.
for (const expected of [
  'action="/admin/footer/brand"',
  'name="footer_logo"',
  'name="logo_file"',
  'name="site_name"',
  'value="Chen Furniture"',
  'name="brand_line"',
  'Premium bean bags and furniture crafted for ultimate comfort and effortless style, indoors and out.',
]) {
  if (!footerAdmin.includes(expected)) failures.push(`views: the footer company block is missing ${expected}`);
}
const footerAdminNoMedia = render(footerView({ groups: footerGroups, settings: footerSettings, media: false }));
if (footerAdminNoMedia.includes('name="logo_file"')) {
  failures.push('views: the footer company block offers a file picker without a MEDIA bucket');
}
// "On the site now" previews the lockup the storefront draws, so with a logo the
// name is beside it rather than under it.
const footerAdminLogo = render(
  footerView({
    groups: footerGroups,
    settings: { ...footerSettings, footer_logo: '/images/footer/42-chen-logo.png' },
    media: true,
  })
);
const preview = footerAdminLogo.slice(footerAdminLogo.indexOf('>当前站点显示<'));
const previewMark = preview.indexOf('<img');
const previewName = preview.indexOf('<strong>Chen Furniture</strong>');
if (previewMark < 0 || previewMark > previewName) {
  failures.push('views: the footer company block preview should show the logo beside the name');
}
// The mock is a thumbnail, but it keeps the arrangement and the proportions of the
// real lockup: the name on the mark's bottom edge, the thumbnail a tenth bigger too.
if (!preview.slice(0, previewName).includes('align-items-end')) {
  failures.push("views: the footer company block preview should set the name on the mark's bottom edge");
}
if (!preview.includes('style="max-height: 4.95rem"')) {
  failures.push('views: the footer company block preview should show the taller logo');
}

// The storefront renders those very columns, splits the row between them and
// sends a link that leaves the site to a new tab.
const footerMarkup = render(storefrontFooter(footerSettings, footerGroups));
for (const expected of [
  '<h5 class="lh-sm fw-medium mb-4">Company</h5>',
  '<h5 class="lh-sm fw-medium mb-4">Follow</h5>',
  '>About</a>',
  'href="/pages/about"',
  'href="https://www.instagram.com/" target="_blank" rel="noopener"',
  'col-4',
]) {
  if (!footerMarkup.includes(expected)) failures.push(`views: the storefront footer is missing ${expected}`);
}
// The currency picker - and the heading that used to sit over it - is not
// rendered any more: no country list, no form, nowhere to post one.
if (
  footerMarkup.includes('currency-selector') ||
  footerMarkup.includes('country_options') ||
  footerMarkup.includes('data-localize') ||
  footerMarkup.includes('<h5 class="lh-sm fw-medium mb-4">Location')
) {
  failures.push('views: the storefront footer still renders the currency picker');
}
// A database that still holds the row must not bring it back either.
const leftoverPicker = render(
  storefrontFooter(
    { ...footerSettings, country_options: '[{"code":"GB","label":"United Kingdom (¥)","selected":1}]' },
    footerGroups
  )
);
if (leftoverPicker.includes('United Kingdom') || leftoverPicker.includes('<select')) {
  failures.push('views: a leftover country_options row still renders a currency picker');
}
// Three columns split the row in thirds, two in halves - the picker used to hold
// a fourth place of its own.
const twoColumns = render(storefrontFooter(footerSettings, footerGroups.slice(0, 2)));
if (!twoColumns.includes('<div class="col-6">')) {
  failures.push('views: two footer columns should read as halves');
}

// The company block itself: the name and the line under it render as they always
// did, and an uploaded logo joins the name on its left. Without one there is no
// <img> and the name keeps the line to itself.
if (!footerMarkup.includes('>Chen Furniture</span>')) {
  failures.push('views: the storefront footer lost the company name');
}
if (footerMarkup.includes('footer-logo')) {
  failures.push('views: the storefront footer renders a logo without an uploaded one');
}
if (!footerMarkup.includes('<span class="footer-brand heading-font d-block mb-3">')) {
  failures.push('views: the footer company name should stand on its own line without a logo');
}
const logoFooter = render(
  storefrontFooter({ ...footerSettings, footer_logo: '/images/footer/42-chen-logo.png' }, footerGroups)
);
for (const expected of [
  '<div class="footer-brand-row mb-3">',
  '<img class="footer-logo"',
  'src="/images/footer/42-chen-logo.png"',
  'alt="Chen Furniture"',
  '>Chen Furniture</span>',
]) {
  if (!logoFooter.includes(expected)) failures.push(`views: the storefront footer is missing ${expected}`);
}
// Both sit in that one row, the mark first - that is what puts the name to its
// right instead of under it.
const brandRow = logoFooter.slice(
  logoFooter.indexOf('<div class="footer-brand-row'),
  logoFooter.indexOf('</div>', logoFooter.indexOf('<div class="footer-brand-row'))
);
const markAt = brandRow.indexOf('<img class="footer-logo"');
const nameAt = brandRow.indexOf('<span class="footer-brand');
if (markAt < 0 || nameAt < 0) {
  failures.push('views: the footer logo and the company name should share one row');
} else if (markAt > nameAt) {
  failures.push('views: the footer logo should sit to the left of the company name');
}
// The lockup's rule is the brand layer's, next to `.footer-logo` / `.footer-brand`:
// one line, the name a fifth smaller than the standalone wordmark, and the two of
// them sharing one bottom edge.
const siteCss = readFileSync(new URL('public/css/site.css', root), 'utf8');
const siteRule = (selector) => new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(siteCss)?.[1] ?? '';
const siteClamp = (rule) => {
  const terms = /font-size:\s*clamp\(([^)]*)\)/.exec(rule)?.[1];
  return terms ? terms.split(',').map((term) => Number.parseFloat(term)) : [];
};
if (!/\.footer-brand-row\s*\{[^}]*display:\s*flex/.test(siteCss)) {
  failures.push('css: the footer logo and company name should share one line');
}
if (!/\.footer-brand-row\s*\{[^}]*align-items:\s*flex-end/.test(siteCss)) {
  failures.push('css: the company name should sit on the bottom edge of the logo');
}
const standaloneName = siteRule('\\.footer-brand');
const besideMarkName = siteRule('\\.footer-brand-row\\s+\\.footer-brand');
const standaloneSize = siteClamp(standaloneName);
const besideMarkSize = siteClamp(besideMarkName);
if (standaloneSize.length !== 3 || besideMarkSize.length !== 3) {
  failures.push('css: the footer company name should carry a font size of its own beside the logo');
} else if (!besideMarkSize.every((size, i) => size < standaloneSize[i])) {
  failures.push('css: the company name beside the logo should sit under the size it carries on its own line');
}
// Another fifth off the size the name took when it first moved beside the mark
// (0.8 x clamp(1.35rem, 2.8vw, 1.95rem)), so the caption keeps dropping away from
// the wordmark.
if (!/font-size:\s*clamp\(1\.08rem,\s*2\.24vw,\s*1\.56rem\)/.test(besideMarkName)) {
  failures.push('css: the company name beside the logo should drop another fifth, to clamp(1.08rem, 2.24vw, 1.56rem)');
}
// The mark stands a tenth over the 3.5rem it used to: 3.85rem.
const markCap = /\.footer-logo\s*\{[^}]*max-height:\s*([\d.]+)rem/.exec(siteCss)?.[1];
if (markCap !== '3.85') {
  failures.push(`css: the footer logo should stand 10% over 3.5rem (found ${markCap ?? 'no max-height'})`);
}

// 7. the footer form rules behind that screen
if (normalizeFooterLink({ label: 'FAQ', url: '/pages/faq' }).error) failures.push('admin: a valid footer link was rejected');
if (normalizeFooterLink({ label: 'Instagram', url: 'https://www.instagram.com/' }).error) {
  failures.push('admin: a social URL should be a valid footer link');
}
if (normalizeFooterLink({ label: 'Email', url: 'mailto:customerservice@chenfurniture.com' }).error) {
  failures.push('admin: a mailto footer link should be accepted');
}
if (normalizeFooterLink({ label: '  ', url: '/pages/faq' }).error !== 'label') {
  failures.push('admin: a footer link without words should be rejected');
}
if (normalizeFooterLink({ label: 'FAQ', url: 'pages/faq' }).error !== 'url') {
  failures.push('admin: a footer link that is neither a path nor a URL should be rejected');
}
if (normalizeFooterLink({ label: 'FAQ', url: '' }).error !== 'url') {
  failures.push('admin: a footer link with no URL should be rejected');
}
if (normalizeFooterLink({ label: 'FAQ', url: '/pages/faq', enabled: '0' }).values.enabled !== 0) {
  failures.push('admin: an unchecked footer link should save 0');
}
if (normalizeFooterLink({ label: 'FAQ', url: '/pages/faq' }).values.position !== null) {
  failures.push('admin: an empty footer order should keep the current slot');
}
if (normalizeFooterGroup({ label: '' }).error !== 'heading') {
  failures.push('admin: a footer column without a heading should be rejected');
}
if (normalizeFooterGroup({ label: ' Company ' }).values.label !== 'Company') {
  failures.push('admin: a footer heading should be trimmed');
}

// 8. the company block behind that card
const brand = normalizeFooterBrand({
  site_name: '  Chen   Furniture  ',
  brand_line: '  Premium bean bags and furniture crafted for comfort.  ',
  footer_logo: ' /images/footer/42-chen-logo.png ',
});
if (brand.error) failures.push(`admin: a valid company block was rejected (${brand.error})`);
if (brand.values.site_name !== 'Chen Furniture') {
  failures.push('admin: the company name should be trimmed and its runs of spaces collapsed');
}
if (brand.values.brand_line !== 'Premium bean bags and furniture crafted for comfort.') {
  failures.push('admin: the company description should be trimmed');
}
if (brand.values.footer_logo !== '/images/footer/42-chen-logo.png') {
  failures.push('admin: the company logo path should be trimmed');
}
if (normalizeFooterBrand({ site_name: 'Chen Furniture' }).values.footer_logo !== '') {
  failures.push('admin: the company logo should be optional');
}
if (normalizeFooterBrand({ site_name: '   ' }).error !== 'brand-name') {
  failures.push('admin: a company block without a name should be rejected');
}
if (normalizeFooterBrand({ site_name: 'Chen Furniture', footer_logo: 'logo.png' }).error !== 'brand-logo') {
  failures.push('admin: a company logo that is neither a path nor a URL should be rejected');
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s) found:\n`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  `All good: ${files.length} modules parsed, ${products.length} products, ${collections.length} collections, admin + header views render.`
);

