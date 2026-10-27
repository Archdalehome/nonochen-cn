/**
 * Admin authentication and the category form rules.
 *
 * There is exactly one operator account. It defaults to `admin` / `admin` (as
 * requested) and can be overridden without a code change by setting the
 * `ADMIN_USER` / `ADMIN_PASSWORD` variables (or secrets) on the Worker:
 *
 *   npx wrangler secret put ADMIN_PASSWORD
 *
 * A successful login sets a stateless, HMAC signed cookie - the signing key is
 * derived from the password, so changing the password invalidates every open
 * session. Signatures are checked in constant time and have a 12 hour expiry.
 */
import { slugify } from './html.js';
import { readCookie, setCookie } from './cookies.js';

export const ADMIN_COOKIE = 'cf_admin';
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours, in seconds

export const CATEGORY_FILTERS = [
  { value: 'collection', label: '系列中的商品' },
  { value: 'tag', label: '标签匹配的商品' },
  { value: 'all', label: '全部商品' },
];

const encoder = new TextEncoder();

export const credentials = (env) => ({
  user: String(env.ADMIN_USER || 'admin'),
  password: String(env.ADMIN_PASSWORD || 'admin'),
});

/** True while the built-in fallback password is still in use. */
export const defaultPasswordInUse = (env) => !env.ADMIN_PASSWORD;

const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (value) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));

const sign = async (env, payload) => {
  const secret = `chen-furniture-admin:${env.ADMIN_SECRET || ''}:${credentials(env).password}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
};

/** Length independent comparison - never bails out on the first mismatch. */
const sameString = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export const verifyLogin = async (env, user, password) => {
  const expected = credentials(env);
  const okUser = sameString(String(user === undefined || user === null ? '' : user), expected.user);
  const okPassword = sameString(String(password === undefined || password === null ? '' : password), expected.password);
  return okUser && okPassword;
};

/** Headers carrying the signed session cookie for a fresh login. */
export const createSession = async (env, user) => {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${encodeURIComponent(user)}.${expires}`;
  const headers = new Headers();
  setCookie(headers, ADMIN_COOKIE, `${payload}.${await sign(env, payload)}`, { maxAge: SESSION_MAX_AGE });
  return headers;
};

/** Headers that clear the session cookie. */
export const destroySession = () => {
  const headers = new Headers();
  setCookie(headers, ADMIN_COOKIE, '', { maxAge: 0 });
  return headers;
};

/** The signed in user, or `''` when the request has no valid session. */
export const sessionUser = async (request, env) => {
  const raw = readCookie(request, ADMIN_COOKIE);
  if (!raw) return '';
  const parts = raw.split('.');
  if (parts.length !== 3) return '';
  const [user, expires, signature] = parts;
  if (!/^\d+$/.test(expires) || Number(expires) * 1000 < Date.now()) return '';
  try {
    fromBase64Url(signature);
  } catch {
    return '';
  }
  if (!sameString(signature, await sign(env, `${user}.${expires}`))) return '';
  try {
    return decodeURIComponent(user);
  } catch {
    return '';
  }
};

/** Only in-admin redirects, so `?next=` can never bounce to another host. */
export const safeNext = (value, fallback = '/admin/categories') => {
  const next = String(value || '');
  if (/^\/admin(\/[A-Za-z0-9\-/]*)?$/.test(next) && !next.startsWith('/admin/login')) return next;
  return fallback;
};

/* ------------------------------------------------- product form rules ---- */

export const PRODUCT_ERRORS = {
  title: '商品需要填写标题。',
  handle: '商品的别名（URL 别名）不合法：只能使用 a-z、0-9 和短横线，最多 80 个字符。',
  duplicate: '已有其他商品在使用这个别名。',
  price: '价格必须是数字，例如 249 或 249.99。',
  compare: '“原价”必须是数字，或者留空。',
  image: '商品需要图片：可以是 /images/b-bag-grey.png 这样的路径，也可以是完整的 https:// 链接。',
  missing: '这个商品已经不在商品库里了。',
  pick: '请先从列表中选择一个商品。',
  filter: '这个分类会列出全部商品，因此没有需要添加或移除的内容。',
};

