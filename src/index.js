import { html, render } from './lib/html.js';
import {
  addEnquiry,
  addProductToCategory,
  addSubscriber,
  allCategories,
  categories,
  categoryBySlug,
  categoryOfProduct,
  categorySlugTaken,
  collection,
  collectionHandles,
  collections,
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  createFooterGroup,
  createFooterLink,
  deleteFooterGroup,
  deleteFooterLink,
  footerGroupById,
  footerGroups,
  footerLinkById,
  footerMenu,
  moveCategory,
  moveFooterGroup,
  moveFooterLink,
  updateFooterGroup,
  updateFooterLink,
  pageSections,
  productByHandle,
  productById,
  productCategoryIndex,
  productHandleTaken,
  productList,
  productPicker,
  productsByCategory,
  relatedProducts,
  removeProductFromCategory,
  saveSectionData,
  saveSectionEnabled,
  saveSettings,
  searchProducts,
  sections,
  settings as loadSettings,
  updateCategory,
  updateProduct,
} from './lib/db.js';
import {
  createSession,
  credentials,
  defaultPasswordInUse,
  destroySession,
  FOOTER_BRAND_ERRORS,
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
  safeNext,
  SECTION_ERRORS,
  sessionUser,
  verifyLogin,
} from './lib/admin.js';
import {
  addItem,
  cartId,
  clear as clearCart,
  ensureCartId,
  loadCart,
  removeItem,
  setCartCookie,
  setQty,
} from './lib/cart.js';
import { layout, plainPage } from './views/layout.js';
import { renderSections } from './views/home.js';
import { SORTS, collectionIndex, collectionView } from './views/collection.js';
import { productView } from './views/product.js';
import { cartPage, checkoutPage, thankYouPage } from './views/cart.js';
import { contentPage, searchPage } from './views/pages.js';
import { adminNotFound, adminPage, categoriesView, categoryProductsView, footerView, homeView, loginView } from './views/admin.js';
import { cartDrawerContent } from './views/cart-drawer.js';

/* --------------------------------------------------------------- responses ---- */

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
};

const page = (body, status = 200) => new Response(render(body), { status, headers: HTML_HEADERS });

// Note: `extra` may be a Headers instance (cart cookies), so it has to be
// copied with the Headers constructor - spreading it would drop every header.
const json = (data, status = 200, extra = {}) => {
  const headers = new Headers(extra);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers });
};

const redirect = (location, extra = {}) => {
  const headers = new Headers(extra);
  headers.set('location', location);
  return new Response(null, { status: 303, headers });
};

const methodNotAllowed = () =>
  new Response('不支持的请求方法', { status: 405, headers: { allow: 'GET, POST, HEAD' } });

const notFound = (ctx, message = '没有找到这个页面。') =>
  page(
    layout({
      ...ctx,
      title: '页面不存在',
      body: plainPage({
        title: '页面不存在',
        message,
        action: { label: '返回首页', url: '/' },
      }),
    }),
    404
  );

/* ------------------------------------------------------------------- chrome ---- */

const currencySymbol = (env) => env.CURRENCY_SYMBOL || '£';

/** Everything the layout needs: settings, the footer, the cart and the header categories. */
const chrome = async (request, env) => {
  const db = env.DB;
  const id = cartId(request);
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  const [siteSettings, groups, cart, topCategories] = await Promise.all([
    loadSettings(db),
    footerGroups(db),
    loadCart(db, id),
    categories(db),
  ]);
  return {
    settings: siteSettings,
    groups,
    cart,
    categories: topCategories,
    path,
    symbol: currencySymbol(env),
  };
};

const view = (ctx, { title, description, canonical, image, body, bodyClass, status = 200 }) =>
  page(layout({ ...ctx, title, description, canonical, image, body, bodyClass }), status);

/* --------------------------------------------------------------------- home ---- */

/** The `source` values a homepage row reads a product switch from. */
const ROW_FLAGS = ['new', 'best', 'grid'];

/** Loads the products that each `product_row` section on a page needs. */
const productsForSections = async (db, list) => {
  const map = {};
  await Promise.all(
    list
      .filter((section) => section.type === 'product_row')
      .map(async (section) => {
        const { source, pickers = [] } = section.data;
        // A row driven by a product switch (New / Best Selling / All products)
        // lists one run of products; a row that names collections keeps its tabs.
        if (ROW_FLAGS.includes(source)) {
          map[section.id] = [{ label: '', products: await productList(db, { flag: source, limit: 12 }) }];
          return;
        }
        const tabs = pickers.length
          ? pickers
          : [{ label: section.data.heading || '精选', collection: section.data.collection || '' }];
        map[section.id] = await Promise.all(
          tabs.map(async (tab) => ({
            label: tab.label,
            products: await productList(db, { collection: tab.collection, limit: 12 }),
          }))
        );
      })
  );
  return map;
};

const homeRoute = async (request, env, ctx) => {
  const list = await sections(env.DB, 'home');
  const products = await productsForSections(env.DB, list);
  return view(ctx, {
    title: '',
    description: ctx.settings.meta_description,
    canonical: new URL('/', request.url).toString(),
    body: renderSections(list, { products, settings: ctx.settings, symbol: ctx.symbol }),
  });
};

/* ----------------------------------------------------------------- products ---- */

const effectivePrice = (product) =>
  product.sizes && product.sizes.length ? Math.min(...product.sizes.map((size) => Number(size.price))) : Number(product.price);

const sortProducts = (list, sort) => {
  const copy = [...list];
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => effectivePrice(a) - effectivePrice(b));
    case 'price-desc':
      return copy.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'title-desc':
      return copy.sort((a, b) => b.title.localeCompare(a.title));
    default:
      return copy;
  }
};

const allProductsRoute = async (request, env, ctx) => {
  const url = new URL(request.url);
  const sort = SORTS.some((option) => option.value === url.searchParams.get('sort'))
    ? url.searchParams.get('sort')
    : 'featured';
  const list = await productList(env.DB, { limit: 120 });
  const heading = ctx.settings.products_heading || '全部商品';

  return view(ctx, {
    title: heading,
    description: ctx.settings.products_intro,
    canonical: url.toString(),
    body: collectionView({
      collection: {
        handle: 'all',
        title: heading,
        subtitle: '',
        description: ctx.settings.products_intro || '',
      },
      products: sortProducts(list, sort),
      sort,
      symbol: ctx.symbol,
    }),
  });
};

