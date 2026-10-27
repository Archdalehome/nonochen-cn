import { html, safe, money, esc, classNames } from '../lib/html.js';
import { icons, svgLogo } from './icons.js';

/* --------------------------------------------------------- announcement bar ---- */

export const announcementBar = (settings) => html`
  <div class="announcement-bar bg-primary text-white text-center fs-8 d-flex align-items-center justify-content-center gap-2 py-1">
    ${settings.announcement_icon
      ? html`<img src="${settings.announcement_icon}" width="16" height="16" alt="" class="announcement-bar__icon">`
      : ''}
    <span class="text-uppercase tracking-1">${settings.announcement_text}</span>
  </div>`;

/* ------------------------------------------------------------ colour dots ---- */

export const colourSwatches = ({ colours = [], limit = 4, link = '' }) => {
  if (!colours.length) return '';
  const shown = colours.slice(0, limit);
  const extra = colours.length - shown.length;
  return html`
    <div class="d-flex flex-wrap align-items-center">
      ${shown.map(
        (colour) => html`<span
          class="colour-swatch"
          title="${colour.name}"
          style="background-color: ${colour.hex}"
          data-bs-toggle="tooltip"
          data-bs-title="${colour.name}"
        ></span>`
      )}
      ${extra > 0 ? html`<span class="colour-swatch colour-swatch--more">+${extra}</span>` : ''}
    </div>`;
};

/* --------------------------------------------------------------- product card ---- */

/**
 * The price a card shows. `price_from` is the admin's "Best Selling" switch - it
 * decides which homepage row a product belongs to (see `productList` in
 * `lib/db.js`), not how its price reads - so a card always shows the plain
 * figure, with no "from" in front of it.
 */
export const priceLabel = (product, symbol = '£') => {
  const sizes = product.sizes || [];
  const cheapest = sizes.length ? Math.min(...sizes.map((size) => Number(size.price))) : Number(product.price);
  return html`<span class="js--product--price">${money(cheapest, symbol)}</span>`;
};

export const productCard = (product, { symbol = '£', columnClass = 'col-6 col-md-4 col-lg-3' } = {}) => html`
  <div class="${columnClass} product-card mb-4 mb-md-5">
    <a href="/products/${product.handle}" class="d-flex w-100 h-100 text-decoration-none text-reset" data-product-id="${product.id}">
      <div class="product d-flex flex-column justify-content-between w-100 position-relative">
        <div class="product-inner d-flex flex-column rounded overflow-hidden flex-grow-1">
          <div class="bg-product-image-colour rounded position-relative">
            ${product.badge
              ? html`<p class="product-badge position-absolute text-uppercase shadow py-2 px-2 fs-8 heading-font text-center lh-1 rounded fw-bold mb-0"
                       style="top: 12px; left: 12px; background: #fff; color: #000;">${product.badge}</p>`
              : ''}
            ${product.soldOut
              ? html`<p class="product-badge position-absolute text-uppercase shadow py-2 px-2 fs-8 heading-font text-center lh-1 rounded fw-bold mb-0"
                       style="top: 12px; left: 12px; background: #18181B; color: #fff;">已售罄</p>`
              : ''}
            <img
              src="${product.image}"
              alt="${product.title}"
              width="100%"
              loading="lazy"
              class="rounded object-fit-contain img-square"
            >
          </div>
          <div class="d-flex flex-column mt-2 justify-content-between flex-grow-1">
            <div class="product-info-container d-flex flex-column justify-content-between flex-fill">
              <div class="my-2">
                ${colourSwatches({ colours: product.colours, limit: 4 })}
                <h3 class="fs-lg-5 fs-6 mt-2 mb-2 d-block fw-normal">${product.title}</h3>
              </div>
              <div class="mb-2">
                <div class="product-price mt-0 fs-6 fs-lg-5 d-flex align-items-center">
                  <span class="js--product-price-wrapper">${priceLabel(product, symbol)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </a>
  </div>`;

/* ------------------------------------------------------------------ ribbon ---- */

export const uspRibbon = (product) =>
  product.features && product.features.length
    ? html`<ul class="usp-ribbon list-unstyled d-flex flex-wrap justify-content-center gap-3 py-3 my-4 border-top border-bottom mb-0">
        ${product.features.map(
          (feature) => html`<li class="d-flex align-items-center gap-2 fs-7">
            ${icons.check}
            <span>${feature}</span>
          </li>`
        )}
      </ul>`
    : '';

/* -------------------------------------------------------------- breadcrumbs ---- */

export const breadcrumbs = (trail, className = '') => html`
  <nav aria-label="breadcrumb" class="${classNames('fs-8 text-secondary', className)}">
    <ol class="breadcrumb mb-0">
      ${trail.map(
        (crumb, index) => html`<li class="breadcrumb-item ${index === trail.length - 1 ? 'active' : ''}">
          ${crumb.url && index !== trail.length - 1 ? html`<a class="text-secondary" href="${crumb.url}">${crumb.label}</a>` : crumb.label}
        </li>`
      )}
    </ol>
  </nav>`;

export const sectionHeading = ({ heading, intro, align = 'center' }) => html`
  <div class="section-heading text-${align} mb-4 mb-md-5">
    ${heading ? html`<h2 class="heading-font text-uppercase fw-normal fs-2 mb-2">${heading}</h2>` : ''}
    ${intro ? html`<p class="text-secondary mb-0">${intro}</p>` : ''}
  </div>`;

export { esc, money };