/** "¥249.50", " 1,249.5 " and "249" all read as numbers; blanks as null, junk as NaN. */
const toPrice = (value) => {
  const raw = String(value === undefined || value === null ? '' : value)
    .replace(/[¥$€,\s]/g, '')
    .trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : NaN;
};

const flag = (data, name, fallback) => {
  const raw = data[name];
  if (raw === undefined) return fallback;
  return String(raw) === '0' ? 0 : 1;
};

/**
 * The product form posts its repeaters as `name="spec_label[]"` and friends, so
 * a field arrives either as a string (one row) or as an array (many rows). Both
 * shapes are read the same way here.
 */
const asList = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
};

const text = (value, max) => String(value === undefined || value === null ? '' : value).trim().slice(0, max);

/** A path on this site or a full URL - the same rule the single image field uses. */
const isMediaPath = (value) => value.startsWith('/') || /^https?:\/\//.test(value);

export const PRODUCT_LIMITS = { specs: 40, features: 40, sizes: 20, colours: 12, media: 24 };

/**
 * The four repeaters under the product fields: the specification table, the
 * feature bullets, the size/colour variants and the media gallery. Every row is
 * trimmed, empty rows are dropped and each list has a hard cap, so a paste of
 * 500 rows cannot fill the table.
 */