const productRoute = async (request, env, ctx, handle) => {
  const product = await productByHandle(env.DB, handle);
  if (!product) return notFound(ctx, '这个商品已经下架了。');

  const [related, category] = await Promise.all([
    relatedProducts(env.DB, product, 4),
    categoryOfProduct(env.DB, product),
  ]);
  const symbol = ctx.symbol;
  const title = product.seo_title || product.title;
  const price = effectivePrice(product);

  return view(ctx, {
    title,
    description: product.seo_description || product.summary,
    canonical: new URL(`/products/${product.handle}`, request.url).toString(),
    image: product.image,
    body: productView({ product, related, settings: ctx.settings, symbol, category }),
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      description: product.summary || product.description,
      image: product.image,
      brand: { '@type': 'Brand', name: 'Chen Furniture' },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'GBP',
        price: price.toFixed(2),
        availability: product.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      },
    },
  });
};

/* -------------------------------------------------------------- collections ---- */

const collectionsRoute = async (request, env, ctx) => {
  const list = await collections(env.DB);
  return view(ctx, {
    title: '系列',
    description: 'Chen Furniture 的全部系列，从户外懒人沙发到室内灯具。',
    canonical: new URL('/collections', request.url).toString(),
    body: collectionIndex({ list, symbol: ctx.symbol }),
  });
};

const collectionRoute = async (request, env, ctx, handle) => {
  const url = new URL(request.url);
  const current = await collection(env.DB, handle);
  if (!current) return notFound(ctx, '这个系列已迁移或已售罄。');

  const sort = SORTS.some((option) => option.value === url.searchParams.get('sort'))
    ? url.searchParams.get('sort')
    : 'featured';
  const list = await productList(env.DB, { collection: handle, limit: 120 });

  return view(ctx, {
    title: current.title,
    description: current.subtitle || current.description,
    canonical: url.toString(),
    body: collectionView({
      collection: current,
      products: sortProducts(list, sort),
      sort,
      symbol: ctx.symbol,
    }),
  });
};

/* ------------------------------------------------------------ categories ---- */

/**
 * `/category/<slug>` backs the header links that have no link override.
 * The row picked in /admin decides which products are listed - a collection, a
 * product tag or everything - so a brand new category needs no code change.
 */
const categoryRoute = async (request, env, ctx, slug) => {
  const url = new URL(request.url);
  const current = await categoryBySlug(env.DB, slug);
  // Hidden categories stay reachable for signed in admins so Preview works.
  if (!current || (!current.enabled && !(await sessionUser(request, env)))) {
    return notFound(ctx, '这个分类暂时不可用。');
  }

  const sort = SORTS.some((option) => option.value === url.searchParams.get('sort'))
    ? url.searchParams.get('sort')
    : 'featured';
  const list = await productsByCategory(env.DB, current, 120);

  return view(ctx, {
    title: current.name,
    description: `在 ${ctx.settings.site_name || 'Chen Furniture'} 选购 ${current.name}。`,
    canonical: new URL(`/category/${current.slug}`, request.url).toString(),
    body: collectionView({
      collection: { handle: current.slug, title: current.name, subtitle: '', description: '' },
      products: sortProducts(list, sort),
      sort,
      symbol: ctx.symbol,
    }),
  });
};

/* ------------------------------------------------------------------ admin ---- */

const ADMIN_HEADERS = { ...HTML_HEADERS, 'x-robots-tag': 'noindex, nofollow' };

const adminSiteName = (env) => env.SITE_NAME || 'Chen Furniture';

/** `?flash=` / `?error=` values the admin screens can show. */
const ADMIN_NOTICES = {
  created: { kind: 'success', message: '分类已添加，页头已经显示。' },
  saved: { kind: 'success', message: '分类已保存。' },
  moved: { kind: 'success', message: '排序已更新。' },
  deleted: { kind: 'success', message: '分类已删除。' },
  name: { kind: 'danger', message: '分类需要填写名称。' },
  slug: { kind: 'danger', message: '这个 slug 不合法：只能使用 a-z、0-9 和短横线（最多 60 个字符）。' },
  url: { kind: 'danger', message: '自定义链接必须以 “/” 开头（例如 /collections/outdoor-range）。' },
  duplicate: { kind: 'danger', message: '已有其他分类在使用这个 slug。' },
  missing: { kind: 'danger', message: '没有找到这个分类。' },
};

/**
 * The same idea for the product screen, which lives inside a category. The keys
 * are prefixed so a `?flash=` from one screen can never read oddly on the other.
 */
const PRODUCT_NOTICES = {
  'product-created': { kind: 'success', message: '商品已创建，并且已加入当前分类。' },
  'product-saved': { kind: 'success', message: '商品已保存。' },
  'product-added': { kind: 'success', message: '商品已加入这个分类。' },
  'product-removed': { kind: 'success', message: '商品已从这个分类移除，商品本身不受影响。' },
  'product-deleted': { kind: 'success', message: '商品已删除，它的规格、图片和购物车记录也一并删除。' },
  'product-title': { kind: 'danger', message: '商品需要填写标题。' },
  'product-handle': {
    kind: 'danger',
    message: '这个商品 slug 不合法：只能使用 a-z、0-9 和短横线（最多 80 个字符）。',
  },
  'product-duplicate': { kind: 'danger', message: '已有其他商品在使用这个 slug。' },
  'product-price': { kind: 'danger', message: '价格必须是数字，例如 249 或 249.99。' },
  'product-compare': { kind: 'danger', message: '“原价” 必须是数字，或者留空。' },
  'product-image': {
    kind: 'danger',
    message: '商品需要图片：可以是 /images/b-bag-grey.png 这样的路径，也可以是完整的 https:// 链接。',
  },
  'product-missing': { kind: 'danger', message: '这个商品已经不在商品库里了。' },
  'product-pick': { kind: 'danger', message: '请先从列表中选择一个商品。' },
  'product-filter': {
    kind: 'danger',
    message: '这个分类会列出全部商品，因此没有需要添加或移除的内容。',
  },
  'product-not-held': {
    kind: 'danger',
    message: '这个商品不在当前分类里：请刷新页面，列表可能已经变化。',
  },
  'product-taken': {
    kind: 'danger',
    message: '这个商品已经在另一个分类里。一个商品同时只能属于一个分类：请先从另一个分类中移除。',
  },
};

/**
 * And for `/admin/home`, which writes the announcement bar (`settings`) and the
 * homepage blocks (`sections`): the hero, the product rows under it and the tiles
 * and banners that close the page. The keys are prefixed with the form they come
 * from.
 */
