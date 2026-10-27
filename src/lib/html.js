/**
 * Tiny HTML helpers.
 *
 * `html` is a tagged template that escapes every interpolation, so page code can
 * read like markup without ever forgetting an escape. Wrap trusted strings (for
 * example the body copy stored in the `page` sections) in `safe()`.
 *
 *   const title = 'B-Bag & "friends"';
 *   html`<h1>${title}</h1>`            // => <h1>B-Bag &amp; &quot;friends&quot;</h1>
 *   html`<div>${safe(sectionBody)}</div>`
 */
const SAFE = Symbol('safe-html');

export const safe = (value) => ({ [SAFE]: value === null || value === undefined ? '' : String(value) });

export const isSafe = (value) => Boolean(value) && typeof value === 'object' && SAFE in value;

export const esc = (value) =>
  String(value === null || value === undefined ? '' : value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

/** Flattens a value (string, number, nested array, safe fragment) into markup. */
const part = (value) => {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(part).join('');
  if (isSafe(value)) return value[SAFE];
  return esc(value);
};

export const render = (value) => part(value);

export const html = (strings, ...values) =>
  safe(strings.reduce((out, chunk, index) => out + (index ? part(values[index - 1]) : '') + chunk, ''));

/** Joins a list of pre-rendered fragments. */
export const join = (separator) => (items) => safe((items || []).map(part).join(separator));

/* ------------------------------------------------------------------ money ---- */

export const money = (amount, symbol = '¥') => {
  const value = Number(amount || 0);
  return `${symbol}${value.toFixed(2)}`;
};

/* ------------------------------------------------------------------ misc ----- */

/** "B-Lamp - Grey" -> "b-lamp-grey" (used for admin slugs and alt text). */
export const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Turns a DB integer flag into a boolean. */
export const bool = (value) => value === 1 || value === '1' || value === true;

export const classNames = (...values) => values.filter(Boolean).join(' ');