export const productDetails = (data) => {
  const specLabels = asList(data.spec_label);
  const specValues = asList(data.spec_value);
  const specs = [];
  for (let index = 0; index < specLabels.length && specs.length < PRODUCT_LIMITS.specs; index += 1) {
    const label = text(specLabels[index], 60);
    if (!label) continue;
    specs.push({ label, value: text(specValues[index], 200) });
  }

  const features = [];
  for (const row of asList(data.feature)) {
    const value = text(row, 120);
    if (!value) continue;
    if (features.length >= PRODUCT_LIMITS.features) break;
    features.push(value);
  }

  const sizeNames = asList(data.size_name);
  const sizePrices = asList(data.size_price);
  const sizes = [];
  for (let index = 0; index < sizeNames.length && sizes.length < PRODUCT_LIMITS.sizes; index += 1) {
    const name = text(sizeNames[index], 60);
    if (!name) continue;
    const price = toPrice(sizePrices[index]);
    sizes.push({ name, price: Number.isNaN(price) ? null : price });
  }

  const colourNames = asList(data.colour_name);
  // The row's swatch is `colour_swatch[]`; `colour_hex` is the single swatch of
  // the product itself, which is a different field on the same form.
  const colourHexes = asList(data.colour_swatch);
  const colours = [];
  for (let index = 0; index < colourNames.length && colours.length < PRODUCT_LIMITS.colours; index += 1) {
    const name = text(colourNames[index], 60);
    if (!name) continue;
    const hex = text(colourHexes[index], 20).toLowerCase();
    colours.push({ name, hex: /^#[0-9a-f]{3,8}$/.test(hex) ? hex : '#18181b' });
  }

  const mediaSources = asList(data.media_src);
  const mediaKinds = asList(data.media_kind);
  const media = [];
  for (let index = 0; index < mediaSources.length && media.length < PRODUCT_LIMITS.media; index += 1) {
    const src = text(mediaSources[index], 300);
    if (!src || !isMediaPath(src)) continue;
    media.push({ kind: String(mediaKinds[index] || 'image') === 'video' ? 'video' : 'image', src });
  }

  // `has_details` is written by the form itself: an older page, or a plain POST
  // from a script, must never wipe the rows a product already has.
  const hasDetails = String(data.has_details || '') === '1';
  // A product with no size at all cannot be bought: the storefront falls back to
  // a plain "add to basket" without a variant. A new product starts with one
  // default size, priced by the product's own price.
  if (hasDetails && !sizes.length) sizes.push({ name: '默认', price: null });

  return { hasDetails, specs, features, sizes, colours, media };
};

/**
 * A title in Chinese has no a-z/digit to slug from, so it needs a stable
 * fallback - the same title always lands on the same alias, which keeps a
 * re-saved form from renaming the product's URL.
 */
const fallbackHandle = (title) => {
  let hash = 5381
  for (const character of title) hash = (hash * 33 + character.codePointAt(0)) >>> 0
  return 'item-' + hash.toString(36)
};

/**
 * Validates one product form submission (create or edit). Returns
 * `{ error, message, values }` - `message` is ready for the admin UI.
 */
export const normalizeProduct = (data) => {
  const title = String(data.title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  let handle = String(data.handle || '')
    .trim()
    .toLowerCase();
  if (!handle) handle = slugify(title).slice(0, 80);
  if (!handle) handle = fallbackHandle(title);
  const image = String(data.image || '').trim().slice(0, 300);
  const price = toPrice(data.price);
  const compareAtPrice = toPrice(data.compare_at_price);
  const rawOrder = String(data.sort_order === undefined || data.sort_order === null ? '' : data.sort_order).trim();
  const sortOrder = /^\d{1,4}$/.test(rawOrder) ? Number(rawOrder) : null;

  const error = !title
    ? 'title'
    : !/^[a-z0-9][a-z0-9-]{0,79}$/.test(handle)
      ? 'handle'
      : price === null || Number.isNaN(price)
        ? 'price'
        : Number.isNaN(compareAtPrice)
          ? 'compare'
          : !image || !(image.startsWith('/') || /^https?:\/\//.test(image))
            ? 'image'
            : '';

  return {
    error,
    message: PRODUCT_ERRORS[error] || '',
    values: {
      title,
      handle,
      shortTitle: String(data.short_title || '').trim().slice(0, 80),
      price: Number.isNaN(price) ? 0 : price,
      compareAtPrice: Number.isNaN(compareAtPrice) ? null : compareAtPrice,
      priceFrom: flag(data, 'price_from', 0),
      badge: String(data.badge || '').trim().slice(0, 40),
      image,
      catHandle: String(data.cat_handle || '').trim().toLowerCase().slice(0, 60),
      catLabel: String(data.cat_label || '').trim().slice(0, 60),
      colourHex: (typeof data.colour_hex === 'string' ? data.colour_hex : '').trim().slice(0, 20) || '#5f6062',
      summary: String(data.summary || '').trim().slice(0, 300),
      description: String(data.description || '').trim().slice(0, 2000),
      // The collection a product belongs to comes from the category it was added
      // to (`addProductToCategory`), never from a form field.
      collectionHandle: '',
      soldOut: flag(data, 'sold_out', 0),
      isNew: flag(data, 'is_new', 0),
      inGrid: flag(data, 'show_in_home_grid', 1),
      sortOrder,
      seoTitle: String(data.seo_title || '').trim().slice(0, 120),
      seoDescription: String(data.seo_description || '').trim().slice(0, 300),
      ...productDetails(data),
    },
  };
};

/* -------------------------------------------------- category form rules ---- */

const CATEGORY_ERRORS = {
  name: '分类需要填写名称。',
  slug: '这个别名（URL 别名）不合法：只能使用 a-z、0-9 和短横线，最多 60 个字符。',
  url: '自定义链接必须以 “/” 开头（例如 /collections/outdoor-range），也可以留空。',
};

/**
 * Validates one category form submission. Returns `{ error, message, values }`
 * where `message` is ready to show in the admin UI.
 */
export const normalizeCategory = (data) => {
  const name = String(data.name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  let slug = String(data.slug || '')
    .trim()
    .toLowerCase();
  if (!slug) slug = slugify(name);
  const url = String(data.url || '').trim().slice(0, 200);
  const filterType = CATEGORY_FILTERS.some((filter) => filter.value === String(data.filter_type))
    ? String(data.filter_type)
    : 'tag';
  const filterValue = String(data.filter_value || '').trim().slice(0, 80);
  // An empty (or nonsense) order means "keep the current slot" / "append".
  const rawPosition = String(data.position === undefined || data.position === null ? '' : data.position).trim();
  const position = /^\d{1,3}$/.test(rawPosition) ? Number(rawPosition) : null;
  // The view posts `enabled=0` (hidden input) followed by `enabled=1` (checkbox),
  // so the last value wins and an unchecked box still arrives as "0".
  const enabled = String(data.enabled) === '0' ? 0 : 1;

  const error = !name ? 'name' : !/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug) ? 'slug' : url && !url.startsWith('/') ? 'url' : '';

  return {
    error,
    message: CATEGORY_ERRORS[error] || '',
    values: {
      name,
      slug,
      url,
      filterType,
      filterValue: filterType === 'all' ? '' : filterValue || slug,
      position,
      enabled,
    },
  };
};

/* --------------------------------------------------- home content rules ---- */

/**
 * The announcement bar and the homepage hero. Both already render on the
 * storefront (`views/partials.js` and `views/home.js`); these rules only police
 * what the admin forms may store, so the renderers keep finding what they expect.
 *
 * `views/home.js` reads a slide as: video, video_mobile, poster, poster_mobile,
 * title, text, url, button { label, url } - anything else in the payload (button
 * colour and style, the carousel timing) is left exactly as it was.
 */
const HOME_ERRORS = {
  'bar-text': '公告栏需要填写文字，否则只会剩下一条空荡荡的蓝色横条。',
  'bar-icon': '公告栏图标必须是以 /images/icon-delivery.svg 这样的路径，或完整的 https:// 链接。',
  'hero-video': '首页主视觉需要视频：可以是 /images/hero-outdoor-desktop.mp4 这样的路径、完整的 https:// 链接，或者上传一个文件。',
  'hero-media': '静态图必须是以 /images/hero-outdoor-poster-desktop.jpg 这样的路径，或完整的 https:// 链接。',
  'hero-link': '链接必须以 “/” 开头（例如 /collections/outdoor-range），或者是完整的 https:// 链接。',
  'hero-button': '按钮需要同时填写文字和链接；如果想让整张幻灯片可点，请清空按钮文字。',
  'hero-slide': '这张幻灯片已经不属于首页主视觉了，请刷新页面后重试。',
};

const clip = (value, length) =>
  String(value === undefined || value === null ? '' : value)
    .trim()
    .slice(0, length);

/** A path on this site (`/images/...`) or a full http(s) URL. */
const onSite = (value) => value.startsWith('/') || /^https?:\/\//.test(value);

/** The announcement bar form: the message and the little icon in front of it. */
export const normalizeAnnouncement = (data) => {
  const text = clip(data.announcement_text, 160).replace(/\s+/g, ' ');
  const icon = clip(data.announcement_icon, 300);
  const error = !text ? 'text' : icon && !onSite(icon) ? 'icon' : '';
  return {
    error,
    message: HOME_ERRORS[`bar-${error}`] || '',
    values: { announcement_text: text, announcement_icon: icon },
  };
};

/**
 * One hero slide form. `stored` is the section's current `data`, so the fields
 * the form does not carry are copied through untouched and only the slide the
 * form names is rewritten. Returns the whole payload to write back.
 */
export const normalizeHero = (data, stored = {}) => {
  const slides = Array.isArray(stored.slides) ? stored.slides : [];
  const index = Number(data.slide);
  const current = Number.isInteger(index) && index >= 0 && index < slides.length ? slides[index] : null;
  if (!current) return { error: 'slide', message: HOME_ERRORS['hero-slide'], values: null };

  const video = clip(data.video, 300);
  const videoMobile = clip(data.video_mobile, 300);
  const poster = clip(data.poster, 300);
  const posterMobile = clip(data.poster_mobile, 300);
  const title = clip(data.title, 120);
  const copy = clip(data.text, 300);
  const link = clip(data.link, 300);
  const buttonLabel = clip(data.button_label, 60);
  const buttonUrl = clip(data.button_url, 300);

  const error = !video || !onSite(video)
    ? 'video'
    : [videoMobile, poster, posterMobile].some((value) => value && !onSite(value))
      ? 'media'
      : [link, buttonUrl].some((value) => value && !onSite(value))
        ? 'link'
        : buttonLabel && !buttonUrl
          ? 'button'
          : '';
  if (error) return { error, message: HOME_ERRORS[`hero-${error}`], values: null };

  const next = {
    ...current,
    video,
    // A phone with no file of its own would show an empty hero, so the desktop
    // video stands in. The renderer still writes the same two <video> tags.
    video_mobile: videoMobile || video,
    poster,
    poster_mobile: posterMobile || poster,
    title,
    text: copy,
    url: link,
  };
  // The button only exists while it has a label; without one the whole slide is
  // the link (which is how views/home.js renders it too).
  if (buttonLabel) next.button = { ...(current.button || {}), label: buttonLabel, url: buttonUrl };
  else delete next.button;

  return {
    error: '',
    message: '',
    values: { ...stored, slides: slides.map((slide, position) => (position === index ? next : slide)) },
  };
};

/* -------------------------------------------- homepage section rules ---- */

/**
 * The product rows under the hero, the tiles of the link grid and the image
 * banners are rows in `sections` that `views/home.js` renders; /admin/home
 * edits them. These rules only police what those forms may store, and copy
 * every field a form does not carry through untouched, so saving one field can
 * never drop another.
 *
 * A product row reads one product switch - the same toggles the product form
 * writes (`is_new`, `price_from`, `show_in_home_grid`, see `productList` in
 * `lib/db.js`). A row that still lists collections keeps its `pickers`, which
 * this screen does not edit.
 *
 * The keys are the query values /admin/home reports errors with, so
 * `src/index.js` turns them straight into notices.
 */
export const SECTION_ERRORS = {
  'row-heading': '商品行需要填写标题，例如“新品推荐”。',
  'row-source': '请选择这一商品行列出什么：勾选了“新品”的商品、勾选了“热销”的商品，或勾选了“首页推荐”的商品。',
  'row-link': '链接必须以 “/” 开头（例如 /collections/outdoor-range），或者是完整的 https:// 链接。',
  'grid-label': '图块需要填写覆盖在图块上的文字，例如“选购户外”。',
  'grid-url': '图块需要填写链接：以 “/” 开头（例如 /collections/outdoor-range），或者是完整的 https:// 链接。',
  'grid-image': '图块需要背景图片：可以是 /images/banner-shop-outdoor.jpg 这样的路径，也可以是完整的 https:// 链接。',
  'grid-height': '图块高度必须是带单位的数字，例如 60vh 或 420px。',
  'grid-item': '这个图块已经不属于当前区块了，请刷新页面后重试。',
  'banner-image': '横幅需要图片：可以是 /images/banner-facts.jpg 这样的路径，也可以是完整的 https:// 链接。',
  'banner-position': '图片位置必须使用百分比或关键词，例如 88% 86% 或 center 20%。',
  'banner-link': '链接必须以 “/” 开头（例如 /collections/b-blanket），或者是完整的 https:// 链接。',
  'banner-button': '按钮需要同时填写文字和链接；如果只显示文案、不要按钮，请清空按钮文字。',
  'banner-colour': '按钮颜色必须是十六进制色值，例如 #18181B。',
};

/** What one product row can list. The first three read a product switch. */
export const PRODUCT_ROW_SOURCES = [
  { value: 'new', label: '勾选了“新品”的商品' },
  { value: 'best', label: '勾选了“热销”的商品' },
  { value: 'grid', label: '勾选了“首页推荐”的商品（全部商品）' },
  { value: 'collection', label: '为此商品行选定的系列' },
];

/** The button classes `public/css/site.css` styles; anything else renders flat. */
export const BANNER_BUTTONS = ['btn-primary', 'btn-white', 'btn-light', 'btn-outline-primary', 'btn-outline-secondary'];

const TILE_HEIGHT = /^\d{1,4}(px|vh|rem|em|%)$/;
// `views/home.js` writes this straight into a `style` attribute, so anything
// that could close the attribute (quotes, semicolons) is refused.
const IMAGE_POSITION = /^[0-9A-Za-z.%\s-]{1,60}$/;
const HEX_COLOUR = /^#[0-9a-fA-F]{3,8}$/;

/** One product row: its heading, what it lists and the "view all" button. */
export const normalizeProductRow = (data, stored = {}) => {
  const heading = clip(data.heading, 80).replace(/\s+/g, ' ');
  const subheading = clip(data.subheading, 200).replace(/\s+/g, ' ');
  const source = String(data.source || '');
  const viewAllLabel = clip(data.view_all_label, 40);
  const viewAllUrl = clip(data.view_all_url, 300);
  const error = !heading
    ? 'heading'
    : !PRODUCT_ROW_SOURCES.some((item) => item.value === source)
      ? 'source'
      : viewAllLabel && !onSite(viewAllUrl)
        ? 'link'
        : '';
  if (error) return { error, message: SECTION_ERRORS[`row-${error}`], values: null };

  const next = { ...stored, heading, subheading, source };
  if (viewAllLabel) next.view_all = { ...(stored.view_all || {}), label: viewAllLabel, url: viewAllUrl };
  else delete next.view_all;
  return { error: '', message: '', values: next };
};

/** One tile of the link grid: the words over it, where it links and its image. */
export const normalizeLinkGridItem = (data, stored = {}) => {
  const items = Array.isArray(stored.items) ? stored.items : [];
  const index = Number(data.item);
  const current = Number.isInteger(index) && index >= 0 && index < items.length ? items[index] : null;
  if (!current) return { error: 'item', message: SECTION_ERRORS['grid-item'], values: null };

  const label = clip(data.label, 60).replace(/\s+/g, ' ');
  const url = clip(data.url, 300);
  const image = clip(data.image, 300);
  const height = clip(data.height, 20);
  const error = !label
    ? 'label'
    : !onSite(url)
      ? 'url'
      : !onSite(image)
        ? 'image'
        : height && !TILE_HEIGHT.test(height)
          ? 'height'
          : '';
  if (error) return { error, message: SECTION_ERRORS[`grid-${error}`], values: null };

  const next = { ...current, label, url, image };
  if (height) next.height = height;
  // An empty height means the renderer's own default (60vh).
  else delete next.height;
  return {
    error: '',
    message: '',
    values: { ...stored, items: items.map((item, position) => (position === index ? next : item)) },
  };
};

/** One image banner: its image, the copy over it and the button under it. */
export const normalizeImageBanner = (data, stored = {}) => {
  const image = clip(data.image, 300);
  const objectPosition = clip(data.object_position, 60);
  const title = clip(data.title, 120);
  const text = clip(data.text, 600);
  const buttonLabel = clip(data.button_label, 60);
  const buttonUrl = clip(data.button_url, 300);
  const buttonColour = clip(data.button_color, 20);
  const buttonStyle = BANNER_BUTTONS.includes(String(data.button_style)) ? String(data.button_style) : '';
  const error = !onSite(image)
    ? 'image'
    : objectPosition && !IMAGE_POSITION.test(objectPosition)
      ? 'position'
      : buttonUrl && !onSite(buttonUrl)
        ? 'link'
        : buttonLabel && !buttonUrl
          ? 'button'
          : buttonColour && !HEX_COLOUR.test(buttonColour)
            ? 'colour'
            : '';
  if (error) return { error, message: SECTION_ERRORS[`banner-${error}`], values: null };

  const next = { ...stored, image, title, text };
  if (objectPosition) next.object_position = objectPosition;
  else delete next.object_position;
  // The button only exists while it has a label; without one `views/home.js`
  // renders the copy block on its own.
  if (buttonLabel) {
    const was = stored.button || {};
    next.button = {
      ...was,
      label: buttonLabel,
      url: buttonUrl,
      style: buttonStyle || was.style || 'btn-primary',
      color: buttonColour || was.color || '#18181B',
    };
  } else delete next.button;

  return { error: '', message: '', values: next };
};

/* ------------------------------------------------------------ footer rules ---- */

/**
 * The columns at the bottom of every page are rows in `menu_items`
 * (location = 'footer'), which `views/footer.js` renders and /admin/footer
 * edits. These rules only police what the forms may store: a heading, the words
 * of a link and a link that goes somewhere.
 */
const FOOTER_ERRORS = {
  heading: '页脚栏需要填写标题，例如“公司”。',
  label: '页脚链接需要填写站点上显示的文字。',
  url: '页脚链接必须以 “/” 开头（例如 /pages/about），或者是完整的 https:// 链接或 mailto: 地址。',
};

/** A path on this site, a link to another site, or a mailto: address. */
const linkable = (value) => value.startsWith('/') || /^(https?:\/\/|mailto:)/i.test(value);

/** An empty or nonsense order means "leave it in the slot it is in". */
const positionValue = (value) => {
  const raw = String(value === undefined || value === null ? '' : value).trim();
  return /^\d{1,3}$/.test(raw) ? Number(raw) : null;
};

/** One footer column: its heading, its place in the row and whether it shows. */
export const normalizeFooterGroup = (data) => {
  const label = clip(data.label, 40).replace(/\s+/g, ' ');
  const error = !label ? 'heading' : '';
  return {
    error,
    message: FOOTER_ERRORS[error] || '',
    values: { label, position: positionValue(data.position), enabled: String(data.enabled) === '0' ? 0 : 1 },
  };
};

/** One footer link: the words a shopper reads and the page they land on. */
export const normalizeFooterLink = (data) => {
  const label = clip(data.label, 60).replace(/\s+/g, ' ');
  const url = clip(data.url, 300);
  const error = !label ? 'label' : !linkable(url) ? 'url' : '';
  return {
    error,
    message: FOOTER_ERRORS[error] || '',
    values: { label, url, position: positionValue(data.position), enabled: String(data.enabled) === '0' ? 0 : 1 },
  };
};

/**
 * The company block that opens the footer: the logo beside the name and the line
 * under both. Unlike the columns it is not a `menu_items` row - the three parts are
 * `settings` rows (`footer_logo`, `site_name`, `brand_line`), which is what
 * /admin/footer writes and `views/footer.js` renders.
 *
 * The keys are the query values /admin/footer reports errors with, so
 * `src/index.js` turns them straight into notices.
 */
export const FOOTER_BRAND_ERRORS = {
  'brand-name': '公司信息区块需要填写商家名称，例如 Chen Furniture。',
  'brand-logo': 'Logo 必须是以 /images/footer/logo.png 这样的路径，或完整的 https:// 链接（也可以留空）。',
};

/**
 * The company block form: the logo (optional - without one the name stands on its
 * own), the name with the logo beside it and the description under both. A name is
 * required because the header, the page titles and `views/footer.js` all read the
 * same setting.
 */
export const normalizeFooterBrand = (data = {}) => {
  const name = clip(data.site_name, 60).replace(/\s+/g, ' ');
  const line = clip(data.brand_line, 300);
  const logo = clip(data.footer_logo, 300);
  const error = !name ? 'brand-name' : logo && !onSite(logo) ? 'brand-logo' : '';
  if (error) return { error, message: FOOTER_BRAND_ERRORS[error], values: null };
  return { error: '', message: '', values: { site_name: name, brand_line: line, footer_logo: logo } };
};

/* -------------------------------------------------------------- uploads ---- */

/**
 * What the hero may be given, and which extension each media type gets. The
 * extension comes from the declared MIME type, never from the file name - the
 * same rule `scripts/upload-media.mjs` follows with `--content-type`.
 */
const MEDIA_TYPES = {
  video: {
    label: '视频',
    extensions: ['mp4', 'webm', 'mov'],
    mime: { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' },
  },
  image: {
    label: '图片',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
    mime: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' },
  },
};

/** Hero videos run to a few MB; Worker requests start failing around 100 MB. */
export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Turns one uploaded file into the R2 key it will live under. The `images/`
 * prefix is what the `/images/*` route reads, and the timestamp keeps a replaced
 * video from being served out of the year long cache of the one it replaced.
 *
 * Every upload lands in the folder of the form it came from - hero videos in
 * `images/hero/`, the footer logo in `images/footer/` - so the objects stay easy
 * to find next to the files `scripts/upload-media.mjs` pushes.
 */
export const mediaKey = (file, kind = 'video', stamp = Date.now(), folder = 'hero') => {
  const table = MEDIA_TYPES[kind] || MEDIA_TYPES.video;
  const name = slugify(String(file.name || '').replace(/\.[^.]+$/, '')) || folder;
  const declared = String(file.type || '').toLowerCase();
  const extension = table.mime[declared];
  if (!extension) {
    return { error: 'type', path: '', message: `${table.label}上传仅支持以下格式：${table.extensions.join(', ')}。` };
  }
  if (!file.size) return { error: 'empty', path: '', message: '这个文件是空的。' };
  if (file.size > MEDIA_MAX_BYTES) {
    return { error: 'size', path: '', message: `这个文件有 ${Math.round(file.size / 1048576)} MB，超过了 25 MB 的上限。` };
  }
  const key = `images/${folder}/${stamp}-${name}.${extension}`;
  // `contentType` is what R2 hands back with the object, so the browser gets a
  // real video/mp4 (the extension is only part of the key).
  return { error: '', kind, key, path: `/${key}`, contentType: declared, message: '' };
};
