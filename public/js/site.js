/**
 * Progressive enhancement for the replica.
 *
 * Everything here also works without JavaScript (the cart forms post normally and
 * the drawer is rendered on the server), this file only makes the site feel like
 * the original theme: adding to the basket opens the drawer in place, quantities
 * change without a page load and the collection pickers swap rows.
 */
(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  /* ------------------------------------------------------------------ cart ---- */

  const post = async (url, body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'x-requested-with': 'fetch', accept: 'application/json' },
      body,
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  };

  const drawerBody = () => $('[data-cart-contents]');

  const applyCart = (data) => {
    if (!data || typeof data.drawer !== 'string') return;
    const body = drawerBody();
    if (body) body.innerHTML = data.drawer;

    $$('[data-cart-count]').forEach((badge) => {
      badge.textContent = data.count;
      badge.classList.toggle('d-none', !data.count);
    });
    $$('[data-cart-subtotal]').forEach((node) => {
      node.textContent = `¥${Number(data.subtotal).toFixed(2)}`;
    });
  };

  const openDrawer = () => {
    const element = $('#cart');
    if (!element || !window.bootstrap) return;
    window.bootstrap.Offcanvas.getOrCreateInstance(element).show();
  };

  // Add to basket (PDP form).
  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-product-form]');
    if (!form) return;
    event.preventDefault();

    const button = $('[data-add-to-cart]', form);
    const message = $('[data-form-message]', form);
    if (button) button.setAttribute('disabled', 'disabled');

    try {
      applyCart(await post(form.action || '/cart/add', new FormData(form)));
      openDrawer();
      if (message) message.textContent = '';
    } catch (error) {
      if (message) message.textContent = '抱歉，暂时无法加入购物车。';
    } finally {
      if (button) button.removeAttribute('disabled');
    }
  });

  // Quantity and remove buttons inside the drawer.
  document.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-cart-action]');
    if (!trigger) return;
    event.preventDefault();

    const action = trigger.dataset.cartAction;
    const lineElement = trigger.closest('[data-cart-line]');
    const qtyElement = lineElement ? $('[data-line-qty]', lineElement) : null;
    const current = qtyElement ? Number(qtyElement.textContent) : 1;

    const body = new FormData();
    body.set('line', trigger.dataset.line);

    let url = '/cart/change';
    if (action === 'remove') {
      url = '/cart/remove';
    } else {
      body.set('qty', action === 'inc' ? current + 1 : Math.max(0, current - 1));
    }

    trigger.setAttribute('disabled', 'disabled');
    try {
      applyCart(await post(url, body));
    } catch (error) {
      trigger.removeAttribute('disabled');
    }
  });
})();

/* ---------------------------------------------------------------------------- *
 * The smaller interactions: colour/size pickers, quantity steppers, collection
 * pickers, sorting, newsletter signup and tooltips.
 * ---------------------------------------------------------------------------- */
