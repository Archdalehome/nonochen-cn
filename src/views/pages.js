import { html, safe } from '../lib/html.js';
import { breadcrumbs, productCard, sectionHeading } from './partials.js';

const bodyCopy = (body) => html`<div class="rte text-secondary fs-7">${safe(body || '')}</div>`;

/**
 * An image block on a content page. The admin editor writes `image` (a path in
 * R2 or a full URL), `text` (the caption) and `width` (`wide` fills the text
 * column, `narrow` sits centred at 40rem). The homepage's own banner block is a
 * different renderer - this one never carries a button.
 */
const contentImage = (section) => {
  const { image = '', text = '', width = 'wide' } = section.data || {};
  if (!image) return '';
  return html`<figure class="content-image my-4 ${width === 'narrow' ? 'content-image--narrow' : ''}">
    <img src="${image}" alt="${text}" class="w-100 rounded-3" loading="lazy">
    ${text ? html`<figcaption class="fs-8 text-secondary text-center mt-2">${text}</figcaption>` : ''}
  </figure>`;
};

/**
 * Content pages (`/pages/:handle`) are stored as one or more `sections` rows
 * where `page = 'page:<handle>'`. The first `page` section supplies the heading.
 */
export const contentPage = ({ handle, list }) => {
  const first = list.find((section) => section.type === 'page');
  // `heading` is what the editor writes for the page title; the seeded pages put
  // the same text in `title`, so both are read, in that order.
  const title = (first && (first.data.heading || first.data.title)) || handle.replace(/-/g, ' ');

  return html`
    <div class="container pt-3">
      ${breadcrumbs([{ label: '首页', url: '/' }, { label: title }])}
    </div>
    <section class="content-page py-4">
      <div class="container">
        <h1 class="heading-font text-uppercase fs-2 mb-4 text-center">${title}</h1>
        <div class="mx-auto" style="max-width: 60rem;">
          ${list.map((section) => {
            switch (section.type) {
              case 'page':
                return html`<div class="mb-4">
                  ${section.data.title && section.data.title !== title
                    ? html`<h2 class="h4 fw-normal mb-3">${section.data.title}</h2>`
                    : ''}
                  ${bodyCopy(section.data.body)}
                </div>`;
              case 'image_banner':
                return contentImage(section);
              default:
                return '';
            }
          })}
        </div>
      </div>
    </section>`;
};

export const searchPage = ({ term, products, symbol = '¥' }) => html`
  <div class="container pt-3">
    ${breadcrumbs([{ label: '首页', url: '/' }, { label: '搜索' }])}
  </div>
  <section class="search-page py-4">
    <div class="container">
      <form method="get" action="/search" class="mb-4" role="search">
        <label class="visually-hidden" for="search-input">搜索商品</label>
        <div class="d-flex gap-2" style="max-width: 32rem;">
          <input class="form-control" type="search" id="search-input" name="q" value="${term}" placeholder="搜索商品名称或品类…">
          <button class="btn btn-primary rounded px-4" type="submit">搜索</button>
        </div>
      </form>

      ${term
        ? html`<p class="text-secondary fs-7 mb-4">
            与 &ldquo;${term}&rdquo; 相关的商品：${products.length} 件
          </p>`
        : sectionHeading({ heading: '搜索全站', intro: '想找点什么？', align: 'start' })}

      ${products.length
        ? html`<div class="row g-3 g-md-4">${products.map((product) => productCard(product, { symbol }))}</div>`
        : term
          ? html`<div class="text-center py-5">
              <h2 class="h4 fw-light mb-3">没有找到商品</h2>
              <p class="text-secondary mb-4">换个短一点的关键词试试，或者直接逛逛系列。</p>
              <a href="/collections" class="btn btn-primary rounded px-4">浏览系列</a>
            </div>`
          : ''}
    </div>
  </section>`;
