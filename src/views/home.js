import { html, safe } from '../lib/html.js';
import { productCard, sectionHeading } from './partials.js';

/* -------------------------------------------------------------------- hero ---- */

const heroSlide = (slide, index) => {
  const button = slide.button
    ? html`<a href="${slide.button.url}" class="btn ${slide.button.style || 'btn-white'} rounded px-4 py-2 mt-3" style="--btn-colour: ${slide.button.color || '#18181B'}">${slide.button.label}</a>`
    : '';

  return html`
    <div class="carousel-item ${index === 0 ? 'active' : ''}" data-bs-interval="${slide.interval || 5000}">
      <div class="hero-slide position-relative">
        ${slide.video
          ? html`<video class="hero-media d-none d-md-block" autoplay muted loop playsinline poster="${slide.poster || ''}">
              <source src="${slide.video}" type="video/mp4">
            </video>
            ${slide.video_mobile
              ? html`<video class="hero-media d-md-none" autoplay muted loop playsinline poster="${slide.poster_mobile || slide.poster || ''}">
                  <source src="${slide.video_mobile}" type="video/mp4">
                </video>`
              : ''}`
          : html`<img src="${slide.image}" alt="${slide.title || ''}" class="hero-media w-100 h-100 object-fit-cover">`}
        <div class="hero-caption position-absolute inset-0 d-flex flex-column align-items-center justify-content-center text-center px-3">
          ${slide.title ? html`<h2 class="text-white heading-font text-uppercase lh-1 fs-hero mb-0">${slide.title}</h2>` : ''}
          ${slide.text ? html`<p class="text-white fs-5 mt-2 mb-0">${slide.text}</p>` : ''}
          ${button}
        </div>
        ${slide.url && !slide.button ? html`<a href="${slide.url}" class="hero-slide__link stretched-link" aria-label="${slide.title || '立即选购'}"></a>` : ''}
      </div>
    </div>`;
};

export const hero = (section) => {
  const slides = section.data.slides || [];
  if (!slides.length) return '';
  return html`
    <section class="hero-carousel" id="hero-${section.id}">
      <div
        id="hero-carousel-${section.id}"
        class="carousel slide"
        data-bs-ride="carousel"
        data-bs-interval="${section.data.interval || 5000}"
      >
        <div class="carousel-inner">${slides.map(heroSlide)}</div>
        ${slides.length > 1
          ? html`<div class="carousel-indicators">
              ${slides.map(
                (_, index) => html`<button type="button" data-bs-target="#hero-carousel-${section.id}" data-bs-slide-to="${index}" class="${index === 0 ? 'active' : ''}" aria-label="第 ${index + 1} 张"></button>`
              )}
            </div>`
          : ''}
      </div>
    </section>`;
};

/* ------------------------------------------------------------- product row ---- */

export const productRow = (section, rows, symbol = '¥', siteUrl = '') => {
  const tabs = rows || [];
  if (!tabs.length) return '';
  const viewAll = section.data.view_all;

  return html`
    <section class="product-row py-4 py-md-5">
      <div class="container">
        <div class="d-flex flex-column flex-md-row align-items-md-end justify-content-between mb-4 gap-3">
          ${sectionHeading({ heading: section.data.heading, intro: section.data.subheading, align: 'start' })}
          ${tabs.length > 1
            ? html`<div class="d-flex flex-wrap gap-4 justify-content-center justify-content-md-end">
                ${tabs.map(
                  (tab, index) => html`<button
                    type="button"
                    class="btn btn-link p-0 js-collection-picker ${index === 0 ? 'active' : 'inactive'}"
                    data-collection-tab="${section.id}-${index}"
                  >${tab.label}</button>`
                )}
              </div>`
            : ''}
        </div>
      </div>
      <div class="container-fluid px-md-4">
        ${tabs.map(
          (tab, index) => html`
            <div class="js-collection-row ${index === 0 ? '' : 'd-none'}" data-collection-row="${section.id}-${index}">
              <div class="row g-2 g-md-4 scrolling-row flex-nowrap overflow-auto pb-2">
                ${tab.products.map((product) => productCard(product, { symbol, columnClass: 'scrolling-item col-10 col-md-4 col-lg-3' }))}
              </div>
            </div>`
        )}
      </div>
      ${viewAll
        ? html`<div class="text-center mt-3 mt-md-4">
            <a href="${viewAll.url}" class="btn btn-outline-primary rounded px-4 py-2 text-uppercase">${viewAll.label}</a>
          </div>`
        : ''}
    </section>`;
};

/* --------------------------------------------------------------- link grid ---- */

