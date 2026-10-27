import { html, money } from '../lib/html.js';
import { icons } from './icons.js';
import { breadcrumbs } from './partials.js';

export const cartSummary = (cart, symbol = '£') => html`
  <div class="cart-summary border rounded-3 p-4 bg-white">
    <h2 class="h5 fw-normal mb-3">订单摘要</h2>
    <div class="d-flex justify-content-between fs-7 mb-2">
      <span>小计</span>
      <span class="fw-bold" data-cart-subtotal>${money(cart.subtotal, symbol)}</span>
    </div>
    <div class="d-flex justify-content-between fs-7 mb-2">
      <span>运费</span>
      <span class="text-secondary">提交后由客服确认</span>
    </div>
    <div class="d-flex justify-content-between fs-6 border-top pt-3 mt-3">
      <span class="fw-bold">合计</span>
      <span class="fw-bold">${money(cart.subtotal, symbol)}</span>
    </div>
    <a href="/checkout" class="btn btn-primary w-100 rounded mt-3 d-flex align-items-center justify-content-center gap-2 fw-bold">
      ${icons.lock} 安全结账
    </a>
    <a href="/products" class="btn btn-link w-100 rounded mt-2 text-decoration-none">继续选购</a>
  </div>`;

const cartLine = (item, symbol) => html`
  <li class="cart-line d-flex gap-3 py-3 border-bottom" data-cart-line="${item.id}">
    <a href="/products/${item.handle}" class="flex-shrink-0">
      <img src="${item.image}" alt="${item.title}" width="96" height="96" class="rounded object-fit-contain bg-product-image-colour">
    </a>
    <div class="flex-grow-1">
      <div class="d-flex justify-content-between gap-3">
        <a href="/products/${item.handle}" class="d-block text-reset text-decoration-none fw-medium mb-1">${item.title}</a>
        <span class="fw-bold fs-7 text-nowrap">${money(item.lineTotal, symbol)}</span>
      </div>
      ${item.variantName ? html`<p class="fs-8 text-secondary mb-1">${item.variantName}</p>` : ''}
      ${item.colour ? html`<p class="fs-8 text-secondary mb-2">颜色：${item.colour}</p>` : ''}
      <div class="d-flex align-items-center gap-3">
        <form method="post" action="/cart/change" class="d-inline-flex align-items-center">
          <input type="hidden" name="line" value="${item.id}">
          <div class="qty-stepper d-inline-flex align-items-center border rounded">
            <button type="submit" name="qty" value="${Math.max(0, item.qty - 1)}" class="btn btn-sm px-2 py-1 border-0" aria-label="减少数量">${icons.minus}</button>
            <span class="px-2 fs-7" data-line-qty>${item.qty}</span>
            <button type="submit" name="qty" value="${item.qty + 1}" class="btn btn-sm px-2 py-1 border-0" aria-label="增加数量">${icons.plus}</button>
          </div>
        </form>
        <button type="button" class="btn btn-link p-0 fs-8 text-secondary text-decoration-none" data-cart-action="remove" data-line="${item.id}">移除</button>
      </div>
    </div>
  </li>`;

export const cartPage = ({ cart, settings, symbol = '£' }) => html`
  <div class="container pt-3">
    ${breadcrumbs([{ label: '首页', url: '/' }, { label: '购物车' }])}
  </div>
  <section class="cart-page py-4">
    <div class="container">
      <h1 class="heading-font text-uppercase fs-2 mb-4">${settings.cart_title || '购物车'}</h1>
      ${cart.items.length
        ? html`<div class="row g-4">
            <div class="col-12 col-lg-8">
              <ul class="list-unstyled mb-0" data-cart-items>
                ${cart.items.map((item) => cartLine(item, symbol))}
              </ul>
              <p class="fs-8 text-secondary mt-3 mb-0">${settings.cart_footer_note || ''}</p>
            </div>
            <div class="col-12 col-lg-4">${cartSummary(cart, symbol)}</div>
          </div>`
        : html`<div class="d-flex justify-content-center align-items-center flex-column py-5">
            <h2 class="h4 fw-light mb-3">${settings.cart_empty_title || '购物车是空的'}</h2>
            <a href="/" class="btn btn-light rounded px-4">${settings.cart_continue_label || '继续选购'}</a>
          </div>`}
    </div>
  </section>`;

export const checkoutPage = ({ cart, symbol = '£' }) => html`
  <div class="container pt-3">
    ${breadcrumbs([{ label: '首页', url: '/' }, { label: '购物车', url: '/cart' }, { label: '结账' }])}
  </div>
  <section class="checkout-page py-4">
    <div class="container">
      <h1 class="heading-font text-uppercase fs-2 mb-2">结账</h1>
      <p class="text-secondary fs-7 mb-4">
        本站暂未接入支付渠道：提交表单后，订单会作为询盘记录下来，购物车随即清空。
      </p>
      <div class="row g-4">
        <div class="col-12 col-lg-7">
          <form method="post" action="/checkout" class="row g-3">
            <div class="col-12 col-md-6">
              <label class="form-label fs-8 text-uppercase" for="checkout-name">姓名</label>
              <input class="form-control" id="checkout-name" name="name" required autocomplete="name">
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label fs-8 text-uppercase" for="checkout-email">邮箱</label>
              <input class="form-control" type="email" id="checkout-email" name="email" required autocomplete="email">
            </div>
            <div class="col-12">
              <label class="form-label fs-8 text-uppercase" for="checkout-address">收货地址</label>
              <input class="form-control" id="checkout-address" name="address" required autocomplete="street-address">
            </div>
            <div class="col-12">
              <label class="form-label fs-8 text-uppercase" for="checkout-notes">订单备注</label>
              <textarea class="form-control" id="checkout-notes" name="message" rows="3"></textarea>
            </div>
            <div class="col-12">
              <button class="btn btn-primary rounded px-4 py-2 fw-bold text-uppercase" type="submit" ${cart.items.length ? '' : 'disabled'}>
                提交订单
              </button>
            </div>
          </form>
        </div>
        <div class="col-12 col-lg-5">${cartSummary(cart, symbol)}</div>
      </div>
    </div>
  </section>`;

export const thankYouPage = ({ name = '' }) => html`
  <section class="py-5 my-4">
    <div class="container text-center">
      <h1 class="heading-font text-uppercase fs-2 mb-3">谢谢${name ? `，${name}` : ''}</h1>
      <p class="text-secondary mb-4">已收到你的订单，客服会尽快与你联系确认。</p>
      <a href="/products" class="btn btn-primary rounded px-4">继续选购</a>
    </div>
  </section>`;