(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  /* ------------------------------------------------------- colour / size ---- */

  $$('[data-product-form]').forEach((form) => {
    const colourInput = $('[data-colour-input]', form);
    const priceLabel = document.querySelector('[data-price-label]');
    const basePrice = $('[data-product-price]') ? $('[data-product-price]').dataset.basePrice : '';

    $$('[data-colour-choice]', form).forEach((swatch) => {
      swatch.addEventListener('click', () => {
        $$('[data-colour-choice]', form).forEach((item) => item.classList.remove('is-active'));
        swatch.classList.add('is-active');
        if (colourInput) colourInput.value = swatch.dataset.colourChoice;
      });
    });

    const radios = $$('input[name="variant_id"]', form);

    const syncPrice = () => {
      const checked = radios.filter((radio) => radio.checked)[0];
      const price = checked ? checked.dataset.variantPrice : basePrice;
      if (priceLabel && price) priceLabel.textContent = `¥${Number(price).toFixed(2)}`;
      $$('.variant-option', form).forEach((option) => {
        const input = $('input', option);
        option.classList.toggle('is-active', Boolean(input && input.checked));
      });
    };

    radios.forEach((radio) => radio.addEventListener('change', syncPrice));
    if (radios.length) syncPrice();
  });

  $$('[data-qty-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = $('input[name="qty"]', button.closest('.qty-stepper'));
      if (!input) return;
      const next = Number(input.value || 1) + Number(button.dataset.qtyStep);
      input.value = Math.min(99, Math.max(1, next));
    });
  });

  /* ------------------------------------------------------ collection rows ---- */

  $$('[data-collection-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.collectionTab;
      $$('[data-collection-tab]').forEach((item) => {
        item.classList.toggle('active', item === tab);
        item.classList.toggle('inactive', item !== tab);
      });
      $$('[data-collection-row]').forEach((row) => {
        row.classList.toggle('d-none', row.dataset.collectionRow !== target);
      });
    });
  });

  /* -------------------------------------------------------------- sorting ---- */

  const sortSelect = $('[data-sort-select]');
  if (sortSelect && sortSelect.form) sortSelect.addEventListener('change', () => sortSelect.form.submit());

  /* ----------------------------------------------------------- newsletter ---- */

  $$('[data-newsletter-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const note = $('[data-newsletter-note]', form);
      try {
        const response = await fetch('/newsletter', {
          method: 'POST',
          headers: { 'x-requested-with': 'fetch', accept: 'application/json' },
          body: new FormData(form),
        });
        const data = await response.json();
        if (note) note.textContent = data.message || '谢谢，您已成功订阅。';
        if (data.ok) form.reset();
      } catch (error) {
        if (note) note.textContent = '请检查您的邮箱地址，然后重试。';
      }
    });
  });

  /* --------------------------------------------------------------- admin ---- */

  // Destructive admin actions ask first; without JS the form just submits.
  $$('[data-admin-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.dataset.adminConfirm)) event.preventDefault();
    });
  });

  // The repeaters on the product screen (specs, features, sizes, colours, the
  // gallery). The rows post as arrays in DOM order, so moving a row here is what
  // stores it in that order. Without JS the form still posts every row it
  // rendered - only adding, removing and reordering need this.
  $$('[data-repeat]').forEach((group) => {
    const list = group.querySelector('[data-repeat-list]');
    const template = group.querySelector('template[data-repeat-template]');
    const add = group.querySelector('[data-repeat-add]');
    if (!list || !template) return;

    const rows = () => Array.from(list.querySelectorAll('[data-repeat-row]'));

    if (add) {
      add.addEventListener('click', () => {
        const row = template.content.firstElementChild.cloneNode(true);
        list.appendChild(row);
        const first = row.querySelector('input, select');
        if (first) first.focus();
      });
    }

    group.addEventListener('click', (event) => {
      const button = event.target.closest('[data-repeat-remove], [data-repeat-move]');
      if (!button) return;
      const row = button.closest('[data-repeat-row]');
      if (!row) return;
      if (button.hasAttribute('data-repeat-remove')) {
        const all = rows();
        // Keep one row on screen: an empty list has no inputs and the section
        // then reads as if it had been removed.
        if (all.length > 1) row.remove();
        else row.querySelectorAll('input, select').forEach((input) => { input.value = ''; });
        return;
      }
      const up = button.getAttribute('data-repeat-move') === 'up';
      const sibling = up ? row.previousElementSibling : row.nextElementSibling;
      if (sibling) list.insertBefore(up ? row : sibling, up ? sibling : row);
    });

    // Drag a row by its handle to reorder it. The handle is the row itself but
    // only while the pointer is not inside a field, so text selection still works.
    let dragging = null;
    group.addEventListener('mousedown', (event) => {
      const row = event.target.closest('[data-repeat-row]');
      if (!row) return;
      row.draggable = !event.target.closest('input, select, textarea, button');
    });
    list.addEventListener('dragstart', (event) => {
      const row = event.target.closest('[data-repeat-row]');
      if (!row || !row.draggable) return;
      dragging = row;
      row.classList.add('opacity-50');
      event.dataTransfer.effectAllowed = 'move';
    });
    list.addEventListener('dragover', (event) => {
      if (!dragging) return;
      event.preventDefault();
      const over = event.target.closest('[data-repeat-row]');
      if (!over || over === dragging) return;
      const box = over.getBoundingClientRect();
      list.insertBefore(dragging, event.clientY < box.top + box.height / 2 ? over : over.nextElementSibling);
    });
    list.addEventListener('dragend', () => {
      if (dragging) dragging.classList.remove('opacity-50');
      dragging = null;
    });
  });

  /* ------------------------------------------------------------- tooltips ---- */

  if (window.bootstrap && window.bootstrap.Tooltip) {
    $$('[data-bs-toggle="tooltip"]').forEach((element) => window.bootstrap.Tooltip.getOrCreateInstance(element));
  }
})();