const HOME_NOTICES = {
  'bar-saved': { kind: 'success', message: '公告栏已保存，下一个请求起每个页面都会显示。' },
  'hero-saved': { kind: 'success', message: '主视觉已保存，刷新首页即可看到。' },
  'bar-text': { kind: 'danger', message: '公告栏需要填写文字。' },
  'bar-icon': {
    kind: 'danger',
    message: '公告栏图标必须是以 /images/icon-delivery.svg 这样的路径，或完整的 https:// 链接（也可以留空）。',
  },
  'hero-video': {
    kind: 'danger',
    message: '主视觉需要视频：可以是 /images/hero-outdoor-desktop.mp4 这样的路径、完整的 https:// 链接，或者上传一个文件。',
  },
  'hero-media': {
    kind: 'danger',
    message: '静态图必须是以 /images/hero-outdoor-poster-desktop.jpg 这样的路径，或完整的 https:// 链接。',
  },
  'hero-link': {
    kind: 'danger',
    message: '链接必须以 “/” 开头（例如 /collections/outdoor-range），或者是完整的 https:// 链接。',
  },
  'hero-button': { kind: 'danger', message: '按钮需要同时填写文字和链接；如果想让整张幻灯片可点，请清空按钮文字。' },
  'hero-slide': { kind: 'danger', message: '这张幻灯片已经不属于主视觉了，请刷新页面后重试。' },
  'hero-missing': { kind: 'danger', message: '首页已经没有主视觉区块了，因此没有可保存的内容。' },
  'hero-type': {
    kind: 'danger',
    message: '不支持这种文件类型：视频只能是 MP4、WebM 或 MOV，图片只能是 JPEG、PNG、WebP 或 AVIF。',
  },
  'hero-size': { kind: 'danger', message: '文件太大了，上传上限是 25 MB。' },
  'hero-storage': {
    kind: 'danger',
    message: '这个 Worker 没有绑定 MEDIA 存储桶，文件无法保存：请改为填写 /images/hero-outdoor-desktop.mp4 这样的路径。',
  },
  'row-saved': { kind: 'success', message: '商品行已保存，刷新首页即可看到。' },
  'grid-saved': { kind: 'success', message: '图文块已保存，刷新首页即可看到。' },
  'banner-saved': { kind: 'success', message: '横幅已保存，刷新首页即可看到。' },
  'section-shown': { kind: 'success', message: '这个区块已经重新显示在首页。' },
  'section-hidden': {
    kind: 'success',
    message: '这个区块已从首页隐藏。内容没有被删除，重新打开就会完全恢复原样。',
  },
  'section-missing': {
    kind: 'danger',
    message: '首页已经没有这个区块了，请刷新页面后重试。',
  },
  'media-type': { kind: 'danger', message: '不支持这种文件类型：图片只能是 JPEG、PNG、WebP 或 AVIF。' },
  'media-size': { kind: 'danger', message: '文件太大了，上传上限是 25 MB。' },
  'media-storage': {
    kind: 'danger',
    message: '这个 Worker 没有绑定 MEDIA 存储桶，文件无法保存：请改为填写站点上已有图片的路径。',
  },
  // The product rows and the bottom blocks have one error each per rule; the
  // wording lives in `lib/admin.js`, next to the rule that decides it, and is
  // folded in here so every screen reports errors the same way.
  ...Object.fromEntries(
    Object.entries(SECTION_ERRORS).map(([key, message]) => [key, { kind: 'danger', message }])
  ),
};

/**
 * And for `/admin/footer`, which writes the link columns at the bottom of every
 * page. The keys are prefixed with the form they come from, so a `?flash=` from
 * one screen can never read oddly on another.
 */
const FOOTER_NOTICES = {
  'group-created': { kind: 'success', message: '栏已添加，下一个请求起页脚就会显示。' },
  'group-saved': { kind: 'success', message: '栏已保存。' },
  'group-moved': { kind: 'success', message: '栏的排序已更新。' },
  'group-deleted': { kind: 'success', message: '栏已删除，其中的链接也一并删除。' },
  'group-heading': { kind: 'danger', message: '页脚栏需要填写标题，例如“公司”。' },
  'group-missing': { kind: 'danger', message: '没有找到这个页脚栏。' },
  'link-created': { kind: 'success', message: '链接已添加，下一个请求起页脚就会显示。' },
  'link-saved': { kind: 'success', message: '链接已保存。' },
  'link-moved': { kind: 'success', message: '链接排序已更新。' },
  'link-deleted': { kind: 'success', message: '链接已删除。' },
  'link-label': { kind: 'danger', message: '页脚链接需要填写站点上显示的文字。' },
  'link-url': {
    kind: 'danger',
    message: '页脚链接必须以 “/” 开头（例如 /pages/about），或者是完整的 https:// 链接或 mailto: 地址。',
  },
  'link-missing': { kind: 'danger', message: '没有找到这个页脚链接。' },
  'brand-saved': { kind: 'success', message: '公司信息区块已保存，下一个请求起每个页面都会显示。' },
  'brand-storage': {
    kind: 'danger',
    message: '这个 Worker 没有绑定 MEDIA 存储桶，Logo 无法保存：请改为填写站点上已有图片的路径。',
  },
  'brand-type': {
    kind: 'danger',
    message: '不支持这种文件类型：Logo 只能是 JPEG、PNG、WebP 或 AVIF。',
  },
  'brand-size': { kind: 'danger', message: '文件太大了，上传上限是 25 MB。' },
  // The company block has one error per rule; the wording lives in `lib/admin.js`
  // next to the rule that decides it and is folded in here, the way the homepage
  // folds in the section rules.
  ...Object.fromEntries(
    Object.entries(FOOTER_BRAND_ERRORS).map(([key, message]) => [key, { kind: 'danger', message }])
  ),
};

const adminNotice = (url, notices = ADMIN_NOTICES) => {
  const key = url.searchParams.get('error') || url.searchParams.get('flash') || '';
  return notices[key] || null;
};

/** The product screen of one category, plus its `?flash=` / `?error=`. */
const productScreen = (slug, query = '') =>
  `/admin/categories/products?slug=${encodeURIComponent(slug)}${query ? `&${query}` : ''}`;

/** How many products the admin screen lists before it stops rendering forms. */
const ADMIN_PRODUCT_LIMIT = 200;

const adminResponse = ({ env, user = '', title, body, status = 200, flash = null }) =>
  new Response(
    render(
      adminPage({
        user,
        siteName: adminSiteName(env),
        title,
        body,
        flash,
        warning: defaultPasswordInUse(env)
          ? html`默认的 <code>admin</code> / <code>admin</code> 登录仍然有效。为了保护后台，请用 <code>npx wrangler secret put ADMIN_PASSWORD</code> 设置自己的密码。`
          : '',
      })
    ),
    { status, headers: ADMIN_HEADERS }
  );

