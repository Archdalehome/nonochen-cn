import { html, money, safe } from '../lib/html.js';
import { BANNER_BUTTONS, CATEGORY_FILTERS, PRODUCT_ROW_SOURCES } from '../lib/admin.js';
import { announcementBar } from './partials.js';

/* ---------------------------------------------------------------- shell ---- */

/**
 * `/admin` renders its own (chrome free) document so the editorial screens stay
 * small: Bootstrap + site.css for the typography, no storefront navigation.
 * `noindex` is repeated in the response headers by the router.
 */
export const adminDocument = ({ siteName, title, body }) => html`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${title} | ${siteName} 管理后台</title>
    <link rel="icon" href="/images/logo.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/css/bootstrap.min.css">
    <link rel="stylesheet" href="/css/site.css">
  </head>
  <body class="admin bg-body d-flex flex-column min-vh-100">
    ${body}
    <script src="/js/site.js" defer></script>
  </body>
</html>`;

export const adminHeader = ({ user, siteName }) => html`
  <header class="admin-header bg-primary text-white py-2">
    <div class="container d-flex align-items-center gap-3 flex-wrap">
      <a href="/admin/categories" class="heading-font text-uppercase text-white text-decoration-none fs-6">${siteName} 管理后台</a>
      <nav class="ms-auto d-flex align-items-center gap-3 fs-7">
        <a href="/admin/home" class="text-white text-decoration-none">首页</a>
        <a href="/admin/footer" class="text-white text-decoration-none">页脚</a>
        <a href="/admin/categories" class="text-white text-decoration-none">分类</a>
        <a href="/" class="text-white text-decoration-none" target="_blank" rel="noopener">查看店铺</a>
        <span class="text-white-50 d-none d-md-inline">当前登录：${user}</span>
        <form method="post" action="/admin/logout" class="mb-0">
          <button class="btn btn-sm btn-outline-light rounded px-3" type="submit">退出登录</button>
        </form>
      </nav>
    </div>
  </header>`;

const notice = ({ kind, message }) =>
  html`<div class="alert alert-${kind} rounded-3 fs-7 mb-4" role="status">${message}</div>`;

/** Full admin screen: header, optional notices, then the page body. */
export const adminPage = ({ user, siteName, title, body, flash = null, warning = '' }) =>
  adminDocument({
    siteName,
    title,
    body: html`${adminHeader({ user, siteName })}
      <main class="flex-grow-1 py-4">
        <div class="container">
          ${flash ? notice(flash) : ''}
          ${warning ? notice({ kind: 'warning', message: warning }) : ''}
          ${body}
        </div>
      </main>`,
  });

/* ---------------------------------------------------------------- login ---- */

export const loginView = ({ siteName, error = '', next = '' }) =>
  adminDocument({
    siteName,
    title: '登录',
    body: html`
      <main class="admin-login flex-grow-1 d-flex flex-column justify-content-center align-items-center px-3 py-5">
        <div class="card border-0 shadow-sm rounded-3 w-100" style="max-width: 24rem;">
          <div class="card-body p-4 p-md-5">
            <h1 class="heading-font text-uppercase h5 mb-1">${siteName}</h1>
            <p class="text-secondary fs-8 mb-4">登录后即可管理店铺。</p>
            ${error ? notice({ kind: 'danger', message: error }) : ''}
            <form method="post" action="/admin/login" class="d-flex flex-column gap-3">
              ${next ? html`<input type="hidden" name="next" value="${next}">` : ''}
              <div>
                <label class="form-label fs-8 text-uppercase mb-1" for="admin-username">用户名</label>
                <input class="form-control" id="admin-username" name="username" autocomplete="username" required autofocus>
              </div>
              <div>
                <label class="form-label fs-8 text-uppercase mb-1" for="admin-password">密码</label>
                <input class="form-control" id="admin-password" name="password" type="password" autocomplete="current-password" required>
              </div>
              <button class="btn btn-primary rounded w-100 py-2 mt-2" type="submit">登录</button>
            </form>
          </div>
        </div>
        <a class="fs-8 text-secondary mt-4" href="/">返回店铺首页</a>
      </main>`,
  });

/* ------------------------------------------------------------ categories ---- */

const FILTER_LABEL = Object.fromEntries(CATEGORY_FILTERS.map((filter) => [filter.value, filter.label]));

const filterSelect = ({ name, value, id }) => html`
  <select class="form-select form-select-sm" id="${id}" name="${name}">
    ${CATEGORY_FILTERS.map(
      (filter) => html`<option value="${filter.value}" ${filter.value === value ? safe('selected') : ''}>${filter.label}</option>`
    )}
  </select>`;

/**
 * Hidden first, checkbox second: the last value in the body wins, so an
 * unchecked box still posts a 0.
 */
const toggleField = ({ id, name, label, checked }) => html`
  <input type="hidden" name="${name}" value="0">
  <div class="form-check form-switch mb-0">
    <input class="form-check-input" type="checkbox" role="switch" name="${name}" value="1" id="${id}" ${checked ? safe('checked') : ''}>
    <label class="form-check-label fs-8 text-uppercase" for="${id}">${label}</label>
  </div>`;

const enabledToggle = ({ id, checked, hidden = false }) =>
  toggleField({ id, name: 'enabled', checked, label: hidden ? '在页头显示' : '显示' });

const filterValueField = (item, id) => html`
  <label class="form-label fs-8 text-uppercase mb-1" for="${id}">筛选值</label>
  <input class="form-control form-control-sm" id="${id}" name="filter_value" value="${item.filterValue || ''}" maxlength="80"
         placeholder="${item.filterType === 'collection' ? '系列 handle' : item.filterType === 'all' ? '不使用' : '标签，例如 outdoor'}">`;

/**
 * A `/collections/<handle>` link that points at a collection nobody created
 * shows a 404 to shoppers, so the products added here stay invisible. Returns
 * the missing handle, or '' when the link is fine or `collections` is unknown.
 */
