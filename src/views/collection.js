import { html, safe } from '../lib/html.js';
import { breadcrumbs, productCard, sectionHeading } from './partials.js';

export const SORTS = [
  { value: 'featured', label: '推荐排序' },
  { value: 'price-asc', label: '价格从低到高' },
  { value: 'price-desc', label: '价格从高到低' },
  { value: 'title', label: '名称 A-Z' },
  { value: 'title-desc', label: '名称 Z-A' },
];

/** The list of collections (`/collections`). */
export const collectionIndex = ({ list, symbol = '£' }) => html`
  <section class="py-4 py-md-5">
    <div class="container">
      ${breadcrumbs([{ label: '首页', url: '/' }, { label: '系列' }], 'mb-3')}
      ${sectionHeading({ heading: '全部系列', intro: '我们的产品，按系列整理。', align: 'start' })}
      <div class="row g-3 g-md-4">
        ${list.map(
          (item) => html`
            <div class="col-12 col-md-6 col-lg-4">
              <a href="/collections/${item.handle}" class="d-block text-reset text-decoration-none border rounded-3 p-4 h-100 bg-white">
                <h2 class="h4 fw-normal mb-2">${item.title}</h2>
                ${item.subtitle ? html`<p class="text-secondary fs-7 mb-2">${item.subtitle}</p>` : ''}
                <p class="fs-8 text-secondary mb-0">${item.productCount} 件商品</p>
              </a>
            </div>`
        )}
      </div>
    </div>
  </section>`;

export const collectionView = ({ collection: current, products, sort = 'featured', symbol = '£' }) => html`
  <section class="collection-hero text-center pt-4 pb-2">
    <div class="container">
      ${breadcrumbs([{ label: '首页', url: '/' }, { label: current.title }])}
      <h1 class="heading-font text-uppercase fs-1 mt-3 mb-2">${current.title}</h1>
      ${current.subtitle ? html`<p class="fs-6 text-secondary mb-2">${current.subtitle}</p>` : ''}
      ${current.description
        ? html`<div class="text-secondary mx-auto fs-7" style="max-width: 48rem;">${current.description}</div>`
        : ''}
    </div>
  </section>

  <section class="collection-grid pb-5">
    <div class="container">
      <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-4 gap-3 flex-wrap">
        <p class="mb-0 fs-7 text-secondary" data-collection-count>共 ${products.length} 件</p>
        <form class="d-flex align-items-center gap-2" method="get" data-sort-form>
          <label class="fs-8 mb-0" for="sort-by">排序</label>
          <select id="sort-by" name="sort" class="form-select form-select-sm w-auto" data-sort-select>
            ${SORTS.map(
              (option) => html`<option value="${option.value}" ${option.value === sort ? safe('selected') : ''}>${option.label}</option>`
            )}
          </select>
          <noscript><button type="submit" class="btn btn-sm btn-primary rounded">应用</button></noscript>
        </form>
      </div>

      ${products.length
        ? html`<div class="row g-3 g-md-4">
            ${products.map((product) => productCard(product, { symbol }))}
          </div>`
        : html`<div class="text-center py-5">
            <h2 class="h4 fw-light mb-3">这个系列暂时没有商品</h2>
            <p class="text-secondary mb-4">可以先看看其他系列。</p>
            <a href="/products" class="btn btn-primary rounded px-4">浏览全部商品</a>
          </div>`}
    </div>
  </section>`;