const adminLoginPage = async (request, env) => {
  const url = new URL(request.url);
  if (await sessionUser(request, env)) return redirect(safeNext(url.searchParams.get('next')));
  const error = url.searchParams.get('error') === 'credentials' ? '用户名和密码不匹配。' : '';
  return new Response(
    render(
      loginView({
        siteName: adminSiteName(env),
        error,
        next: url.searchParams.has('next') ? safeNext(url.searchParams.get('next'), '') : '',
      })
    ),
    { status: 200, headers: ADMIN_HEADERS }
  );
};

const adminLoginSubmit = async (request, env) => {
  const data = await readForm(request);
  if (!(await verifyLogin(env, data.username, data.password))) {
    const next = safeNext(data.next, '');
    return redirect(`/admin/login?error=credentials${next ? `&next=${encodeURIComponent(next)}` : ''}`);
  }
  const headers = await createSession(env, credentials(env).user);
  headers.set('location', safeNext(data.next));
  return new Response(null, { status: 303, headers });
};

const adminLogout = () => {
  const headers = destroySession();
  headers.set('location', '/admin/login');
  return new Response(null, { status: 303, headers });
};

const adminCategoriesPage = async (request, env, user) => {
  const [list, handles] = await Promise.all([allCategories(env.DB), collectionHandles(env.DB)]);
  return adminResponse({
    env,
    user,
    title: '商品分类',
    body: categoriesView({ list, collections: handles }),
    flash: adminNotice(new URL(request.url)),
  });
};

const adminCategoryCreate = async (request, env) => {
  const { error, values } = normalizeCategory(await readForm(request));
  if (error) return redirect(`/admin/categories?error=${error}`);
  if (await categorySlugTaken(env.DB, values.slug)) return redirect('/admin/categories?error=duplicate');
  await createCategory(env.DB, values);
  return redirect('/admin/categories?flash=created');
};

const adminCategorySave = async (request, env) => {
  const data = await readForm(request);
  const id = Number(data.id) || 0;
  if (!id) return redirect('/admin/categories?error=missing');
  const { error, values } = normalizeCategory(data);
  if (error) return redirect(`/admin/categories?error=${error}`);
  if (await categorySlugTaken(env.DB, values.slug, id)) return redirect('/admin/categories?error=duplicate');
  await updateCategory(env.DB, id, values);
  return redirect('/admin/categories?flash=saved');
};

const adminCategoryDelete = async (request, env) => {
  const data = await readForm(request);
  let id = Number(data.id) || 0;
  if (!id && data.slug) {
    const found = await categoryBySlug(env.DB, String(data.slug));
    id = found ? found.id : 0;
  }
  if (!id) return redirect('/admin/categories?error=missing');
  await deleteCategory(env.DB, id);
  return redirect('/admin/categories?flash=deleted');
};

const adminCategoryMove = async (request, env) => {
  const data = await readForm(request);
  const moved = await moveCategory(env.DB, Number(data.id), data.direction === 'up' ? 'up' : 'down');
  return redirect(moved ? '/admin/categories?flash=moved' : '/admin/categories?error=missing');
};

/* ------------------------------------------ the bar and the hero ---- */

const adminHomePage = async (request, env, user) => {
  const [siteSettings, list] = await Promise.all([loadSettings(env.DB), pageSections(env.DB, 'home')]);
  return adminResponse({
    env,
    user,
    title: '首页内容',
    body: homeView({
      settings: siteSettings,
      hero: list.find((section) => section.type === 'hero') || null,
      sections: list,
      media: Boolean(env.MEDIA),
    }),
    flash: adminNotice(new URL(request.url), HOME_NOTICES),
  });
};

const adminAnnouncementSave = async (request, env) => {
  const { error, values } = normalizeAnnouncement(await readForm(request));
  if (error) return redirect(`/admin/home?error=bar-${error}`);
  await saveSettings(env.DB, values);
  return redirect('/admin/home?flash=bar-saved');
};

/** The file one media input posted, or null when the picker was left alone. */
const uploadedFile = (form, name) => {
  const value = form.get(name);
  return value && typeof value === 'object' && typeof value.stream === 'function' && value.size ? value : null;
};

/**
 * Stores one picked file in R2 and returns the `/images/...` path it is served
 * from. The objects keep the `images/` prefix scripts/upload-media.mjs uses, so
 * the existing `/images/*` route reads them the same way.
 */
/**
 * Stores one picked file in R2 and returns the `/images/...` path it is served
 * from. The objects keep the `images/` prefix scripts/upload-media.mjs uses, so
 * the existing `/images/*` route reads them the same way.
 */
const storeMediaFile = async (env, file, kind, folder = 'hero') => {
  const checked = mediaKey(file, kind, Date.now(), folder);
  if (checked.error) return checked;
  await env.MEDIA.put(checked.key, file.stream(), { httpMetadata: { contentType: checked.contentType } });
  return checked;
};

/**
 * A picked file replaces the text field next to it, so the two controls of a
 * media field can never disagree. Returns the notice key to report, or '' when
 * the field is fine (including when the picker was left alone).
 */
const storeImageUpload = async (env, form, input, fields, field) => {
  const file = uploadedFile(form, input);
  if (!file) return '';
  if (!env.MEDIA) return 'media-storage';
  const stored = await storeMediaFile(env, file, 'image');
  if (stored.error) return stored.error === 'size' ? 'media-size' : 'media-type';
  fields[field] = stored.path;
  return '';
};

/**
 * Saves one hero slide. A file picked in the form is written to R2 first and its
 * path replaces whatever the field next to it held, so the two controls of a
 * media field can never disagree.
 */
const adminHeroSave = async (request, env) => {
  const form = await request.formData();
  const fields = Object.fromEntries([...form.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : '']));
  const id = Number(fields.section_id) || 0;
  const hero = (await pageSections(env.DB, 'home')).find((section) => section.id === id && section.type === 'hero');
  if (!hero) return redirect('/admin/home?error=hero-missing');

  const uploads = [
    ['video_file', 'video', 'video'],
    ['video_mobile_file', 'video_mobile', 'video'],
    ['poster_file', 'poster', 'image'],
    ['poster_mobile_file', 'poster_mobile', 'image'],
  ];
  for (const [input, field, kind] of uploads) {
    const file = uploadedFile(form, input);
    if (!file) continue;
    if (!env.MEDIA) return redirect('/admin/home?error=hero-storage');
    const stored = await storeMediaFile(env, file, kind);
    if (stored.error) return redirect(`/admin/home?error=hero-${stored.error === 'size' ? 'size' : 'type'}`);
    fields[field] = stored.path;
  }

  const { error, values } = normalizeHero(fields, hero.data);
  if (error) return redirect(`/admin/home?error=hero-${error}`);
  const saved = await saveSectionData(env.DB, hero.id, values);
  return redirect(saved ? '/admin/home?flash=hero-saved' : '/admin/home?error=hero-missing');
};

