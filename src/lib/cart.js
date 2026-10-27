/**
 * Cookie backed cart that lives in D1.
 *
 * The cookie only ever holds an opaque cart id, the line items are read back
 * from `carts` / `cart_items` on every request so the drawer markup can be
 * rendered on the server.
 */
import { money } from './html.js';
import { readCookie, setCookie } from './cookies.js';

export const CART_COOKIE = 'el_cart';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 32);

export const cartId = (request) => readCookie(request, CART_COOKIE);

export const setCartCookie = (headers, id) => setCookie(headers, CART_COOKIE, id, { maxAge: MAX_AGE });

export const clearCartCookie = (headers) => setCookie(headers, CART_COOKIE, '', { maxAge: 0 });

const ensureCart = async (db, id) => {
  await db.prepare('INSERT OR IGNORE INTO carts (id) VALUES (?)').bind(id).run();
  return id;
};

/** Creates a cart id for a visitor who does not have one yet. */
export const ensureCartId = async (db, id) => ensureCart(db, id || newId());

const LINE_SQL = `SELECT ci.id, ci.product_id, ci.variant_id, ci.qty, ci.colour, ci.unit_price,
                         p.handle, p.title, p.image, p.price AS product_price, p.sold_out,
                         v.name AS variant_name, v.price AS variant_price, v.image AS variant_image,
                         v.dims AS variant_dims, v.available AS variant_available
                    FROM cart_items ci
                    JOIN products p ON p.id = ci.product_id
               LEFT JOIN product_variants v ON v.id = ci.variant_id
                   WHERE ci.cart_id = ? ORDER BY ci.id`;

export const loadCart = async (db, id) => {
  if (!id) return emptyCart();
  const { results } = await db.prepare(LINE_SQL).bind(id).all();
  const items = (results || []).map((row) => {
    const price = Number(
      row.unit_price ?? (row.variant_price === null || row.variant_price === undefined ? row.product_price : row.variant_price)
    );
    return {
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id,
      handle: row.handle,
      title: row.title,
      image: row.variant_image || row.image,
      variantName: row.variant_name || '',
      colour: row.colour || '',
      qty: row.qty,
      price,
      lineTotal: price * row.qty,
      soldOut: Boolean(row.sold_out),
      variantAvailable: row.variant_available === null || row.variant_available === undefined ? true : Boolean(row.variant_available),
    };
  });
  const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
  const count = items.reduce((total, item) => total + item.qty, 0);
  return { id, items, count, subtotal, subtotalLabel: money(subtotal) };
};

const emptyCart = () => ({ id: '', items: [], count: 0, subtotal: 0, subtotalLabel: money(0) });

export const addItem = async (db, id, { productId, variantId = 0, colour = '', qty = 1 }) => {
  await ensureCart(db, id);
  const variant = variantId
    ? await db.prepare('SELECT id, price, available FROM product_variants WHERE id = ? AND product_id = ?').bind(variantId, productId).first()
    : null;
  const product = await db.prepare('SELECT price FROM products WHERE id = ?').bind(productId).first();
  if (!product) throw new Error('找不到这个商品');

  const unitPrice = Number(variant && variant.price !== null && variant.price !== undefined ? variant.price : product.price);
  const quantity = Math.max(1, Math.min(99, Number(qty) || 1));

  await db
    .prepare(
      `INSERT INTO cart_items (cart_id, product_id, variant_id, qty, colour, unit_price)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (cart_id, product_id, variant_id)
       DO UPDATE SET qty = MIN(99, cart_items.qty + excluded.qty)`
    )
    .bind(id, productId, variant ? variant.id : 0, quantity, colour, unitPrice)
    .run();
  await touch(db, id);
  return loadCart(db, id);
};

/** Used by the "add to basket" form: replaces the quantity for that line. */
export const setQty = async (db, id, itemId, qty) => {
  const quantity = Math.max(0, Math.min(99, Number(qty) || 0));
  const item = await db
    .prepare('SELECT id, product_id, variant_id, colour, unit_price FROM cart_items WHERE id = ? AND cart_id = ?')
    .bind(itemId, id)
    .first();
  if (!item) return loadCart(db, id);

  if (quantity === 0) {
    await db.prepare('DELETE FROM cart_items WHERE id = ?').bind(itemId).run();
  } else {
    await db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').bind(quantity, itemId).run();
  }
  await touch(db, id);
  return loadCart(db, id);
};

export const setLine = async (db, id, { productId, variantId = 0, colour = '', qty = 1 }) => {
  const existing = await db
    .prepare('SELECT id FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id = ?')
    .bind(id, productId, variantId)
    .first();
  if (existing) return setQty(db, id, existing.id, qty);
  return addItem(db, id, { productId, variantId, colour, qty });
};

export const removeItem = async (db, id, itemId) => {
  await db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').bind(itemId, id).run();
  await touch(db, id);
  return loadCart(db, id);
};

export const clear = async (db, id) => {
  await db.prepare('DELETE FROM cart_items WHERE cart_id = ?').bind(id).run();
  await touch(db, id);
  return loadCart(db, id);
};

const touch = (db, id) =>
  db.prepare("UPDATE carts SET updated_at = datetime('now') WHERE id = ?").bind(id).run();
