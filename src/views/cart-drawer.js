import { html, money } from '../lib/html.js';
import { icons } from './icons.js';

/**
 * The drawer markup is rendered on the server and re-fetched from /cart/drawer
 * after every add / quantity change, so `public/js/site.js` only has to swap
 * innerHTML.
 */
export const cartDrawerContent = (settings, cart, symbol = '¥') => {
  if (!cart.items.length) {
    return html`
      <div class="container-fluid border-top border-secondary border-1 pt-2">
        <div class="d-flex justify-content-center align-items-center flex-column my-5 py-5">
          <h4 class="text-center fw-light">${settings.cart_empty_title || '购物车是空的'}</h4>
          <a href="/" class="btn btn-light rounded d-inline-block mt-3">${settings.cart_continue_label || '继续选购'}</a>
        </div>
      </div>`;
  }

  return html`
    <div class="w-100">
      <div class="container-fluid border-top border-secondary border-1 pt-3">
        <ul class="list-unstyled mb-0" data-cart-items>
          ${cart.items.map(
            (item) => html`
              <li class="cart-line d-flex gap-3 pb-3 mb-3 border-bottom" data-cart-line="${item.id}">
                <a href="/products/${item.handle}" class="cart-line__image flex-shrink-0">
                  <img src="${item.image}" alt="${item.title}" width="72" height="72" class="rounded object-fit-contain bg-product-image-colour">
                </a>
                <div class="flex-grow-1">
                  <a href="/products/${item.handle}" class="d-block text-reset text-decoration-none fs-7 fw-medium">${item.title}</a>
                  ${item.variantName ? html`<p class="fs-8 text-secondary mb-1">${item.variantName}</p>` : ''}
                  ${item.colour ? html`<p class="fs-8 text-secondary mb-1">${item.colour}</p>` : ''}
                  <div class="d-flex align-items-center justify-content-between mt-2">
                    <div class="qty-stepper d-inline-flex align-items-center border rounded">
                      <button type="button" class="btn btn-sm px-2 py-0 border-0" data-cart-action="dec" data-line="${item.id}" aria-label="减少数量">${icons.minus}</button>
                      <span class="px-2 fs-7" data-line-qty>${item.qty}</span>
                      <button type="button" class="btn btn-sm px-2 py-0 border-0" data-cart-action="inc" data-line="${item.id}" aria-label="增加数量">${icons.plus}</button>
                    </div>
                    <span class="fs-7 fw-bold">${money(item.lineTotal, symbol)}</span>
                  </div>
                  <button type="button" class="btn btn-link btn-sm p-0 fs-8 text-secondary text-decoration-none" data-cart-action="remove" data-line="${item.id}">移除</button>
                </div>
              </li>`
          )}
        </ul>
      </div>
      <div class="cart-drawer__footer pt-3">
        <h5 class="m-0 d-flex flex-grow-1 justify-content-between fw-normal mb-3">
          <span>小计：</span>
          <span class="body-font fw-bold" data-cart-subtotal>${money(cart.subtotal, symbol)}</span>
        </h5>
        <a href="/checkout" class="btn btn-primary w-100 rounded d-flex align-items-center justify-content-center gap-2 fw-bold">
          ${icons.lock} ${settings.cart_checkout_label || '安全结账'}
        </a>
        <p class="fs-8 text-center text-secondary mt-2 mb-0">${settings.cart_footer_note || ''}</p>
      </div>
    </div>`;
};

export const cartDrawer = (settings, cart, symbol = '¥') => html`
  <div class="offcanvas offcanvas-end cart--offcanvas" data-bs-backdrop="static" tabindex="-1" id="cart" aria-labelledby="cartDrawerLabel">
    <div class="offcanvas-header py-3 d-flex justify-content-between px-3">
      <h5 class="offcanvas-title d-flex align-items-center fw-light mb-0" id="cartDrawerLabel">
        ${icons.cart}
        <span class="ms-2">${settings.cart_title || '购物车'}</span>
      </h5>
      <button type="button" class="btn btn-link p-0 text-reset" data-bs-dismiss="offcanvas" aria-label="关闭购物车">
        ${icons.close}
      </button>
    </div>
    <div class="offcanvas-body px-3 pt-0 pb-2 d-flex flex-column" data-cart-contents>
      ${cartDrawerContent(settings, cart, symbol)}
    </div>
  </div>`;