/* ------------------------------------------------- product rows and blocks ---- */

/**
 * The product rows, tiles and banners under the hero. They are `sections` rows
 * too, and every form on the screen posts one set of fields against the block it
 * belongs to, so each handler reads only that block and leaves the rest of the
 * page - and every field it does not carry - exactly as it was.
 */
const homeRedirect = (query = '') => redirect(`/admin/home${query ? `?${query}` : ''}`);

/** The `sections` row one block form posted, or null once it has gone. */
const postedSection = async (db, fields, types) => {
  const id = Number(fields.section_id) || 0;
  if (!id) return null;
  const list = await pageSections(db, 'home');
  return list.find((section) => section.id === id && types.includes(section.type)) || null;
};

/** The heading, wording and "view all" button of one product row. */
const adminProductRowSave = async (request, env) => {
  const data = await readForm(request);
  const section = await postedSection(env.DB, data, ['product_row']);
  if (!section) return homeRedirect('error=section-missing');
  const { error, values } = normalizeProductRow(data, section.data);
  if (error) return homeRedirect(`error=row-${error}`);
  const saved = await saveSectionData(env.DB, section.id, values);
  return homeRedirect(saved ? 'flash=row-saved' : 'error=section-missing');
};

/** One tile of one link grid: its words, its link and its image. */
const adminLinkGridSave = async (request, env) => {
  const form = await request.formData();
  const data = Object.fromEntries([...form.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : '']));
  const section = await postedSection(env.DB, data, ['link_grid']);
  if (!section) return homeRedirect('error=section-missing');
  const upload = await storeImageUpload(env, form, 'image_file', data, 'image');
  if (upload) return homeRedirect(`error=${upload}`);
  const { error, values } = normalizeLinkGridItem(data, section.data);
  if (error) return homeRedirect(`error=grid-${error}`);
  const saved = await saveSectionData(env.DB, section.id, values);
  return homeRedirect(saved ? 'flash=grid-saved' : 'error=section-missing');
};

/** One image banner: its image, the copy over it and the button under it. */
const adminImageBannerSave = async (request, env) => {
  const form = await request.formData();
  const data = Object.fromEntries([...form.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : '']));
  const section = await postedSection(env.DB, data, ['image_banner']);
  if (!section) return homeRedirect('error=section-missing');
  const upload = await storeImageUpload(env, form, 'image_file', data, 'image');
  if (upload) return homeRedirect(`error=${upload}`);
  const { error, values } = normalizeImageBanner(data, section.data);
  if (error) return homeRedirect(`error=banner-${error}`);
  const saved = await saveSectionData(env.DB, section.id, values);
  return homeRedirect(saved ? 'flash=banner-saved' : 'error=section-missing');
};

/** Switches one whole block on or off, leaving what is in it alone. */
const adminSectionToggle = async (request, env) => {
  const data = await readForm(request);
  const section = await postedSection(env.DB, data, ['product_row', 'link_grid', 'image_banner']);
  if (!section) return homeRedirect('error=section-missing');
  const enabled = data.enabled === '1';
  await saveSectionEnabled(env.DB, section.id, enabled);
  return homeRedirect(enabled ? 'flash=section-shown' : 'flash=section-hidden');
};

/* ---------------------------------------------------------------- footer ---- */

/**
 * `/admin/footer` writes the same `menu_items` rows the storefront renders, one
 * handler per form on the screen. Every write invalidates the cached footer, so
 * the change shows up on the next request.
 */
const footerRedirect = (query = '') => redirect(`/admin/footer${query ? `?${query}` : ''}`);

/**
 * The company block that opens the footer: its logo (a file to store in R2, or
 * the path of an image that is already on the site), the company name beside it
 * and the description under both. All three are `settings` rows, so this screen,
 * the storefront and the page titles read the same values.
 */
const adminFooterBrandSave = async (request, env) => {
  const form = await request.formData();
  const data = Object.fromEntries(
    [...form.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : ''])
  );
  const file = uploadedFile(form, 'logo_file');
  if (file) {
    if (!env.MEDIA) return footerRedirect('error=brand-storage');
    const stored = await storeMediaFile(env, file, 'image', 'footer');
    if (stored.error) return footerRedirect(`error=brand-${stored.error === 'size' ? 'size' : 'type'}`);
    // The stored path replaces whatever the field next to the picker held, so the
    // two controls of a media field can never disagree.
    data.footer_logo = stored.path;
  }

  const { error, values } = normalizeFooterBrand(data);
  if (error) return footerRedirect(`error=${error}`);
  await saveSettings(env.DB, values);
  return footerRedirect('flash=brand-saved');
};

const adminFooterPage = async (request, env, user) => {
  const [groups, siteSettings] = await Promise.all([footerMenu(env.DB), loadSettings(env.DB)]);
  return adminResponse({
    env,
    user,
    title: '页脚',
    body: footerView({ groups, settings: siteSettings, media: Boolean(env.MEDIA) }),
    flash: adminNotice(new URL(request.url), FOOTER_NOTICES),
  });
};

const adminFooterGroupCreate = async (request, env) => {
  const { error, values } = normalizeFooterGroup(await readForm(request));
  if (error) return footerRedirect('error=group-heading');
  await createFooterGroup(env.DB, values);
  return footerRedirect('flash=group-created');
};

const adminFooterGroupSave = async (request, env) => {
  const data = await readForm(request);
  const id = Number(data.id) || 0;
  if (!id || !(await footerGroupById(env.DB, id))) return footerRedirect('error=group-missing');
  const { error, values } = normalizeFooterGroup(data);
  if (error) return footerRedirect('error=group-heading');
  await updateFooterGroup(env.DB, id, values);
  return footerRedirect('flash=group-saved');
};

const adminFooterGroupDelete = async (request, env) => {
  const id = Number((await readForm(request)).id) || 0;
  const deleted = id ? await deleteFooterGroup(env.DB, id) : false;
  return footerRedirect(deleted ? 'flash=group-deleted' : 'error=group-missing');
};

const adminFooterGroupMove = async (request, env) => {
  const data = await readForm(request);
  const moved = await moveFooterGroup(env.DB, Number(data.id) || 0, String(data.direction || ''));
  return footerRedirect(moved ? 'flash=group-moved' : 'error=group-missing');
};