export const linkGrid = (section) => html`
  <section class="link-grid py-3 py-md-4">
    <div class="container-fluid px-md-3">
      <div class="row g-3">
        ${(section.data.items || []).map(
          (item) => html`
            <div class="col-12 col-md-6">
              <a href="${item.url}" class="link-grid__tile position-relative d-flex align-items-center justify-content-center rounded-3 overflow-hidden text-decoration-none" style="min-height: ${item.height || '60vh'}">
                <img src="${item.image}" alt="${item.label}" class="link-grid__image position-absolute w-100 h-100 object-fit-cover" loading="lazy">
                <span class="link-grid__label position-relative text-white heading-font text-uppercase fs-2">${item.label}</span>
              </a>
            </div>`
        )}
      </div>
    </div>
  </section>`;

/* ------------------------------------------------------------ image banner ---- */

export const imageBanner = (section) => {
  const { image, title, text, button, object_position: objectPosition } = section.data;
  const hasCopy = Boolean(title || text || button);

  return html`
    <section class="image-banner position-relative my-3 my-md-4">
      <div class="image-banner__media position-relative">
        <img
          src="${image}"
          alt="${title || ''}"
          class="w-100 h-100 object-fit-cover image-banner__img"
          ${objectPosition ? safe(`style="object-position: ${objectPosition}"`) : ''}
          loading="lazy"
        >
      </div>
      ${hasCopy
        ? html`<div class="container position-absolute top-0 start-50 translate-middle-x h-100 d-flex align-items-center">
            <div class="image-banner__copy bg-white bg-opacity-75 rounded-3 p-4 p-md-5" style="max-width: 34rem;">
              ${title ? html`<h2 class="heading-font text-uppercase fs-3 mb-3">${title}</h2>` : ''}
              ${text ? html`<p class="mb-3 text-secondary">${text}</p>` : ''}
              ${button
                ? html`<a href="${button.url}" class="btn ${button.style || 'btn-primary'} rounded px-4 py-2" style="--btn-colour: ${button.color || '#18181B'}">${button.label}</a>`
                : ''}
            </div>
          </div>`
        : ''}
    </section>`;
};

/* ----------------------------------------------------------------- masonry ---- */

export const masonry = (section) => html`
  <section class="masonry py-5">
    <div class="container">
      ${sectionHeading({ heading: section.data.heading, intro: section.data.intro })}
      <div class="grid masonry__grid">
        ${(section.data.items || []).map(
          (item) => html`
            <div class="${item.span || 'g-col-6'} masonry__cell">
              <a href="${item.url}" class="position-relative d-flex ${item.align || 'align-items-start'} justify-content-end rounded-3 overflow-hidden text-decoration-none h-100 masonry__tile">
                <img src="${item.image}" alt="${item.label}" class="w-100 h-auto object-fit-cover masonry__image" loading="lazy">
                <span class="position-absolute ${item.align === 'align-items-center' ? 'top-50 start-50 translate-middle text-center' : 'bottom-0 start-0'} p-3 p-md-4 text-white heading-font text-uppercase fs-4">${item.label}</span>
              </a>
            </div>`
        )}
      </div>
    </div>
  </section>`;

/* -------------------------------------------------------------- newsletter ---- */

export const newsletter = (settings) => html`
  <section class="newsletter bg-secondary-subtle py-5">
    <div class="container text-center">
      <h2 class="heading-font text-uppercase fs-2 mb-2">${settings.newsletter_title}</h2>
      <p class="text-secondary mb-4">${settings.newsletter_intro}</p>
      <form class="newsletter__form row g-2 justify-content-center mx-auto" style="max-width: 34rem;" data-newsletter-form novalidate>
        <div class="col-12 col-sm-7">
          <label class="visually-hidden" for="newsletter-email">${settings.newsletter_placeholder}</label>
          <input
            class="form-control"
            type="email"
            id="newsletter-email"
            name="email"
            placeholder="${settings.newsletter_placeholder}"
            autocomplete="email"
            required
          >
        </div>
        <div class="col-12 col-sm-5">
          <button class="btn btn-primary w-100 rounded" type="submit">${settings.newsletter_button}</button>
        </div>
        <p class="fs-8 text-secondary mt-2 mb-0" data-newsletter-note>${settings.newsletter_note}</p>
      </form>
    </div>
  </section>`;

/* ---------------------------------------------------------------- dispatch ---- */

export const renderSections = (list, { products = {}, settings, symbol = '¥' }) =>
  list.map((section) => {
    switch (section.type) {
      case 'hero':
        return hero(section);
      case 'product_row':
        return productRow(section, products[section.id], symbol);
      case 'link_grid':
        return linkGrid(section);
      case 'image_banner':
        return imageBanner(section);
      case 'masonry':
        return masonry(section);
      case 'newsletter':
        return newsletter(settings);
      default:
        return '';
    }
  });

