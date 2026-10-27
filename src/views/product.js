import { html, money, safe } from '../lib/html.js';
import { icons } from './icons.js';
import { breadcrumbs, productCard, sectionHeading, uspRibbon } from './partials.js';

const mediaTile = (item) => html`
  <div class="${item.span || 'col-12 col-md-6'}">
    ${item.isVideo
      ? html`<video class="w-100 h-100 rounded object-fit-cover" autoplay muted loop playsinline poster="${item.poster || ''}">
          <source src="${item.src}" type="video/mp4">
        </video>`
      : html`<img src="${item.src}" alt="" class="w-100 h-100 rounded object-fit-cover" loading="lazy">`}
  </div>`;

const buyBox = (product, settings, symbol) => {
  const sizes = product.sizes || [];
  const basePrice = sizes.length ? Math.min(...sizes.map((size) => Number(size.price))) : Number(product.price);

  return html`
    <div class="product-info product__info-container">
      <h1 class="heading-font text-uppercase fs-2 mb-2">${product.title}</h1>
      ${product.summary ? html`<p class="text-secondary fs-7 mb-3">${product.summary}</p>` : ''}
      <div class="product-price d-flex align-items-baseline gap-2 mb-3" data-product-price data-base-price="${basePrice}">
        <span class="fs-4 fw-bold js--product--price" data-price-label>${money(basePrice, symbol)}</span>
        ${product.compare_at_price
          ? html`<span class="fs-7 text-secondary text-decoration-line-through">${money(product.compare_at_price, symbol)}</span>`
          : ''}
      </div>

      <form method="post" action="/cart/add" class="product-form" data-product-form novalidate>
        <input type="hidden" name="product_id" value="${product.id}">
        <input type="hidden" name="colour" value="${product.colour || ''}" data-colour-input>
        <input type="hidden" name="return_to" value="/products/${product.handle}">

        ${product.colours.length
          ? html`<fieldset class="mb-4">
              <legend class="fs-8 text-uppercase text-secondary mb-2">颜色</legend>
              <div class="d-flex flex-wrap gap-2">
                ${product.colours.map(
                  (colour, index) => html`<button
                    type="button"
                    class="colour-swatch colour-swatch--button ${index === 0 ? 'is-active' : ''}"
                    style="background-color: ${colour.hex}"
                    title="${colour.name}"
                    aria-label="${colour.name}"
                    data-colour-choice="${colour.name}"
                  ></button>`
                )}
              </div>
            </fieldset>`
          : ''}

        ${sizes.length > 1
          ? html`<fieldset class="mb-4">
              <legend class="fs-8 text-uppercase text-secondary mb-2">尺寸</legend>
              <div class="d-flex flex-column gap-2">
                ${sizes.map(
                  (size, index) => html`<label class="variant-option d-flex justify-content-between align-items-center border rounded px-3 py-2 ${index === 0 ? 'is-active' : ''} ${size.available ? '' : 'is-disabled'}">
                    <span class="d-flex align-items-center gap-2">
                      <input
                        type="radio"
                        name="variant_id"
                        value="${size.id}"
                        class="form-check-input mt-0"
                        data-variant-price="${size.price}"
                        ${index === 0 ? safe('checked') : ''}
                        ${size.available ? '' : safe('disabled')}
                      >
                      <span>${size.name}</span>
                    </span>
                    <span class="fs-7 text-secondary">${money(size.price, symbol)}${size.available ? '' : ' - 已售罄'}</span>
                  </label>`
                )}
              </div>
            </fieldset>`
          : sizes.length === 1
            ? html`<input type="hidden" name="variant_id" value="${sizes[0].id}" data-variant-price="${sizes[0].price}">`
            : html`<input type="hidden" name="variant_id" value="0">`}

        <div class="d-flex gap-2 align-items-stretch mb-3">
          <div class="qty-stepper d-inline-flex align-items-center border rounded">
            <button type="button" class="btn btn-sm px-3 py-2 border-0" data-qty-step="-1" aria-label="减少数量">${icons.minus}</button>
            <input type="number" name="qty" value="1" min="1" max="99" class="form-control border-0 text-center p-0" style="width: 3.5rem" aria-label="数量">
            <button type="button" class="btn btn-sm px-3 py-2 border-0" data-qty-step="1" aria-label="增加数量">${icons.plus}</button>
          </div>
          <button
            type="submit"
            class="btn btn-primary rounded flex-grow-1 d-flex align-items-center justify-content-center gap-2 fw-bold text-uppercase"
            data-add-to-cart
            ${product.soldOut ? safe('disabled') : ''}
          >${product.soldOut ? '已售罄' : settings.pdp_add_to_cart || '加入购物车'}</button>
        </div>
        <p class="fs-8 text-center text-secondary mb-0" data-form-message role="status"></p>
      </form>

      <ul class="list-unstyled fs-7 text-secondary mt-4 mb-0 d-flex flex-column gap-2">
        ${settings.pdp_shipping_note ? html`<li class="d-flex gap-2 align-items-start">${icons.truck}<span>${settings.pdp_shipping_note}</span></li>` : ''}
        ${product.shipping_note ? html`<li class="d-flex gap-2 align-items-start">${icons.box}<span>${product.shipping_note}</span></li>` : ''}
        ${settings.pdp_returns_note ? html`<li class="d-flex gap-2 align-items-start">${icons.refresh}<span>${settings.pdp_returns_note}</span></li>` : ''}
      </ul>
    </div>`;
};