const adminFooterLinkCreate = async (request, env) => {
  const data = await readForm(request);
  const parentId = Number(data.parent_id) || 0;
  if (!parentId || !(await footerGroupById(env.DB, parentId))) return footerRedirect('error=group-missing');
  const { error, values } = normalizeFooterLink(data);
  if (error) return footerRedirect(`error=link-${error}`);
  const added = await createFooterLink(env.DB, { ...values, parentId });
  return footerRedirect(added ? 'flash=link-created' : 'error=group-missing');
};

const adminFooterLinkSave = async (request, env) => {
  const data = await readForm(request);
  const id = Number(data.id) || 0;
  if (!id || !(await footerLinkById(env.DB, id))) return footerRedirect('error=link-missing');
  const { error, values } = normalizeFooterLink(data);
  if (error) return footerRedirect(`error=link-${error}`);
  const saved = await updateFooterLink(env.DB, id, values);
  return footerRedirect(saved ? 'flash=link-saved' : 'error=link-missing');
};

const adminFooterLinkDelete = async (request, env) => {
  const id = Number((await readForm(request)).id) || 0;
  const deleted = id ? await deleteFooterLink(env.DB, id) : false;
  return footerRedirect(deleted ? 'flash=link-deleted' : 'error=link-missing');
};

const adminFooterLinkMove = async (request, env) => {
  const data = await readForm(request);
  const moved = await moveFooterLink(env.DB, Number(data.id) || 0, String(data.direction || ''));
  return footerRedirect(moved ? 'flash=link-moved' : 'error=link-missing');
};

/**
 * The products one category lists - the same rows the storefront renders, so
 * the editors below write exactly what `/category/<slug>` (or the header link)
 * shows a shopper a moment later.
 */
const adminCategoryProductsPage = async (request, env, user) => {
  const url = new URL(request.url);
  const category = await categoryBySlug(env.DB, String(url.searchParams.get('slug') || ''));
  if (!category) {
    return adminResponse({
      env,
      user,
      title: '没有找到',
      body: adminNotFound({ message: '这个分类已经不存在了。' }),
      status: 404,
    });
  }

  const [list, picker, owners, handles] = await Promise.all([
    productsByCategory(env.DB, category, ADMIN_PRODUCT_LIMIT),
    productPicker(env.DB),
    productCategoryIndex(env.DB),
    collectionHandles(env.DB),
  ]);
  return adminResponse({
    env,
    user,
    title: `${category.name} 中的商品`,
    body: categoryProductsView({
      category,
      list,
      picker,
      owners,
      collections: handles,
      symbol: currencySymbol(env),
      limit: ADMIN_PRODUCT_LIMIT,
    }),
    flash: adminNotice(url, PRODUCT_NOTICES),
  });
};

/** Reads the form and the category it was submitted from (`category_slug`). */
const productFormContext = async (request, env) => {
  const data = await readForm(request);
  const category = await categoryBySlug(env.DB, String(data.category_slug || ''));
  return { data, category };
};

const adminProductCreate = async (request, env) => {
  const { data, category } = await productFormContext(request, env);
  if (!category) return redirect('/admin/categories?error=missing');
  const { error, values } = normalizeProduct(data);
  if (error) return redirect(productScreen(category.slug, `error=product-${error}`));
  if (await productHandleTaken(env.DB, values.handle)) {
    return redirect(productScreen(category.slug, 'error=product-duplicate'));
  }

  const id = await createProduct(env.DB, values);
  if (!id) return redirect(productScreen(category.slug, 'error=product-missing'));
  // The new product lands in the category it was created from.
  await addProductToCategory(env.DB, category, id);
  return redirect(productScreen(category.slug, 'flash=product-created'));
};

const adminProductSave = async (request, env) => {
  const { data, category } = await productFormContext(request, env);
  if (!category) return redirect('/admin/categories?error=missing');
  const id = Number(data.id) || 0;
  if (!id) return redirect(productScreen(category.slug, 'error=product-missing'));
  const { error, values } = normalizeProduct(data);
  if (error) return redirect(productScreen(category.slug, `error=product-${error}`));
  if (await productHandleTaken(env.DB, values.handle, id)) {
    return redirect(productScreen(category.slug, 'error=product-duplicate'));
  }

  const saved = await updateProduct(env.DB, id, values);
  return redirect(productScreen(category.slug, saved ? 'flash=product-saved' : 'error=product-missing'));
};

/** Adds a product that is already in the catalogue to the category. */
const adminProductAdd = async (request, env) => {
  const { data, category } = await productFormContext(request, env);
  if (!category) return redirect('/admin/categories?error=missing');
  const id = Number(data.product_id) || 0;
  if (!id || !(await productById(env.DB, id))) return redirect(productScreen(category.slug, 'error=product-pick'));

  const added = await addProductToCategory(env.DB, category, id);
  if (added.ok) return redirect(productScreen(category.slug, 'flash=product-added'));
  return redirect(productScreen(category.slug, added.reason === 'taken' ? 'error=product-taken' : 'error=product-filter'));
};

/** Takes a product out of the category, leaving the product in the shop. */
const adminProductRemove = async (request, env) => {
  const { data, category } = await productFormContext(request, env);
  if (!category) return redirect('/admin/categories?error=missing');
  const id = Number(data.id) || 0;
  if (!id || !(await productById(env.DB, id))) return redirect(productScreen(category.slug, 'error=product-missing'));

  const removed = await removeProductFromCategory(env.DB, category, id);
  return redirect(productScreen(category.slug, removed ? 'flash=product-removed' : 'error=product-not-held'));
};

/** Deletes the product itself: shop, collections and carts. */
const adminProductDelete = async (request, env) => {
  const { data, category } = await productFormContext(request, env);
  if (!category) return redirect('/admin/categories?error=missing');
  const deleted = await deleteProduct(env.DB, data.id);
  return redirect(productScreen(category.slug, deleted ? 'flash=product-deleted' : 'error=product-missing'));
};

/**
 * Everything under /admin. Only /admin/login is public; every other screen and
 * action needs a valid session cookie or bounces back to the login page.
 */