const missingCollection = (href, collections) => {
  if (!Array.isArray(collections)) return '';
  const match = /^\/collections\/([^/?#]+)/.exec(String(href || ''));
  if (!match) return '';
  const handle = decodeURIComponent(match[1]);
  return collections.includes(handle) ? '' : handle;
};

const missingCollectionNote = (item, collections) => {
  const handle = missingCollection(item.href, collections);
  if (!handle) return '';
  return html`<span class="text-danger">
    &middot; <strong>该系列不存在</strong>，此链接会 404，你在这里添加的内容也不会显示在网站上。
    清空自定义链接即可使用 <code>/category/${item.slug}</code>，或填写一个已存在的系列 handle。
  </span>`;
};

const categoryRow = (item, index, count, collections) => html`
  <div class="card border-0 shadow-sm rounded-3 mb-3">
    <form method="post" action="/admin/categories/save">
      <input type="hidden" name="id" value="${item.id}">
      <div class="card-body row g-3">
        <div class="col-12 col-lg-4">
          <label class="form-label fs-8 text-uppercase mb-1" for="name-${item.id}">名称</label>
          <input class="form-control form-control-sm" id="name-${item.id}" name="name" value="${item.name}" maxlength="80" required>
        </div>
        <div class="col-6 col-lg-2">
          <label class="form-label fs-8 text-uppercase mb-1" for="slug-${item.id}">别名</label>
          <input class="form-control form-control-sm" id="slug-${item.id}" name="slug" value="${item.slug}" maxlength="60">
        </div>
        <div class="col-6 col-lg-3">
          <label class="form-label fs-8 text-uppercase mb-1" for="url-${item.id}">自定义链接</label>
          <input class="form-control form-control-sm" id="url-${item.id}" name="url" value="${item.url || ''}" maxlength="200"
                 placeholder="/category/${item.slug}">
        </div>
        <div class="col-6 col-lg-1">
          <label class="form-label fs-8 text-uppercase mb-1" for="position-${item.id}">排序</label>
          <input class="form-control form-control-sm" id="position-${item.id}" name="position" type="number" min="0" max="999"
                 value="${item.position}">
        </div>
        <div class="col-6 col-lg-2 d-flex align-items-end">
          ${enabledToggle({ id: `enabled-${item.id}`, checked: item.enabled })}
        </div>
        <div class="col-12 col-lg-4">
          <label class="form-label fs-8 text-uppercase mb-1" for="filter-${item.id}">展示商品</label>
          ${filterSelect({ id: `filter-${item.id}`, name: 'filter_type', value: item.filterType })}
        </div>
        <div class="col-6 col-lg-4">${filterValueField(item, `filter-value-${item.id}`)}</div>
        <div class="col-6 col-lg-4 d-flex align-items-end justify-content-lg-end gap-2">
          <button class="btn btn-primary btn-sm rounded px-3" type="submit">保存</button>
          <a class="btn btn-outline-dark btn-sm rounded px-3" href="${item.href}" target="_blank" rel="noopener">预览</a>
        </div>
      </div>
    </form>
    <div class="card-footer bg-white border-top-0 d-flex flex-wrap align-items-center justify-content-between gap-2 pt-0">
      <span class="fs-8 text-secondary">
        链接到 <code>${item.href}</code> &middot;
        ${item.filterType === 'all' ? '全部商品' : html`${FILTER_LABEL[item.filterType]}：<code>${item.filterValue}</code>`}
        &middot; <a href="/admin/categories/products?slug=${item.slug}">管理此分类下的商品</a>
        ${missingCollectionNote(item, collections)}
      </span>
      <div class="d-flex align-items-center gap-2">
        <form method="post" action="/admin/categories/move" class="mb-0">
          <input type="hidden" name="id" value="${item.id}">
          <input type="hidden" name="direction" value="up">
          <button class="btn btn-outline-secondary btn-sm rounded px-2" type="submit" ${index === 0 ? safe('disabled') : ''}
                  aria-label="上移 ${item.name}">&uarr;</button>
        </form>
        <form method="post" action="/admin/categories/move" class="mb-0">
          <input type="hidden" name="id" value="${item.id}">
          <input type="hidden" name="direction" value="down">
          <button class="btn btn-outline-secondary btn-sm rounded px-2" type="submit" ${index === count - 1 ? safe('disabled') : ''}
                  aria-label="下移 ${item.name}">&darr;</button>
        </form>
        <form method="post" action="/admin/categories/delete" class="mb-0"
              data-admin-confirm="删除“${item.name}”？该链接会立即从页头消失。">
          <input type="hidden" name="id" value="${item.id}">
          <button class="btn btn-outline-danger btn-sm rounded px-3" type="submit">删除</button>
        </form>
      </div>
    </div>
  </div>`;

export const categoriesView = ({ list = [], collections } = {}) => html`
  ${list.some((item) => missingCollection(item.href, collections))
    ? html`<div class="alert alert-warning rounded-3" role="alert">
        <strong>部分页头链接指向尚不存在的系列。</strong>
        这些链接会打开 404 页面，因此你添加到该分类的商品无法在网站上显示。请清空自定义链接（该分类将使用自己的
        <code>/category/&lt;slug&gt;</code> 页面），或将其指向店铺中已有的系列。
      </div>`
    : ''}
  <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
    <div>
      <h1 class="heading-font text-uppercase h4 mb-1">商品分类</h1>
      <p class="text-secondary fs-7 mb-0">
        这些链接按下方顺序排列在页头，紧挨 Logo 和购物车。
      </p>
    </div>
    <span class="fs-7 text-secondary">${list.length} 个分类</span>
  </div>

  <section class="card border-0 shadow-sm rounded-3 mb-4">
    <div class="card-body">
      <h2 class="h6 text-uppercase mb-3">新增分类</h2>
      <form method="post" action="/admin/categories" class="row g-3">
        <div class="col-12 col-lg-4">
          <label class="form-label fs-8 text-uppercase mb-1" for="new-name">名称</label>
          <input class="form-control form-control-sm" id="new-name" name="name" maxlength="80" required placeholder="户外系列">
        </div>
        <div class="col-6 col-lg-2">
          <label class="form-label fs-8 text-uppercase mb-1" for="new-slug">别名</label>
          <input class="form-control form-control-sm" id="new-slug" name="slug" maxlength="60" placeholder="自动">
        </div>
        <div class="col-6 col-lg-3">
          <label class="form-label fs-8 text-uppercase mb-1" for="new-url">自定义链接</label>
          <input class="form-control form-control-sm" id="new-url" name="url" maxlength="200" placeholder="选填，例如 /products">
        </div>
        <div class="col-12 col-lg-3">
          <label class="form-label fs-8 text-uppercase mb-1" for="new-filter">展示商品</label>
          ${filterSelect({ id: 'new-filter', name: 'filter_type', value: 'tag' })}
        </div>
        <div class="col-12 col-lg-4">${filterValueField({ filterType: 'tag', filterValue: '' }, 'new-filter-value')}</div>
        <div class="col-12 col-lg-4 d-flex align-items-end">
          ${enabledToggle({ id: 'new-enabled', checked: true, hidden: true })}
        </div>
        <div class="col-12 col-lg-4 d-flex align-items-end justify-content-lg-end">
          <button class="btn btn-primary btn-sm rounded px-4" type="submit">添加分类</button>
        </div>
      </form>
    </div>
  </section>

  ${list.length
    ? list.map((item, index) => categoryRow(item, index, list.length, collections))
    : html`<div class="card border-0 shadow-sm rounded-3">
        <div class="card-body text-center py-5">
          <h2 class="h5 mb-2">暂无分类</h2>
          <p class="text-secondary fs-7 mb-0">在上方添加一个，它会出现在每个页面的顶部。</p>
        </div>
      </div>`}
`;

/* ----------------------------------------------------- category products ---- */

/** One labelled input. `attrs` is a literal attribute string the caller writes by hand. */
const textField = ({ id, name, label, value = '', col = 'col-6 col-lg-2', type = 'text', attrs = '' }) => html`
  <div class="${col}">
    <label class="form-label fs-8 text-uppercase mb-1" for="${id}">${label}</label>
    <input type="${type}" class="form-control form-control-sm" id="${id}" name="${name}" value="${value}" ${safe(attrs)}>
  </div>`;

const textAreaField = ({ id, name, label, value = '', rows = 2, col = 'col-12', attrs = '' }) => html`
  <div class="${col}">
    <label class="form-label fs-8 text-uppercase mb-1" for="${id}">${label}</label>
    <textarea class="form-control form-control-sm" id="${id}" name="${name}" rows="${rows}" ${safe(attrs)}>${value}</textarea>
  </div>`;

/** One row of a repeater: the inputs the caller passes, then the shared controls. */
const repeatRow = (body) => html`
  <div class="row g-2 align-items-center" data-repeat-row draggable="true">
    ${body}
    <div class="col-12 col-sm-auto d-flex gap-1 justify-content-end">
      <button type="button" class="btn btn-outline-secondary btn-sm rounded px-2" data-repeat-move="up" aria-label="上移">↑</button>
      <button type="button" class="btn btn-outline-secondary btn-sm rounded px-2" data-repeat-move="down" aria-label="下移">↓</button>
      <button type="button" class="btn btn-outline-danger btn-sm rounded px-2" data-repeat-remove aria-label="删除这一行">删除</button>
    </div>
  </div>`;

/**
 * A repeater block: a list of rows, one "add" button and the empty row the
 * browser clones. Rows are posted as `name="..."[]` arrays in DOM order, so the
 * arrows and the drag handle decide the stored order as well.
 */
const repeater = ({ title, hint, rows, template, addLabel }) => html`
  <div class="col-12" data-repeat>
    <div class="border rounded-3 p-3">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <div>
          <h3 class="fs-8 text-uppercase mb-0">${title}</h3>
          ${hint ? html`<p class="fs-8 text-secondary mb-0">${hint}</p>` : ''}
        </div>
        <button type="button" class="btn btn-outline-dark btn-sm rounded px-3" data-repeat-add>${addLabel}</button>
      </div>
      <div class="d-flex flex-column gap-2" data-repeat-list>${rows}</div>
      <template data-repeat-template>${template}</template>
    </div>
  </div>`;

const smallInput = ({ name, value = '', col = 'col-6', placeholder = '', type = 'text', attrs = '' }) => html`
  <div class="${col}">
    <input type="${type}" class="form-control form-control-sm" name="${name}" value="${value}" placeholder="${placeholder}" ${safe(attrs)}>
  </div>`;

/** The spec table, feature bullets, size/colour variants and the media gallery. */
const detailRepeaters = (item, prefix, { mediaBound = false } = {}) => {
  const specs = item.specs || [];
  const features = item.features || [];
  const sizes = item.sizes || [];
  const colours = item.colours || [];
  const media = item.media || [];
  const isNew = prefix === 'new';

  const specRow = (row = {}) =>
    repeatRow(html`
      ${smallInput({ name: 'spec_label[]', value: row.label || '', col: 'col-12 col-sm-4', placeholder: '尺寸' })}
      ${smallInput({ name: 'spec_value[]', value: row.value || '', col: 'col-12 col-sm-7', placeholder: '长 62 × 宽 62 × 高 40 cm' })}
    `);
  const featureRow = (value = '') =>
    repeatRow(smallInput({ name: 'feature[]', value, col: 'col-12 col-sm-11', placeholder: '头层牛皮，手感越用越润' }));
  const sizeRow = (row = {}) =>
    repeatRow(html`
      ${smallInput({ name: 'size_name[]', value: row.name || '', col: 'col-12 col-sm-6', placeholder: '中号' })}
      ${smallInput({ name: 'size_price[]', value: row.price === null || row.price === undefined ? '' : row.price, col: 'col-12 col-sm-5', placeholder: '留空则用商品价格', type: 'number', attrs: 'min="0" step="0.01"' })}
    `);
  const colourRow = (row = {}) =>
    repeatRow(html`
      ${smallInput({ name: 'colour_name[]', value: row.name || '', col: 'col-12 col-sm-6', placeholder: '焦糖棕' })}
      ${smallInput({ name: 'colour_swatch[]', value: row.hex || '#8b5e3c', col: 'col-12 col-sm-5', placeholder: '#8b5e3c' })}
    `);
  const mediaRow = (row = {}) =>
    repeatRow(html`
      <div class="col-12 col-sm-3">
        <select class="form-select form-select-sm" name="media_kind[]">
          <option value="image" ${row.kind === 'video' ? '' : safe('selected')}>图片</option>
          <option value="video" ${row.kind === 'video' ? safe('selected') : ''}>视频</option>
        </select>
      </div>
      ${smallInput({ name: 'media_src[]', value: row.src || '', col: 'col-12 col-sm-8', placeholder: '/images/b-bag-grey-2.png' })}
    `);

  return html`
    ${repeater({
      title: '规格表',
      hint: '前台商品页「规格参数」里逐行显示，例如 尺寸 / 材质 / 颜色。',
      addLabel: '添加一行',
      rows: specs.length ? specs.map(specRow) : specRow(),
      template: specRow(),
    })}
    ${repeater({
      title: '卖点',
      hint: '一行一条，显示在商品页标题之后。',
      addLabel: '添加一条',
      rows: features.length ? features.map(featureRow) : featureRow(),
      template: featureRow(),
    })}
    ${repeater({
      title: '尺寸',
      hint: isNew ? '新建商品默认给一条尺寸，不要留空；价格留空表示用商品价格。' : '每个尺寸可以有自己的价格；价格留空表示用商品价格。',
      addLabel: '添加尺寸',
      rows: sizes.length ? sizes.map(sizeRow) : sizeRow({ name: '默认', price: '' }),
      template: sizeRow(),
    })}
    ${repeater({
      title: '颜色',
      hint: '前台商品页的颜色圆点，色值写 #RRGGBB。',
      addLabel: '添加颜色',
      rows: colours.length ? colours.map(colourRow) : colourRow(),
      template: colourRow(),
    })}
    ${repeater({
      title: '图片 / 视频图集',
      hint: mediaBound
        ? '按顺序显示在商品页左栏；可以填站内路径，也可以在下面选文件上传。上面的「图片」字段仍是列表页封面。'
        : '当前没有绑定 R2，只能填站内路径或完整链接，不能上传。',
      addLabel: '添加一项',
      rows: media.length ? media.map(mediaRow) : mediaRow(),
      template: mediaRow(),
    })}
    ${mediaBound
      ? html`<div class="col-12">
          <label class="form-label fs-8 text-uppercase mb-1" for="${prefix}-media-upload">上传图片或视频（可多选，追加到图集末尾）</label>
          <input class="form-control form-control-sm" id="${prefix}-media-upload" type="file" name="media_upload[]" multiple accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime">
        </div>`
      : ''}
    <input type="hidden" name="has_details" value="1">
  `;
};

/** The fields the create and the edit forms share; `prefix` keeps the ids unique. */
const productFields = (item, prefix, options = {}) => html`
  ${textField({ id: `${prefix}-title`, name: 'title', label: '标题', value: item.title, col: 'col-12 col-lg-4', attrs: 'maxlength="120" required' })}
  ${textField({ id: `${prefix}-slug`, name: 'handle', label: '别名', value: item.handle || '', attrs: 'maxlength="80" placeholder="自动，例如 b-bag-grey"' })}
  ${textField({ id: `${prefix}-price`, name: 'price', label: '价格', value: item.price === undefined ? '' : item.price, type: 'number', attrs: 'min="0" step="0.01" required' })}
  ${textField({ id: `${prefix}-compare`, name: 'compare_at_price', label: '原价', value: item.compare_at_price === undefined || item.compare_at_price === null ? '' : item.compare_at_price, type: 'number', attrs: 'min="0" step="0.01"' })}
  ${textField({ id: `${prefix}-badge`, name: 'badge', label: '角标', value: item.badge || '', attrs: 'maxlength="40" placeholder="热销"' })}
  ${textField({ id: `${prefix}-image`, name: 'image', label: '图片', value: item.image || '', col: 'col-12 col-lg-4', attrs: 'maxlength="300" required placeholder="/images/b-bag-grey.png"' })}
  ${textField({ id: `${prefix}-cat-handle`, name: 'cat_handle', label: '标签 handle', value: item.cat_handle || '', attrs: 'maxlength="60" placeholder="outdoor"' })}
  ${textField({ id: `${prefix}-cat-label`, name: 'cat_label', label: '标签名称', value: item.cat_label || '', attrs: 'maxlength="60" placeholder="户外"' })}
  ${textField({ id: `${prefix}-swatch`, name: 'colour_hex', label: '色卡', value: item.colour_hex || '#5f6062', attrs: 'maxlength="20"' })}
  ${textField({ id: `${prefix}-order`, name: 'sort_order', label: '排序', value: item.sort_order === undefined || item.sort_order === null ? '' : item.sort_order, type: 'number', attrs: 'min="0" max="9999"' })}
  ${textAreaField({ id: `${prefix}-summary`, name: 'summary', label: '摘要', value: item.summary || '', attrs: 'maxlength="300" placeholder="显示在标题下方的一行文字"' })}
  ${textAreaField({ id: `${prefix}-description`, name: 'description', label: '商品描述', value: item.description || '', rows: 3, attrs: 'maxlength="2000"' })}
  <div class="col-6 col-lg-3 d-flex align-items-end">${toggleField({ id: `${prefix}-sold-out`, name: 'sold_out', label: '已售罄', checked: Boolean(item.sold_out) })}</div>
  <div class="col-6 col-lg-3 d-flex align-items-end">${toggleField({ id: `${prefix}-new`, name: 'is_new', label: '新品', checked: Boolean(item.is_new) })}</div>
  <div class="col-6 col-lg-3 d-flex align-items-end">${toggleField({ id: `${prefix}-from`, name: 'price_from', label: '热销', checked: Boolean(item.price_from) })}</div>
  <div class="col-6 col-lg-3 d-flex align-items-end">${toggleField({ id: `${prefix}-grid`, name: 'show_in_home_grid', label: '首页推荐', checked: Boolean(item.show_in_home_grid) })}</div>
  ${textField({ id: `${prefix}-seo-title`, name: 'seo_title', label: 'SEO 标题', value: item.seo_title || '', col: 'col-12 col-lg-6', attrs: 'maxlength="120"' })}
  ${textField({ id: `${prefix}-seo-description`, name: 'seo_description', label: 'SEO 描述', value: item.seo_description || '', col: 'col-12 col-lg-6', attrs: 'maxlength="300"' })}
  ${detailRepeaters(item, prefix, options)}
`;

/** One product in the list: a summary, the editor for its fields and its actions. */
const productEditor = (item, { category, canLink, symbol, owners, mediaBound = false }) => {
  // A product lives in one category, so flag any it is listed in besides this one.
  const alsoIn = ((owners && owners.get(item.id)) || []).filter((owner) => owner.id !== category.id);

  return html`
  <article class="card border-0 shadow-sm rounded-3 mb-3">
    <div class="card-header bg-white d-flex flex-wrap align-items-center gap-3">
      <img src="${item.image}" alt="" width="48" height="48" class="rounded object-fit-contain bg-body-secondary">
      <div class="flex-grow-1">
        <h3 class="fs-6 mb-1">${item.title}</h3>
        <p class="fs-8 text-secondary mb-0">
          <code>${item.handle}</code> &middot; ${money(item.price, symbol)}
          ${item.collection_handle ? html` &middot; 系列 <code>${item.collection_handle}</code>` : ''}
        </p>
      </div>
      <div class="d-flex flex-wrap align-items-center gap-2">
        ${alsoIn.length
          ? html`<span class="badge text-bg-warning text-dark border">同时属于 ${alsoIn.map((owner) => owner.name).join(', ')}</span>`
          : ''}
        ${item.soldOut ? html`<span class="badge text-bg-dark">已售罄</span>` : ''}
        ${item.badge ? html`<span class="badge text-bg-light text-dark border">${item.badge}</span>` : ''}
        ${item.inGrid ? '' : html`<span class="badge text-bg-light text-secondary border">未在首页展示</span>`}
      </div>
    </div>
    <form method="post" action="/admin/products/save" enctype="multipart/form-data">
      <input type="hidden" name="id" value="${item.id}">
      <input type="hidden" name="category_slug" value="${category.slug}">
      <div class="card-body row g-3">${productFields(item, `p-${item.id}`, { mediaBound })}</div>
      <div class="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span class="fs-8 text-secondary">商品 #${item.id}</span>
        <button class="btn btn-primary btn-sm rounded px-4" type="submit">保存商品</button>
      </div>
    </form>
    <div class="card-footer bg-white border-top-0 d-flex flex-wrap justify-content-between align-items-center gap-2">
      <a class="fs-8" href="/products/${item.handle}" target="_blank" rel="noopener">查看商品页面</a>
      <div class="d-flex flex-wrap align-items-center gap-2">
        ${canLink
          ? html`<form method="post" action="/admin/products/remove" class="mb-0"
                       data-admin-confirm="将“${item.title}”从${category.name}中移除？商品本身仍会保留在店铺中。">
              <input type="hidden" name="id" value="${item.id}">
              <input type="hidden" name="category_slug" value="${category.slug}">
              <button class="btn btn-outline-secondary btn-sm rounded px-3" type="submit">从该分类移除</button>
            </form>`
          : ''}
        <form method="post" action="/admin/products/delete" class="mb-0"
              data-admin-confirm="彻底删除“${item.title}”？它将从店铺、所有系列和所有购物车中消失。">
          <input type="hidden" name="id" value="${item.id}">
          <input type="hidden" name="category_slug" value="${category.slug}">
          <button class="btn btn-outline-danger btn-sm rounded px-3" type="submit">删除商品</button>
        </form>
      </div>
    </div>
  </article>`;
};

/**
 * `/admin/categories/products` - the products one category lists, with the
 * forms that add, edit, unlink and delete them. Collection and tag categories
 * get the add/remove controls; an "all products" category only gets the editors.
 */
export const categoryProductsView = ({
  category,
  list = [],
  picker = [],
  owners,
  collections,
  symbol = '¥',
  limit = 200,
  mediaBound = false,
}) => {
  const listed = new Set(list.map((item) => item.id));
  const ownerOf = (item) => ((owners && owners.get(item.id)) || []).find((owner) => owner.id !== category.id) || null;
  // A product lives in one category at a time, so this screen only edits the
  // products this category holds: anything another category owns is hidden here
  // (never deleted - it keeps its row and stays editable on its own screen). An
  // "all products" category matches on nothing, so it holds everything and
  // nothing is hidden there.
  const hidden = category.filterType === 'all' ? [] : list.filter((item) => ownerOf(item));
  const visible = hidden.length ? list.filter((item) => !hidden.includes(item)) : list;
  // A product lives in one category at a time, so anything another category
  // holds is offered as a locked (disabled) entry that names its category.
  const candidates = picker.filter((item) => !listed.has(item.id) && !ownerOf(item));
  const held = picker.filter((item) => !listed.has(item.id) && ownerOf(item));
  const canLink = category.filterType !== 'all' && Boolean(category.filterValue);
  const missing = missingCollection(category.href, collections);
  const note =
    category.filterType === 'collection'
      ? html`列出<strong>该系列中的每件商品</strong> <code>${category.filterValue}</code>。添加后会把商品关联到该系列，
          并把它的<strong>标签 handle / 标签名称</strong>设为本分类；移除时这两项也会一并清除——无论哪种操作，
          商品本身都会保留在店铺中。`
      : category.filterType === 'tag'
        ? html`列出<strong>所有带有该标签的商品</strong> <code>${category.filterValue}</code>。添加后会把商品的
            <strong>标签 handle / 标签名称</strong>设为本分类，商品因此归入这里；移除时会再次清除这两项——
            无论哪种操作，商品本身都会保留在店铺中。`
        : html`列出<strong>全部商品</strong>，因此无需添加或移除——新建的商品会立即出现在这里。`;

  return html`
    <p class="fs-8 mb-2">
      <a class="text-secondary" href="/admin/categories">商品分类</a> / ${category.name}
    </p>
    ${missing
      ? html`<div class="alert alert-warning rounded-3" role="alert">
          <strong>该分类链接到 <code>/collections/${missing}</code>，但没有系列使用这个 handle。</strong>
          顾客点击页头链接会看到 404，因此下方商品只会显示在该分类自己的页面上。请清空自定义链接，改为链接到
          <code>/category/${category.slug}</code>，或指向一个已存在的系列。
        </div>`
      : ''}
    ${hidden.length
      ? html`<div class="alert alert-secondary rounded-3 fs-7" role="alert">
          <strong>此列表原本显示的 ${hidden.length} 件商品现在属于其他分类</strong>，因此在此隐藏；本页面只编辑
          ${category.name} 中的商品。没有任何商品被删除——请到商品所属分类的页面中编辑它。
        </div>`
      : ''}
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <h1 class="heading-font text-uppercase h4 mb-1">${category.name} 中的商品</h1>
        <p class="text-secondary fs-7 mb-0">${note}</p>
        <p class="text-secondary fs-8 mb-0">
          一件商品同一时间只属于一个分类——由它的标签 handle 和标签名称决定——因此已被其他分类占用的商品会在下方
          选择器中锁定。<code>从该分类移除</code>后即可重新选择。
        </p>
        <p class="text-secondary fs-8 mb-0">
          <strong>新品</strong>、<strong>热销</strong>和<strong>首页推荐</strong>三个开关会分别把商品放入对应的
          首页栏目。
        </p>
      </div>
      <div class="d-flex flex-wrap align-items-center gap-2">
        <a class="btn btn-outline-dark btn-sm rounded px-3" href="${category.href}" target="_blank" rel="noopener">预览</a>
        <a class="btn btn-outline-secondary btn-sm rounded px-3" href="/admin/categories">返回分类</a>
      </div>
    </div>

    <section class="card border-0 shadow-sm rounded-3 mb-4">
      <div class="card-body">
        <h2 class="h6 text-uppercase mb-3">添加商品</h2>
        <div class="row g-4">
          <div class="col-12 col-lg-6">
            ${canLink
              ? html`<form method="post" action="/admin/products/add" class="row g-2 align-items-end">
                  <input type="hidden" name="category_slug" value="${category.slug}">
                  <div class="col-12 col-sm-8">
                    <label class="form-label fs-8 text-uppercase mb-1" for="add-product">店铺中已有的商品</label>
                    <select class="form-select form-select-sm" id="add-product" name="product_id" required>
                      <option value="">选择商品&hellip;</option>
                      ${candidates.map((item) => html`<option value="${item.id}">${item.title}</option>`)}
                      ${held.length
                        ? html`<optgroup label="已在其他分类中">
                            ${held.map(
                              (item) => html`<option value="${item.id}" disabled>${item.title} - ${ownerOf(item).name}</option>`
                            )}
                          </optgroup>`
                        : ''}
                    </select>
                    <p class="fs-8 text-secondary mb-0 mt-1">
                      ${candidates.length} 件商品不在此分类中。
                      ${held.length
                        ? html`另有 ${held.length} 件商品已属于其他分类——请先将它们从原分类中移除。`
                        : ''}
                    </p>
                  </div>
                  <div class="col-12 col-sm-4">
                    <button class="btn btn-primary btn-sm rounded px-3 w-100" type="submit">添加到分类</button>
                  </div>
                </form>`
              : html`<p class="fs-7 text-secondary mb-0">店铺中的所有商品都已列在这里。</p>`}
          </div>
          <div class="col-12 col-lg-6">
            <details class="border rounded-3 p-3">
              <summary class="fs-7 text-uppercase">创建全新商品</summary>
              <form method="post" action="/admin/products/create" class="row g-3 mt-2" enctype="multipart/form-data">
                <input type="hidden" name="category_slug" value="${category.slug}">
                ${productFields({ sold_out: 0, is_new: 0, price_from: 0, show_in_home_grid: 1, price: '' }, 'new', { mediaBound })}
                <div class="col-12 d-flex justify-content-end">
                  <button class="btn btn-primary btn-sm rounded px-4" type="submit">新建商品</button>
                </div>
              </form>
            </details>
          </div>
        </div>
      </div>
    </section>

    <div class="d-flex flex-wrap justify-content-between align-items-center mb-2">
      <h2 class="h6 text-uppercase mb-0">已列出 ${visible.length} 件商品</h2>
      ${visible.length >= limit
        ? html`<span class="fs-8 text-secondary">仅显示前 ${limit} 件——店铺前台读取的是同一份列表。</span>`
        : ''}
      ${hidden.length
        ? html`<span class="fs-8 text-secondary">已隐藏 ${hidden.length} 件——它们属于其他分类。</span>`
        : ''}
    </div>

    ${visible.length
      ? visible.map((item) => productEditor(item, { category, canLink, symbol, owners, mediaBound }))
      : html`<div class="card border-0 shadow-sm rounded-3">
          <div class="card-body text-center py-5">
            <h2 class="h5 mb-2">暂无可编辑的商品</h2>
            <p class="text-secondary fs-7 mb-0">
              ${hidden.length
                ? html`此列表原本显示的商品现在都属于其他分类，因此被隐藏。请在上方添加商品，或前往商品所属分类的页面。`
                : html`在上方添加一件商品，它会立即出现在店铺前台。`}
            </p>
          </div>
        </div>`}
  `;
};

export const adminNotFound = ({ message = '该管理页面不存在。' }) => html`
  <div class="card border-0 shadow-sm rounded-3">
    <div class="card-body text-center py-5">
      <h1 class="heading-font text-uppercase h4 mb-2">页面不存在</h1>
      <p class="text-secondary fs-7 mb-3">${message}</p>
      <a class="btn btn-primary btn-sm rounded px-4" href="/admin/categories">返回分类</a>
    </div>
  </div>`;

/* --------------------------------------------------- home page content ---- */

/**
 * One media field: the path the storefront renders, plus a file picker that
 * replaces it. Both post with the same form, so without JavaScript the file is
 * simply stored and the field is updated in one save.
 */
const mediaField = ({ id, name, label, value = '', file, accept, hint, upload = true, col = 'col-12 col-lg-6' }) => html`
  <div class="${col}">
    <label class="form-label fs-8 text-uppercase mb-1" for="${id}">${label}</label>
    <input class="form-control form-control-sm" id="${id}" name="${name}" value="${value}" maxlength="300" placeholder="${hint}">
    ${upload
      ? html`<input class="form-control form-control-sm mt-1 fs-8" type="file" name="${file}" accept="${accept}" aria-label="${label}：选择要上传的文件">`
      : ''}
  </div>`;

/** One hero slide: what the site shows now, and the fields that change it. */
const heroSlide = ({ slide, index, section, media }) => html`
  <form method="post" action="/admin/home/hero" enctype="multipart/form-data" class="card border-0 shadow-sm rounded-3 mb-4">
    <input type="hidden" name="section_id" value="${section.id}">
    <input type="hidden" name="slide" value="${index}">
    <div class="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2">
      <h2 class="h6 text-uppercase mb-0">第 ${index + 1} 张</h2>
      <span class="fs-8 text-secondary">${slide.video || '无视频'}</span>
    </div>
    <div class="card-body row g-3">
      <div class="col-12 col-lg-4">
        <p class="form-label fs-8 text-uppercase mb-1">当前站点显示</p>
        ${slide.video
          ? html`<video class="w-100 rounded bg-body-secondary" style="max-height: 12rem" src="${slide.video}" poster="${slide.poster || ''}" controls muted loop playsinline preload="metadata"></video>`
          : html`<p class="fs-8 text-secondary mb-0">这张轮播没有视频，店铺前台会跳过它。</p>`}
        <p class="fs-8 text-secondary mt-1 mb-0">
          ${slide.title ? html`标题：<strong>${slide.title}</strong>。 ` : '无标题。'}
          ${slide.button && slide.button.label
            ? html`按钮：<strong>${slide.button.label}</strong> &rarr; <code>${slide.button.url}</code>。`
            : html`无按钮${slide.url ? html`，整张轮播链接到 <code>${slide.url}</code>` : ''}。`}
        </p>
      </div>
      <div class="col-12 col-lg-8 row g-3">
        ${mediaField({
          id: `slide-${index}-video`,
          name: 'video',
          label: '视频 — 桌面端',
          value: slide.video || '',
          file: 'video_file',
          accept: 'video/mp4,video/webm,video/quicktime',
          hint: '/images/hero-outdoor-desktop.mp4',
          upload: media,
        })}
        ${mediaField({
          id: `slide-${index}-video-mobile`,
          name: 'video_mobile',
          label: '视频 — 手机端',
          value: slide.video_mobile || '',
          file: 'video_mobile_file',
          accept: 'video/mp4,video/webm,video/quicktime',
          hint: '留空：手机端也使用桌面端视频',
          upload: media,
        })}
        ${mediaField({
          id: `slide-${index}-poster`,
          name: 'poster',
          label: '封面图 — 桌面端',
          value: slide.poster || '',
          file: 'poster_file',
          accept: 'image/jpeg,image/png,image/webp,image/avif',
          hint: '视频加载时显示，选填',
          upload: media,
        })}
        ${mediaField({
          id: `slide-${index}-poster-mobile`,
          name: 'poster_mobile',
          label: '封面图 — 手机端',
          value: slide.poster_mobile || '',
          file: 'poster_mobile_file',
          accept: 'image/jpeg,image/png,image/webp,image/avif',
          hint: '选填',
          upload: media,
        })}
        ${textField({ id: `slide-${index}-title`, name: 'title', label: '视频上的标题', value: slide.title || '', col: 'col-12 col-lg-6', attrs: 'maxlength="120"' })}
        ${textField({ id: `slide-${index}-text`, name: 'text', label: '标题下方的文字', value: slide.text || '', col: 'col-12 col-lg-6', attrs: 'maxlength="300"' })}
        ${textField({ id: `slide-${index}-link`, name: 'link', label: '整张轮播的链接', value: slide.url || '', col: 'col-12 col-lg-6', attrs: 'maxlength="300" placeholder="/collections/outdoor-range - 没有按钮时使用"' })}
        ${textField({ id: `slide-${index}-button-label`, name: 'button_label', label: '按钮文字', value: (slide.button && slide.button.label) || '', col: 'col-6 col-lg-3', attrs: 'maxlength="60" placeholder="选购户外系列"' })}
        ${textField({ id: `slide-${index}-button-url`, name: 'button_url', label: '按钮链接', value: (slide.button && slide.button.url) || '', col: 'col-6 col-lg-3', attrs: 'maxlength="300" placeholder="/collections/outdoor-range"' })}
      </div>
    </div>
    <div class="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
      <span class="fs-8 text-secondary">
        ${media
          ? '选择的文件会存入 R2，上方的路径会更新为该文件。'
          : '未绑定 MEDIA 存储桶，因此只能保存路径或 URL。'}
        按钮样式和轮播节奏保持不变——这两项无法在此编辑。
      </span>
      <button class="btn btn-primary btn-sm rounded px-4" type="submit">保存轮播</button>
    </div>
  </form>`;
/**
 * The switch that takes one homepage block off the site. It posts on its own, so
 * hiding a block never rewrites its content - and its position in a card header
 * keeps it out of the block's own `<form>` (forms cannot nest).
 */
const sectionToggle = ({ section }) => html`
  <form method="post" action="/admin/home/section" class="mb-0 d-flex align-items-center gap-2">
    <input type="hidden" name="section_id" value="${section.id}">
    ${toggleField({ id: `section-${section.id}-enabled`, name: 'enabled', label: '在首页显示', checked: section.enabled !== false })}
    <button class="btn btn-outline-secondary btn-sm rounded px-3" type="submit">保存</button>
  </form>`;

/** One product row under the hero: its wording and which products it lists. */
const productRowPanel = ({ section }) => {
  const source = section.data.source || '';
  const viewAll = section.data.view_all || {};
  return html`
    <div class="card border-0 shadow-sm rounded-3 mb-3">
      <div class="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h3 class="h6 text-uppercase mb-0">${section.name}</h3>
        <div class="d-flex flex-wrap align-items-center gap-3">
          <span class="fs-8 text-secondary">排序 ${section.position}</span>
          ${sectionToggle({ section })}
        </div>
      </div>
      <form method="post" action="/admin/home/product-row">
        <input type="hidden" name="section_id" value="${section.id}">
        <div class="card-body row g-3">
          ${textField({ id: `row-${section.id}-heading`, name: 'heading', label: '标题', value: section.data.heading || '', col: 'col-12 col-lg-4', attrs: 'maxlength="80" required' })}
          ${textField({ id: `row-${section.id}-subheading`, name: 'subheading', label: '标题下方的文字', value: section.data.subheading || '', col: 'col-12 col-lg-4', attrs: 'maxlength="200"' })}
          <div class="col-12 col-lg-4">
            <label class="form-label fs-8 text-uppercase mb-1" for="row-${section.id}-source">列出</label>
            <select class="form-select form-select-sm" id="row-${section.id}-source" name="source">
              ${PRODUCT_ROW_SOURCES.map(
                (item) => html`<option value="${item.value}" ${item.value === source ? safe('selected') : ''}>${item.label}</option>`
              )}
            </select>
          </div>
          ${textField({ id: `row-${section.id}-view-label`, name: 'view_all_label', label: '按钮文字', value: viewAll.label || '', attrs: 'maxlength="40" placeholder="留空：不显示按钮"' })}
          ${textField({ id: `row-${section.id}-view-url`, name: 'view_all_url', label: '按钮链接', value: viewAll.url || '', col: 'col-6 col-lg-4', attrs: 'maxlength="300" placeholder="/collections/outdoor-range"' })}
        </div>
        <div class="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span class="fs-8 text-secondary">
            ${source === 'collection'
              ? html`该栏目仍在按选择器数据列出系列。请改用上方三个商品开关之一，让它由商品驱动。`
              : html`商品通过其分类页面加入该栏目：勾选<strong>新品</strong>、<strong>热销</strong>或<strong>首页推荐</strong>。`}
          </span>
          <button class="btn btn-primary btn-sm rounded px-4" type="submit">保存栏目</button>
        </div>
      </form>
    </div>`;
};



/** One tile of the link grid: the words over it, where it links and its image. */
const linkGridPanel = ({ section, media }) => {
  const items = Array.isArray(section.data.items) ? section.data.items : [];
  return html`
    <div class="card border-0 shadow-sm rounded-3 mb-3">
      <div class="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h3 class="h6 text-uppercase mb-0">${section.name}</h3>
        <div class="d-flex flex-wrap align-items-center gap-3">
          <span class="fs-8 text-secondary">${items.length} 个模块，排序 ${section.position}</span>
          ${sectionToggle({ section })}
        </div>
      </div>
      <div class="card-body row g-3">
        ${items.map(
          (item, index) => html`
            <form method="post" action="/admin/home/link-grid" enctype="multipart/form-data" class="col-12 col-lg-6">
              <div class="border rounded-3 p-3 h-100">
                <input type="hidden" name="section_id" value="${section.id}">
                <input type="hidden" name="item" value="${index}">
                <p class="form-label fs-8 text-uppercase mb-2">
                  模块 ${index + 1}<span class="text-secondary text-lowercase"> &middot; ${item.image || '无图片'}</span>
                </p>
                <div class="row g-2">
                  ${mediaField({ id: `grid-${section.id}-${index}-image`, name: 'image', label: '图片', value: item.image || '', file: 'image_file', accept: 'image/jpeg,image/png,image/webp,image/avif', hint: '/images/banner-shop-outdoor.jpg', upload: media, col: 'col-12' })}
                  ${textField({ id: `grid-${section.id}-${index}-label`, name: 'label', label: '名称', value: item.label || '', col: 'col-12 col-sm-6', attrs: 'maxlength="60" required' })}
                  ${textField({ id: `grid-${section.id}-${index}-url`, name: 'url', label: '链接', value: item.url || '', col: 'col-12 col-sm-6', attrs: 'maxlength="300" required placeholder="/collections/outdoor-range"' })}
                  ${textField({ id: `grid-${section.id}-${index}-height`, name: 'height', label: '高度', value: item.height || '', col: 'col-6', attrs: 'maxlength="20" placeholder="留空：60vh"' })}
                  <div class="col-6 d-flex align-items-end justify-content-end">
                    <button class="btn btn-primary btn-sm rounded px-4" type="submit">保存模块</button>
                  </div>
                </div>
              </div>
            </form>`
        )}
      </div>
    </div>`;
};

/** One image banner: its image, the copy over it and the button under it. */
const imageBannerPanel = ({ section, media }) => {
  const button = section.data.button || {};
  return html`
    <div class="card border-0 shadow-sm rounded-3 mb-3">
      <div class="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h3 class="h6 text-uppercase mb-0">${section.name}</h3>
        <div class="d-flex flex-wrap align-items-center gap-3">
          <span class="fs-8 text-secondary">排序 ${section.position}</span>
          ${sectionToggle({ section })}
        </div>
      </div>
      <form method="post" action="/admin/home/image-banner" enctype="multipart/form-data">
        <input type="hidden" name="section_id" value="${section.id}">
        <div class="card-body row g-3">
          ${mediaField({ id: `banner-${section.id}-image`, name: 'image', label: '图片', value: section.data.image || '', file: 'image_file', accept: 'image/jpeg,image/png,image/webp,image/avif', hint: '/images/banner-facts.jpg', upload: media })}
          ${textField({ id: `banner-${section.id}-position`, name: 'object_position', label: '图片位置', value: section.data.object_position || '', col: 'col-12 col-lg-6', attrs: 'maxlength="60" placeholder="88% 86% - 留空则居中"' })}
          ${textField({ id: `banner-${section.id}-title`, name: 'title', label: '标题', value: section.data.title || '', col: 'col-12 col-lg-6', attrs: 'maxlength="120"' })}
          ${textAreaField({ id: `banner-${section.id}-text`, name: 'text', label: '文案', value: section.data.text || '', rows: 3, col: 'col-12 col-lg-6', attrs: 'maxlength="600"' })}
          ${textField({ id: `banner-${section.id}-button-label`, name: 'button_label', label: '按钮文字', value: button.label || '', col: 'col-12 col-lg-3', attrs: 'maxlength="60" placeholder="留空：不显示按钮"' })}
          ${textField({ id: `banner-${section.id}-button-url`, name: 'button_url', label: '按钮链接', value: button.url || '', col: 'col-12 col-lg-3', attrs: 'maxlength="300" placeholder="/collections/b-blanket"' })}
          <div class="col-12 col-lg-3">
            <label class="form-label fs-8 text-uppercase mb-1" for="banner-${section.id}-button-style">按钮样式</label>
            <select class="form-select form-select-sm" id="banner-${section.id}-button-style" name="button_style">
              <option value="">保持不变</option>
              ${BANNER_BUTTONS.map(
                (name) => html`<option value="${name}" ${name === button.style ? safe('selected') : ''}>${name}</option>`
              )}
            </select>
          </div>
          ${textField({ id: `banner-${section.id}-button-color`, name: 'button_color', label: '按钮颜色', value: button.color || '', col: 'col-12 col-lg-3', attrs: 'maxlength="20" placeholder="#18181B"' })}
        </div>
        <div class="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span class="fs-8 text-secondary">
            只有当横幅包含标题、文案或按钮时，文字区块才会显示；按钮会保持店铺前台使用的扁平样式。
          </span>
          <button class="btn btn-primary btn-sm rounded px-4" type="submit">保存横幅</button>
        </div>
      </form>
    </div>`;
};

/**
 * `/admin/home` - the announcement bar and the hero. Both are already on the
 * storefront (`views/chrome.js` renders the bar on every page, `views/home.js`
 * the hero video with its wording and links); this screen only changes what they
 * say and which files they use, so the homepage keeps its layout.
 */
export const homeView = ({ settings = {}, hero = null, sections = [], media = true } = {}) => {
  const slides = (hero && Array.isArray(hero.data.slides) && hero.data.slides) || [];
  const rows = sections.filter((section) => section.type === 'product_row');
  const grids = sections.filter((section) => section.type === 'link_grid');
  const banners = sections.filter((section) => section.type === 'image_banner');

  return html`
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <h1 class="heading-font text-uppercase h4 mb-1">首页内容</h1>
        <p class="text-secondary fs-7 mb-0">
          每个页面页头之上的公告栏、首页轮播的视频、文案和链接、其下方的商品栏目，以及为页面收尾的区块。这些内容
          都已存在于网站上——这里的表单只改变区块展示的内容，不会改变布局。
        </p>
        <p class="text-secondary fs-8 mb-0">
          <a class="text-secondary" href="/admin/categories">商品分类</a>在单独的页面中管理。
        </p>
      </div>
      <div class="d-flex flex-wrap align-items-center gap-2">
        <a class="btn btn-outline-dark btn-sm rounded px-3" href="/" target="_blank" rel="noopener">预览首页</a>
      </div>
    </div>

    ${media
      ? ''
      : html`<div class="alert alert-warning rounded-3 fs-7" role="alert">
          <strong>此 Worker 未绑定 MEDIA 存储桶</strong>，因此下方选择的文件无法保存。旁边的字段仍可填写路径
          （如 <code>/images/hero-outdoor-desktop.mp4</code>）或完整 URL。
        </div>`}

    <section class="card border-0 shadow-sm rounded-3 mb-4">
      <div class="card-body">
        <h2 class="h6 text-uppercase mb-1">公告栏</h2>
        <p class="text-secondary fs-7 mb-3">
          网站最顶部的横条。图标留空时，公告栏只显示文字。
        </p>
        <div class="mb-3">${announcementBar(settings)}</div>
        <form method="post" action="/admin/home/announcement" class="row g-3">
          ${textField({ id: 'bar-text', name: 'announcement_text', label: '消息', value: settings.announcement_text || '', col: 'col-12 col-lg-6', attrs: 'maxlength="160" required' })}
          ${textField({ id: 'bar-icon', name: 'announcement_icon', label: '图标', value: settings.announcement_icon || '', col: 'col-12 col-lg-6', attrs: 'maxlength="300" placeholder="留空：不显示图标"' })}
          <div class="col-12 d-flex justify-content-lg-end">
            <button class="btn btn-primary btn-sm rounded px-4" type="submit">保存公告栏</button>
          </div>
        </form>
      </div>
    </section>

    <h2 class="h6 text-uppercase mb-1">首页轮播</h2>
    <p class="text-secondary fs-7 mb-3">
      首页顶部的轮播：视频、覆盖其上的文案以及链接去向。保存一张轮播会重写首页轮播区块中的该张内容，店铺前台
      会在下次请求时显示更新。
    </p>
    ${hero && hero.enabled === false
      ? html`<div class="alert alert-warning rounded-3 fs-7" role="alert">
          <strong>该首页轮播区块已关闭</strong>（<code>sections.enabled = 0</code>），因此首页完全不会显示它。
          保存仍会更新内容，重新启用该区块后便会显示。
        </div>`
      : ''}
    ${slides.length
      ? slides.map((slide, index) => heroSlide({ slide, index, section: hero, media }))
      : html`<div class="card border-0 shadow-sm rounded-3">
          <div class="card-body text-center py-5">
            <h3 class="h5 mb-2">暂无首页轮播</h3>
            <p class="text-secondary fs-7 mb-0">
              首页的 <code>sections</code> 中没有 <code>hero</code> 区块，因此没有可编辑的视频。
            </p>
          </div>
        </div>`}

    <h2 class="h6 text-uppercase mb-1 mt-4">商品栏目</h2>
    <p class="text-secondary fs-7 mb-3">
      轮播和横幅之间的区块。栏目列出哪些商品由分类页面上的商品开关决定——
      <strong>新品</strong>、<strong>热销</strong>和<strong>首页推荐</strong>——勾选后商品就会进入对应栏目。
    </p>
    ${rows.length
      ? rows.map((section) => productRowPanel({ section }))
      : html`<p class="fs-7 text-secondary mb-0">首页暂无商品栏目。</p>`}

    <h2 class="h6 text-uppercase mb-1 mt-4">底部区块</h2>
    <p class="text-secondary fs-7 mb-3">
      引导顾客继续浏览的模块，以及为页面收尾的横幅。它们的结构和样式保持原样——这些表单只改变图片、文字和链接去向。
    </p>
    ${grids.map((section) => linkGridPanel({ section, media }))}
    ${banners.map((section) => imageBannerPanel({ section, media }))}
    ${grids.length || banners.length
      ? ''
      : html`<p class="fs-7 text-secondary mb-0">首页暂无可编辑的模块或横幅。</p>`}
  `;
};

/* -------------------------------------------------------- footer columns ---- */

/**
 * The up / down / delete controls each footer row carries. The buttons post on
 * their own, so reordering or removing one row never touches the others - the
 * same pattern the category rows use.
 */
const rowControls = ({ kind, label, id, index, count, confirm }) => html`
  <div class="d-flex align-items-center gap-2">
    <form method="post" action="/admin/footer/${kind}/move" class="mb-0">
      <input type="hidden" name="id" value="${id}">
      <input type="hidden" name="direction" value="up">
      <button class="btn btn-outline-secondary btn-sm rounded px-2" type="submit" ${index === 0 ? safe('disabled') : ''}
              aria-label="上移 ${label}">&uarr;</button>
    </form>
    <form method="post" action="/admin/footer/${kind}/move" class="mb-0">
      <input type="hidden" name="id" value="${id}">
      <input type="hidden" name="direction" value="down">
      <button class="btn btn-outline-secondary btn-sm rounded px-2" type="submit" ${index === count - 1 ? safe('disabled') : ''}
              aria-label="下移 ${label}">&darr;</button>
    </form>
    <form method="post" action="/admin/footer/${kind}/delete" class="mb-0" data-admin-confirm="${confirm}">
      <input type="hidden" name="id" value="${id}">
      <button class="btn btn-outline-danger btn-sm rounded px-3" type="submit">删除</button>
    </form>
  </div>`;

/** One link of a column: its words, the page behind it and its place in the list. */
const footerLinkRow = (link, index, count) => html`
  <form method="post" action="/admin/footer/link/save" class="border-top pt-3 mt-3">
    <input type="hidden" name="id" value="${link.id}">
    <div class="row g-2 align-items-end">
      ${textField({
        id: `link-label-${link.id}`,
        name: 'label',
        label: '链接文字',
        value: link.label,
        col: 'col-12 col-lg-3',
        attrs: 'maxlength="60" required placeholder="关于我们"',
      })}
      ${textField({
        id: `link-url-${link.id}`,
        name: 'url',
        label: '链接',
        value: link.url,
        col: 'col-12 col-lg-5',
        attrs: 'maxlength="300" required placeholder="/pages/about"',
      })}
      ${textField({
        id: `link-order-${link.id}`,
        name: 'position',
        label: '排序',
        value: link.sort_order,
        col: 'col-4 col-lg-1',
        type: 'number',
        attrs: 'min="0" max="999"',
      })}
      <div class="col-8 col-lg-1">${toggleField({ id: `link-enabled-${link.id}`, name: 'enabled', label: '显示', checked: link.enabled })}</div>
      <div class="col-12 col-lg-2 d-flex justify-content-lg-end">
        <button class="btn btn-primary btn-sm rounded px-3" type="submit">保存</button>
      </div>
    </div>
  </form>
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
    <span class="fs-8 text-secondary">
      ${/^https?:\/\//i.test(link.url) ? '将离开本站，会在新标签页打开' : '本站页面'}
      &middot; <a href="${link.url}" target="_blank" rel="noopener">预览</a>
    </span>
    ${rowControls({
      kind: 'link',
      id: link.id,
      label: link.label,
      index,
      count,
      confirm: `删除“${link.label}”？该链接会立即从页脚消失。`,
    })}
  </div>`;

/**
 * `/admin/footer`: the company block and the link columns at the bottom of every
 * page. The columns are rows in `menu_items` (location = 'footer'), so nothing
 * here decides how they are laid out - the screen only changes the words, the
 * links and the order. The company block above them is three `settings` rows
 * instead: the uploaded logo, the name of the business beside it - a fifth smaller
 * and standing on the mark's bottom edge - and the description under both.
 */
export const footerView = ({ groups = [], settings = {}, media = true } = {}) => html`
  <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
    <div>
      <h1 class="heading-font text-uppercase h4 mb-1">页脚</h1>
      <p class="text-secondary fs-7 mb-0">
        每个页面底部的公司信息和链接栏目，按下方顺序排列。以 <code>/</code> 开头的链接留在本站；完整的
        <code>https://</code> URL（如社交媒体）会在新标签页打开。
      </p>
      <p class="text-secondary fs-8 mb-0">
        版权信息是一项设置，而不是栏目——<code>footer_copyright</code> 保存在 D1 中。
      </p>
    </div>
    <span class="fs-7 text-secondary">${groups.length} 个栏目</span>
  </div>

  <section class="card border-0 shadow-sm rounded-3 mb-4">
    <form method="post" action="/admin/footer/brand" enctype="multipart/form-data">
      <div class="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h2 class="h6 text-uppercase mb-0">公司信息</h2>
        <span class="fs-8 text-secondary">${settings.footer_logo || '无 Logo——只显示名称'}</span>
      </div>
      <div class="card-body row g-3">
        <div class="col-12 col-lg-4">
          <p class="form-label fs-8 text-uppercase mb-1">当前站点显示</p>
          <div class="d-flex flex-wrap align-items-end gap-2">
            ${settings.footer_logo
              ? html`<img class="bg-body-secondary rounded p-2" style="max-height: 4.95rem" src="${settings.footer_logo}" alt="${settings.site_name || 'Chen Furniture'}">`
              : ''}
            <p class="fs-8 text-secondary mb-0">
              <strong>${settings.site_name || 'Chen Furniture'}</strong>
              ${settings.brand_line ? html` &middot; ${settings.brand_line}` : ''}
            </p>
          </div>
          ${settings.footer_logo
            ? ''
            : html`<p class="fs-8 text-secondary mt-1 mb-0">尚无 Logo，页脚仅显示名称。</p>`}
        </div>
        <div class="col-12 col-lg-8 row g-3">
          ${mediaField({
            id: 'footer-logo',
            name: 'footer_logo',
            label: '公司 Logo',
            value: settings.footer_logo || '',
            file: 'logo_file',
            accept: 'image/jpeg,image/png,image/webp,image/avif',
            hint: '/images/footer/logo.png - 留空则不显示 Logo',
            upload: media,
          })}
          ${textField({
            id: 'footer-brand-name',
            name: 'site_name',
            label: '公司名称',
            value: settings.site_name || '',
            col: 'col-12 col-lg-6',
            attrs: 'maxlength="60" required',
          })}
          ${textAreaField({
            id: 'footer-brand-line',
            name: 'brand_line',
            label: '简介',
            value: settings.brand_line || '',
            rows: 3,
            col: 'col-12 col-lg-6',
            attrs: 'maxlength="300"',
          })}
          <div class="col-12 d-flex flex-wrap justify-content-between align-items-center gap-2">
            <span class="fs-8 text-secondary">
              ${media
                ? '选择的文件会存入 R2，旁边的字段会更新为该文件。'
                : '未绑定 MEDIA 存储桶，因此只能保存路径或 URL。'}
              Logo 位于名称左侧，名称字号小五分之一，并与标志底边对齐；Logo 留空则只显示名称。
            </span>
            <button class="btn btn-primary btn-sm rounded px-4" type="submit">保存公司信息</button>
          </div>
        </div>
      </div>
    </form>
  </section>

  <section class="card border-0 shadow-sm rounded-3 mb-4">
    <div class="card-body row g-3 align-items-end">
      <div class="col-12">
        <h2 class="h6 text-uppercase mb-1">栏目</h2>
        <p class="text-secondary fs-7 mb-0">
          每个栏目一张卡片，按页脚显示顺序排列。各栏目共同分配这一行。
        </p>
      </div>
    </div>
  </section>

  ${groups.length
    ? groups.map(
        (group, index) => html`
          <section class="card border-0 shadow-sm rounded-3 mb-4">
            <form method="post" action="/admin/footer/group/save">
              <input type="hidden" name="id" value="${group.id}">
              <div class="card-body row g-3">
                ${textField({
                  id: `column-heading-${group.id}`,
                  name: 'label',
                  label: '栏目标题',
                  value: group.label,
                  col: 'col-12 col-lg-5',
                  attrs: 'maxlength="40" required',
                })}
                ${textField({
                  id: `column-order-${group.id}`,
                  name: 'position',
                  label: '排序',
                  value: group.sort_order,
                  col: 'col-6 col-lg-2',
                  type: 'number',
                  attrs: 'min="0" max="999"',
                })}
                <div class="col-6 col-lg-3">
                  ${toggleField({ id: `column-enabled-${group.id}`, name: 'enabled', label: '在网站显示', checked: group.enabled })}
                </div>
                <div class="col-12 col-lg-2 d-flex justify-content-lg-end">
                  <button class="btn btn-primary btn-sm rounded px-3" type="submit">保存栏目</button>
                </div>
              </div>
            </form>
            <div class="card-body pt-0 border-top">
              ${group.links.length
                ? group.links.map((link, position) => footerLinkRow(link, position, group.links.length))
                : html`<p class="fs-7 text-secondary mt-3 mb-0">该栏目还没有链接。</p>`}
              <form method="post" action="/admin/footer/link" class="border-top pt-3 mt-3 row g-2 align-items-end">
                <input type="hidden" name="parent_id" value="${group.id}">
                ${textField({
                  id: `new-link-label-${group.id}`,
                  name: 'label',
                  label: '链接文字',
                  col: 'col-12 col-lg-4',
                  attrs: 'maxlength="60" required placeholder="关于我们"',
                })}
                ${textField({
                  id: `new-link-url-${group.id}`,
                  name: 'url',
                  label: '链接',
                  col: 'col-12 col-lg-5',
                  attrs: 'maxlength="300" required placeholder="/pages/about"',
                })}
                <div class="col-12 col-lg-3 d-flex align-items-end justify-content-lg-end">
                  <button class="btn btn-outline-dark btn-sm rounded px-3" type="submit">添加链接</button>
                </div>
              </form>
            </div>
            <div class="card-footer bg-white border-top-0 d-flex flex-wrap align-items-center justify-content-between gap-2 pt-0">
              <span class="fs-8 text-secondary">
                ${group.enabled
                  ? '在页脚显示'
                  : '已隐藏——栏目仍保留在此，重新启用前店铺前台不会显示'}
                &middot; ${group.links.length} 个链接
                &middot; 使用上方表单为该栏目添加链接
              </span>
              ${rowControls({
                kind: 'group',
                id: group.id,
                label: group.label,
                index,
                count: groups.length,
                confirm: `删除“${group.label}”栏目及其中的所有链接？`,
              })}
            </div>
          </section>`
      )
    : html`<div class="card border-0 shadow-sm rounded-3 mb-4">
        <div class="card-body text-center py-5">
          <h2 class="h5 mb-2">暂无页脚栏目</h2>
          <p class="text-secondary fs-7 mb-0">在下方添加一个，它会出现在每个页面的底部。</p>
        </div>
      </div>`}

  <section class="card border-0 shadow-sm rounded-3">
    <div class="card-body">
      <h2 class="h6 text-uppercase mb-3">新增栏目</h2>
      <form method="post" action="/admin/footer/group" class="row g-3">
        ${textField({
          id: 'new-column-heading',
          name: 'label',
          label: '标题',
          col: 'col-12 col-lg-6',
          attrs: 'maxlength="40" required placeholder="公司"',
        })}
        ${textField({
          id: 'new-column-order',
          name: 'position',
          label: '排序',
          col: 'col-6 col-lg-2',
          type: 'number',
          attrs: 'min="0" max="999" placeholder="自动顺延"',
        })}
        <div class="col-6 col-lg-2 d-flex align-items-end">
          ${toggleField({ id: 'new-column-enabled', name: 'enabled', label: '显示', checked: true })}
        </div>
        <div class="col-12 col-lg-2 d-flex align-items-end justify-content-lg-end">
          <button class="btn btn-primary btn-sm rounded px-4" type="submit">添加栏目</button>
        </div>
      </form>
    </div>
  </section>`;