const accordion = (product, settings) => html`
  <div class="accordion accordion-flush border-top mt-4" id="pdpAccordion">
    <div class="accordion-item">
      <h2 class="accordion-header" id="pdp-description-heading">
        <button class="accordion-button collapsed px-0 fs-6 fw-normal text-uppercase" type="button" data-bs-toggle="collapse" data-bs-target="#pdp-description" aria-expanded="false" aria-controls="pdp-description">
          商品描述
        </button>
      </h2>
      <div id="pdp-description" class="accordion-collapse collapse" aria-labelledby="pdp-description-heading" data-bs-parent="#pdpAccordion">
        <div class="accordion-body px-0 text-secondary fs-7">${product.description}</div>
      </div>
    </div>
    ${product.specs.length
      ? html`<div class="accordion-item">
          <h2 class="accordion-header" id="pdp-specs-heading">
            <button class="accordion-button collapsed px-0 fs-6 fw-normal text-uppercase" type="button" data-bs-toggle="collapse" data-bs-target="#pdp-specs" aria-expanded="false" aria-controls="pdp-specs">
              规格参数
            </button>
          </h2>
          <div id="pdp-specs" class="accordion-collapse collapse" aria-labelledby="pdp-specs-heading" data-bs-parent="#pdpAccordion">
            <div class="accordion-body px-0">
              <dl class="row mb-0 fs-7">
                ${product.specs.map(
                  (spec) => html`<dt class="col-5 fw-medium text-secondary">${spec.label}</dt>
                    <dd class="col-7">${spec.value}</dd>`
                )}
              </dl>
            </div>
          </div>
        </div>`
      : ''}
    <div class="accordion-item">
      <h2 class="accordion-header" id="pdp-delivery-heading">
        <button class="accordion-button collapsed px-0 fs-6 fw-normal text-uppercase" type="button" data-bs-toggle="collapse" data-bs-target="#pdp-delivery" aria-expanded="false" aria-controls="pdp-delivery">
          配送与退换
        </button>
      </h2>
      <div id="pdp-delivery" class="accordion-collapse collapse" aria-labelledby="pdp-delivery-heading" data-bs-parent="#pdpAccordion">
        <div class="accordion-body px-0 text-secondary fs-7">
          ${settings.pdp_delivery_copy || 'Free UK delivery on orders over £75. Orders placed before 1pm are dispatched the same working day.'}
        </div>
      </div>
    </div>
  </div>`;

/* -------------------------------------------------------------- full page ---- */

export const productView = ({ product, related = [], settings, symbol = '£', category = null }) => {
  // Home / the category this product was filed under in /admin / the product.
  // The crumb comes from `categoryOfProduct`, never from the product's own
  // collection: a product can sit in a curated list that is not its category.
  const trail = [
    { label: '首页', url: '/' },
    category ? { label: category.name, url: category.href } : { label: '全部商品', url: '/products' },
    { label: product.short_title || product.title },
  ];

  return html`
  <div class="container pt-3">
    ${breadcrumbs(trail)}
  </div>

  <section class="product-page pt-3 pb-4">
    <div class="container">
      <div class="row g-4 g-lg-5">
        <div class="col-12 col-lg-7">
          <div class="row g-2 g-md-3 product-gallery">
            ${product.media.length
              ? product.media.map(mediaTile)
              : html`<div class="col-12">
                  <img src="${product.image}" alt="${product.title}" class="w-100 h-100 rounded object-fit-contain" data-gallery-main>
                </div>`}
          </div>
        </div>
        <div class="col-12 col-lg-5">${buyBox(product, settings, symbol)}</div>
      </div>
      ${accordion(product, settings)}
    </div>
  </section>

  ${uspRibbon({ features: product.features })}

  ${product.description && product.media.length
    ? html`<section class="product-story pb-4">
        <div class="container">
          <div class="row g-4 align-items-center">
            <div class="col-12 col-md-6">
              <img src="${product.media[0].src}" alt="" class="w-100 rounded object-fit-cover" loading="lazy">
            </div>
            <div class="col-12 col-md-6">
              ${sectionHeading({ heading: product.short_title || product.title, intro: product.summary, align: 'start' })}
              <p class="text-secondary fs-7 mb-0">${product.description}</p>
            </div>
          </div>
        </div>
      </section>`
    : ''}

  ${related.length
    ? html`<section class="product-related py-4 py-md-5 bg-secondary-subtle">
        <div class="container">
          ${sectionHeading({ heading: '你可能也喜欢' })}
          <div class="row g-2 g-md-4">
            ${related.map((item) => productCard(item, { symbol }))}
          </div>
        </div>
      </section>`
    : ''}`;
};