const adminRoute = async (request, env, path, method) => {
  const isGet = method === 'GET' || method === 'HEAD';
  const isPost = method === 'POST';

  if (path === '/admin/login') {
    if (isPost) return adminLoginSubmit(request, env);
    return isGet ? adminLoginPage(request, env) : methodNotAllowed();
  }

  const user = await sessionUser(request, env);
  if (!user) return redirect(`/admin/login?next=${encodeURIComponent(path)}`);

  if (path === '/admin') return redirect('/admin/categories');
  if (path === '/admin/logout' && isPost) return adminLogout();
  if (path === '/admin/categories') {
    if (isPost) return adminCategoryCreate(request, env);
    return isGet ? adminCategoriesPage(request, env, user) : methodNotAllowed();
  }
  if (path === '/admin/categories/save') return isPost ? adminCategorySave(request, env) : methodNotAllowed();
  if (path === '/admin/categories/delete') return isPost ? adminCategoryDelete(request, env) : methodNotAllowed();
  if (path === '/admin/categories/move') return isPost ? adminCategoryMove(request, env) : methodNotAllowed();
  if (path === '/admin/home') {
    if (isPost) return methodNotAllowed();
    return isGet ? adminHomePage(request, env, user) : methodNotAllowed();
  }
  if (path === '/admin/home/announcement') return isPost ? adminAnnouncementSave(request, env) : methodNotAllowed();
  if (path === '/admin/home/hero') return isPost ? adminHeroSave(request, env) : methodNotAllowed();
  if (path === '/admin/home/product-row') return isPost ? adminProductRowSave(request, env) : methodNotAllowed();
  if (path === '/admin/home/link-grid') return isPost ? adminLinkGridSave(request, env) : methodNotAllowed();
  if (path === '/admin/home/image-banner') return isPost ? adminImageBannerSave(request, env) : methodNotAllowed();
  if (path === '/admin/home/section') return isPost ? adminSectionToggle(request, env) : methodNotAllowed();
  if (path === '/admin/footer') {
    if (isPost) return methodNotAllowed();
    return isGet ? adminFooterPage(request, env, user) : methodNotAllowed();
  }
  if (path === '/admin/footer/brand') return isPost ? adminFooterBrandSave(request, env) : methodNotAllowed();
  if (path === '/admin/footer/group') return isPost ? adminFooterGroupCreate(request, env) : methodNotAllowed();
  if (path === '/admin/footer/group/save') return isPost ? adminFooterGroupSave(request, env) : methodNotAllowed();
  if (path === '/admin/footer/group/delete') return isPost ? adminFooterGroupDelete(request, env) : methodNotAllowed();
  if (path === '/admin/footer/group/move') return isPost ? adminFooterGroupMove(request, env) : methodNotAllowed();
  if (path === '/admin/footer/link') return isPost ? adminFooterLinkCreate(request, env) : methodNotAllowed();
  if (path === '/admin/footer/link/save') return isPost ? adminFooterLinkSave(request, env) : methodNotAllowed();
  if (path === '/admin/footer/link/delete') return isPost ? adminFooterLinkDelete(request, env) : methodNotAllowed();
  if (path === '/admin/footer/link/move') return isPost ? adminFooterLinkMove(request, env) : methodNotAllowed();
  if (path === '/admin/categories/products') {
    return isGet ? adminCategoryProductsPage(request, env, user) : methodNotAllowed();
  }
  if (path === '/admin/products/create') return isPost ? adminProductCreate(request, env) : methodNotAllowed();
  if (path === '/admin/products/save') return isPost ? adminProductSave(request, env) : methodNotAllowed();
  if (path === '/admin/products/add') return isPost ? adminProductAdd(request, env) : methodNotAllowed();
  if (path === '/admin/products/remove') return isPost ? adminProductRemove(request, env) : methodNotAllowed();
  if (path === '/admin/products/delete') return isPost ? adminProductDelete(request, env) : methodNotAllowed();

  return adminResponse({
    env,
    user,
    title: '没有找到',
    body: adminNotFound({ message: `${path} 没有对应的后台页面。` }),
    status: 404,
  });
};

/* --------------------------------------------------------------------- cart ---- */

const readForm = async (request) => {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try {
      return (await request.json()) || {};
    } catch {
      return {};
    }
  }
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : '']));
};

const wantsJson = (request) =>
  (request.headers.get('accept') || '').includes('application/json') ||
  request.headers.get('x-requested-with') === 'fetch';

/** Returns the current cart plus any Set-Cookie header a new cart needs. */
const cartWithCookie = async (request, env, { create = false } = {}) => {
  const existing = cartId(request);
  const id = create || !existing ? await ensureCartId(env.DB, existing) : existing;
  const cart = await loadCart(env.DB, id);
  const headers = new Headers();
  if (id !== existing) setCartCookie(headers, id);
  return { cart, headers };
};

const cartResponse = (request, ctx, cart, headers, { fallback = '/cart' } = {}) => {
  if (wantsJson(request)) {
    return json(
      {
        ok: true,
        count: cart.count,
        subtotal: cart.subtotal,
        drawer: render(cartDrawerContent(ctx.settings, cart, ctx.symbol)),
      },
      200,
      headers
    );
  }
  headers.set('location', fallback);
  return new Response(null, { status: 303, headers });
};

const cartAddRoute = async (request, env, ctx) => {
  const data = await readForm(request);
  const productId = Number(data.product_id);
  if (!productId) return json({ ok: false, error: '缺少商品信息' }, 400);

  const { cart, headers } = await cartWithCookie(request, env, { create: true });
  const updated = await addItem(env.DB, cart.id, {
    productId,
    variantId: Number(data.variant_id) || 0,
    colour: String(data.colour || ''),
    qty: Number(data.qty) || 1,
  });
  return cartResponse(request, ctx, updated, headers, {
    fallback: String(data.return_to || request.headers.get('referer') || '/cart'),
  });
};

const cartChangeRoute = async (request, env, ctx) => {
  const data = await readForm(request);
  const { cart, headers } = await cartWithCookie(request, env, { create: true });
  const line = Number(data.line || data.item_id);
  const qty = Number(data.qty);
  const updated = Number.isFinite(qty) ? await setQty(env.DB, cart.id, line, qty) : cart;
  return cartResponse(request, ctx, updated, headers);
};

const cartRemoveRoute = async (request, env, ctx) => {
  const data = await readForm(request);
  const { cart, headers } = await cartWithCookie(request, env, { create: true });
  const updated = await removeItem(env.DB, cart.id, Number(data.line || data.item_id));
  return cartResponse(request, ctx, updated, headers);
};

const cartDrawerRoute = async (request, env, ctx) =>
  new Response(render(cartDrawerContent(ctx.settings, ctx.cart, ctx.symbol)), { headers: HTML_HEADERS });

/* ------------------------------------------------------------------- search ---- */

const searchRoute = async (request, env, ctx) => {
  const term = (new URL(request.url).searchParams.get('q') || '').trim();
  const products = await searchProducts(env.DB, term, 48);
  return view(ctx, {
    title: term ? `搜索：${term}` : '搜索',
    description: `${term} 的搜索结果`,
    body: searchPage({ term, products, symbol: ctx.symbol }),
    bodyClass: 'search',
  });
};

/* -------------------------------------------------------------- content pages ---- */

