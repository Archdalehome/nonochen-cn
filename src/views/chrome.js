import { html } from '../lib/html.js';
import { icons, svgLogo } from './icons.js';
import { announcementBar } from './partials.js';

/* -------------------------------------------------------- category links ---- */

/**
 * The product categories managed in /admin. They are the storefront navigation:
 * inline in the header row next to the logo, search and cart on desktop, and
 * listed at the top of the mobile offcanvas menu.
 */
const categoryLink = (item, path, className) => {
  const href = String(item.href || '#');
  const current = href.split('?')[0] === path;
  return html`<a
    href="${href}"
    class="${className}${current ? ' is-current' : ''}"
    ${current ? html`aria-current="page"` : ''}
  >${item.name}</a>`;
};

/** The category links that sit between the logo and the search/cart icons. */
export const categoryNav = (list = [], path = '') => {
  if (!list.length) return '';
  return html`
    <ul class="navbar-nav d-none d-md-flex flex-row justify-content-center flex-fill py-1 mb-0 header-categories" aria-label="商品分类">
      ${list.map(
        (item) => html`<li class="navbar-item">
          ${categoryLink(item, path, 'nav-link fs-6 text-capitalize nav--top-level header-categories__link')}
        </li>`
      )}
    </ul>`;
};

/* ------------------------------------------------------------------ mobile ---- */

/**
 * The phone drawer. It is deliberately small: the categories managed in /admin
 * (the same list the desktop header row shows) and the three links that sit at
 * the bottom of it. The scraped `menu_items` tree that used to fill the middle -
 * thirty-odd collection links nobody chose - is not rendered anywhere.
 */
export const mobileNav = (categories = [], path = '') => html`
  <div class="offcanvas offcanvas-start mobile-nav" tabindex="-1" id="offcanvasNavbar" aria-labelledby="offcanvasNavbarLabel">
    <div class="offcanvas-header border-bottom">
      <span class="heading-font text-uppercase h5 mb-0" id="offcanvasNavbarLabel">菜单</span>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="关闭"></button>
    </div>
    <div class="offcanvas-body flex-column">
      ${categories.length
        ? html`<nav class="w-100" aria-label="商品分类">
            <p class="fs-8 text-uppercase text-secondary mb-2">按分类选购</p>
            <ul class="mobile-nav__categories mb-4">
              ${categories.map((item) => html`<li>${categoryLink(item, path, 'mobile-nav__category-link')}</li>`)}
            </ul>
          </nav>`
        : ''}
      <div class="mt-auto pt-4 d-flex flex-column gap-3 fs-7">
        <a class="text-reset" href="/search">搜索</a>
        <a class="text-reset" href="/pages/contact-details">联系方式</a>
        <a class="text-reset" href="/pages/store-locator">门店位置</a>
      </div>
    </div>
  </div>`;

/* ------------------------------------------------------------------ header ---- */

/**
 * The top of every page: the announcement bar, the row with the logo, the
 * categories, the search and the cart, and the phone drawer.
 *
 * The bar and the row are pinned to the top of the window by
 * `public/css/site.css`, so they stay visible while the page scrolls under them.
 *
 * The drawer is rendered after the `<header>` rather than inside it: the pinned
 * header carries a `z-index`, which makes it a stacking context, and Bootstrap
 * puts its offcanvas backdrop on `body` above that - a drawer inside the header
 * would end up underneath its own backdrop.
 */
export const header = (settings, cart, categories = [], path = '') => html`
  <header class="site-header">
    <div class="site-header__bar">
      ${announcementBar(settings)}
      <nav class="navbar bg-white p-0 border-bottom">
        <div class="container-fluid container-xl px-2">
          <div class="d-flex justify-content-center w-100 top-navbar align-items-center py-2 py-md-0">
            <div class="d-flex d-md-none me-auto flex-fill">
              <button class="nav-link border-0 bg-transparent p-2" type="button" data-bs-toggle="offcanvas" data-bs-target="#offcanvasNavbar" aria-controls="offcanvasNavbar" aria-label="展开菜单">
                ${icons.menu}
              </button>
            </div>
            <div class="d-flex">
              <div class="navbar-item">
                <a href="/" class="navbar-brand nav-link p-0 d-flex align-items-center h-100 me-2 me-lg-4" aria-label="Chen Furniture 首页">
                  ${svgLogo('header__heading-logo', 48)}
                </a>
              </div>
            </div>
            <div class="d-flex ms-auto flex-fill justify-content-end">
              ${categoryNav(categories, path)}
              <div class="d-flex align-items-center">
                <a href="/search" class="nav-link p-2" aria-label="搜索">${icons.search}</a>
                <button class="nav-link border-0 bg-transparent p-2 position-relative" type="button" data-bs-toggle="offcanvas" data-bs-target="#cart" aria-controls="cart" aria-label="打开购物车">
                  ${icons.cart}
                  <span class="cart-count badge rounded-pill bg-primary ${cart.count ? '' : 'd-none'}" data-cart-count>${cart.count}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </div>
  </header>
  ${mobileNav(categories, path)}`;