const pageRoute = async (request, env, ctx, handle) => {
  const list = await sections(env.DB, `page:${handle}`);
  if (!list.length) return notFound(ctx, '这个页面不存在。');
  const first = list.find((section) => section.type === 'page');
  return view(ctx, {
    title: (first && first.data.title) || handle,
    description: first && first.data.body ? first.data.body.replace(/<[^>]+>/g, ' ').slice(0, 160) : '',
    body: contentPage({ handle, list }),
  });
};

const newsletterRoute = async (request, env, ctx) => {
  const data = await readForm(request);
  const email = String(data.email || '').trim();
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  if (!valid) {
    return wantsJson(request)
      ? json({ ok: false, error: '请输入有效的邮箱地址。' }, 400)
      : redirect('/?subscribed=0');
  }
  await addSubscriber(env.DB, email);
  return wantsJson(request)
    ? json({ ok: true, message: env.NEWSLETTER_MESSAGE || '谢谢，您已成功订阅。' })
    : redirect(`${new URL(request.url).searchParams.get('return_to') || '/'}?subscribed=1`);
};

/* ---------------------------------------------------------------- checkout ---- */

const checkoutRoute = (request, env, ctx) =>
  view(ctx, {
    title: '结账',
    description: '安全结账',
    body: checkoutPage({ cart: ctx.cart, symbol: ctx.symbol }),
  });

const checkoutSubmitRoute = async (request, env, ctx) => {
  const data = await readForm(request);
  const cart = ctx.cart;
  if (!cart.items.length) return redirect('/cart');

  const lines = cart.items
    .map((item) => `${item.qty} x ${item.title}${item.variantName ? ` (${item.variantName})` : ''}${item.colour ? ` - ${item.colour}` : ''}`)
    .join('\n');
  await addEnquiry(env.DB, {
    name: String(data.name || ''),
    email: String(data.email || ''),
    message: [
      `小计：£${cart.subtotal.toFixed(2)}`,
      `地址：${data.address || ''}`,
      lines,
      data.message ? `备注：${data.message}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });
  if (cart.id) await clearCart(env.DB, cart.id);

  return redirect(`/checkout/thanks?name=${encodeURIComponent(String(data.name || ''))}`);
};

const thanksRoute = (request, env, ctx) =>
  view(ctx, {
    title: '谢谢',
    body: thankYouPage({ name: new URL(request.url).searchParams.get('name') || '' }),
  });

/* ------------------------------------------------------------------- media ---- */

const imageRoute = async (request, env) => {
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

  if (env.MEDIA) {
    const object = await env.MEDIA.get(key);
    if (object) {
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      if (request.headers.get('if-none-match') === object.httpEtag) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(request.method === 'HEAD' ? null : object.body, { headers });
    }
  }
  // Falls back to the copies in public/images (created by `npm run setup`).
  return env.ASSETS.fetch(request);
};

const robotsRoute = (request) => {
  const origin = new URL(request.url).origin;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /cart',
    'Disallow: /checkout',
    'Disallow: /admin',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};

const sitemapRoute = async (request, env) => {
  const origin = new URL(request.url).origin;
  const [list, cols, cats] = await Promise.all([
    productList(env.DB, { limit: 500 }),
    collections(env.DB),
    categories(env.DB),
  ]);
  const urls = [
    '/',
    '/products',
    '/collections',
    '/cart',
    '/search',
    ...cols.map((item) => `/collections/${item.handle}`),
    ...cats.filter((item) => item.href.startsWith('/category/')).map((item) => item.href),
    ...list.map((item) => `/products/${item.handle}`),
    '/pages/delivery',
    '/pages/returns',
    '/pages/about',
    '/pages/faq',
    '/pages/contact-details',
    '/pages/store-locator',
    '/pages/privacy',
    '/pages/terms-and-conditions',
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')}
</urlset>`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};

/* ------------------------------------------------------------------ router ---- */

const segment = (path, prefix) => decodeURIComponent(path.slice(prefix.length));

const route = async (request, env) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (path.startsWith('/images/')) return imageRoute(request, env);
  if (path === '/robots.txt') return robotsRoute(request);
  if (path === '/sitemap.xml') return sitemapRoute(request, env);

  // The admin area renders its own chrome and handles its own methods.
  if (path === '/admin' || path.startsWith('/admin/')) return adminRoute(request, env, path, method);

  if (method === 'POST') {
    const ctx = await chrome(request, env);
    switch (path) {
      case '/cart/add':
        return cartAddRoute(request, env, ctx);
      case '/cart/change':
        return cartChangeRoute(request, env, ctx);
      case '/cart/remove':
        return cartRemoveRoute(request, env, ctx);
      case '/newsletter':
        return newsletterRoute(request, env, ctx);
      case '/checkout':
        return checkoutSubmitRoute(request, env, ctx);
      default:
        return notFound(ctx);
    }
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return methodNotAllowed();
  }

  const ctx = await chrome(request, env);

  if (path === '/') return homeRoute(request, env, ctx);
  if (path === '/cart') {
    return view(ctx, {
      title: ctx.settings.cart_title || '购物车',
      body: cartPage({ cart: ctx.cart, settings: ctx.settings, symbol: ctx.symbol }),
    });
  }
  if (path === '/cart/drawer') return cartDrawerRoute(request, env, ctx);
  if (path === '/checkout') return checkoutRoute(request, env, ctx);
  if (path === '/checkout/thanks') return thanksRoute(request, env, ctx);
  if (path === '/search') return searchRoute(request, env, ctx);
  if (path === '/products') return allProductsRoute(request, env, ctx);
  if (path.startsWith('/products/')) return productRoute(request, env, ctx, segment(path, '/products/'));
  if (path === '/collections') return collectionsRoute(request, env, ctx);
  if (path.startsWith('/collections/')) return collectionRoute(request, env, ctx, segment(path, '/collections/'));
  if (path.startsWith('/category/')) return categoryRoute(request, env, ctx, segment(path, '/category/'));
  if (path.startsWith('/pages/')) return pageRoute(request, env, ctx, segment(path, '/pages/'));

  // Everything that is not a page is a static asset (css, js, images). The
  // Worker runs first because of `run_worker_first`, so fall through to them.
  if (env.ASSETS) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
  }

  return notFound(ctx);
};

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      console.error('Unhandled error', error && error.stack ? error.stack : error);
      const fallback = new Response(
        '<!doctype html><meta charset="utf-8"><title>出错了，请稍后再试</title><h1>出错了，请稍后再试</h1><p>请稍等片刻再重试。</p>',
        { status: 500, headers: HTML_HEADERS }
      );
      return fallback;
    }
  },
};



