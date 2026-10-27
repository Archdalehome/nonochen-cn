/**
 * All D1 access lives here so the renderers can stay declarative.
 *
 * Reads that every page needs (settings, menus, sections) are memoised for
 * `TTL` inside the isolate; the admin endpoints call `invalidate()` after a
 * write so the change shows up immediately.
 */
const TTL = 30_000;
const store = new Map();

const memo = async (key, loader, ttl = TTL) => {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  const value = await loader();
  store.set(key, { value, expires: now + ttl });
  return value;
};

export const invalidate = (prefix = '') => {
  for (const key of [...store.keys()]) {
    if (!prefix || key.startsWith(prefix)) store.delete(key);
  }
};

/* --------------------------------------------------------------- helpers ---- */

const parseJson = (value, fallback) => {
  try {
    const parsed = JSON.parse(value || '');
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
};

const hydrate = (row) =>
  row && {
    ...row,
    features: parseJson(row.features, []),
    specs: parseJson(row.specs, []),
    priceFrom: Boolean(row.price_from),
    soldOut: Boolean(row.sold_out),
    isNew: Boolean(row.is_new),
    inGrid: Boolean(row.show_in_home_grid),
  };

const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const bucket = map.get(row[key]);
    if (bucket) bucket.push(row);
    else map.set(row[key], [row]);
  }
  return map;
};

/* -------------------------------------------------------------- settings ---- */

export const settings = (db) =>
  memo('settings', async () => {
    const { results } = await db.prepare('SELECT key, value FROM settings').all();
    return Object.fromEntries((results || []).map((row) => [row.key, row.value]));
  });

export const saveSetting = async (db, key, value) => {
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(key, value)
    .run();
  invalidate('settings');
};

/** Several settings in one round trip - the admin forms that write more than one key. */
export const saveSettings = async (db, entries) => {
  const pairs = Object.entries(entries || {});
  if (!pairs.length) return;
  await db.batch(
    pairs.map(([key, value]) =>
      db
        .prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .bind(key, String(value))
    )
  );
  invalidate('settings');
};

/* ------------------------------------------------------------------ menus ---- */

/**
 * The link columns the footer repeats on every page. The header menu used to be
 * read from `menu_items` too; the mobile drawer shows the managed categories
 * instead, so nothing else reads that location any more.
 */
export const footerGroups = (db) =>
  memo('menu:footer-groups', async () => {
    const { results } = await db
      .prepare(
        `SELECT id, parent_id, kind, group_label, label, url, sort_order
           FROM menu_items WHERE location = 'footer' AND enabled = 1 ORDER BY sort_order, id`
      )
      .all();
    const rows = results || [];
    const children = groupBy(rows, 'parent_id');
    return rows
      .filter((row) => row.kind === 'group_heading')
      .map((group) => ({ ...group, links: children.get(group.id) || [] }));
  });

/* ------------------------------------------------------------- footer menu ---- */

const FOOTER_MENU_COLUMNS = 'id, parent_id, kind, label, url, sort_order, enabled';

const hydrateFooterRow = (row) => ({ ...row, enabled: Boolean(row.enabled) });

/**
 * The footer's columns as /admin/footer edits them: uncached on purpose (the
 * screen has to see its own writes) and hidden rows included, so a column that
 * was switched off stays editable instead of turning into a dead end.
 * `footerGroups()` above is the storefront's read only view of the same rows.
 */
export const footerMenu = async (db) => {
  const { results } = await db
    .prepare(`SELECT ${FOOTER_MENU_COLUMNS} FROM menu_items WHERE location = 'footer' ORDER BY sort_order, id`)
    .all();
  const rows = results || [];
  const children = groupBy(rows, 'parent_id');
  return rows
    .filter((row) => row.kind === 'group_heading')
    .map((group) => ({ ...hydrateFooterRow(group), links: (children.get(group.id) || []).map(hydrateFooterRow) }));
};

/** One footer row of a given kind, or null when that id is not one. */
const footerRow = async (db, id, kind) => {
  const row = await db
    .prepare(`SELECT ${FOOTER_MENU_COLUMNS} FROM menu_items WHERE id = ? AND location = 'footer' AND kind = ?`)
    .bind(Number(id) || 0, kind)
    .first();
  return row ? hydrateFooterRow(row) : null;
};

export const footerGroupById = (db, id) => footerRow(db, id, 'group_heading');
export const footerLinkById = (db, id) => footerRow(db, id, 'link');

/** The next free slot among the footer's columns, or among one column's links. */
const nextFooterOrder = async (db, parentId = null) => {
  const statement = parentId
    ? db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM menu_items WHERE parent_id = ?').bind(Number(parentId) || 0)
    : db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM menu_items WHERE location = 'footer' AND parent_id IS NULL");
  const row = await statement.first();
  return (row && row.next) || 1;
};

export const createFooterGroup = async (db, values) => {
  const order = Number.isFinite(values.position) ? values.position : await nextFooterOrder(db);
  await db
    .prepare(
      `INSERT INTO menu_items (location, parent_id, kind, column_no, group_label, label, url, image, badge, sort_order, enabled)
       VALUES ('footer', NULL, 'group_heading', 1, NULL, ?1, '', NULL, NULL, ?2, ?3)`
    )
    .bind(values.label, order, values.enabled)
    .run();
  invalidate('menu:');
};

/**
 * Renames one column. The links under it carry the heading in `group_label`
 * (that is how the seed writes them too), so they are kept in step - the
 * storefront reads the heading from the row above them either way.
 */
export const updateFooterGroup = async (db, id, values) => {
  const key = Number(id) || 0;
  await db
    .prepare(
      `UPDATE menu_items SET label = ?1, sort_order = COALESCE(?2, sort_order), enabled = ?3
        WHERE id = ?4 AND location = 'footer' AND kind = 'group_heading'`
    )
    .bind(values.label, values.position, values.enabled, key)
    .run();
  await db.prepare('UPDATE menu_items SET group_label = ?1 WHERE parent_id = ?2').bind(values.label, key).run();
  invalidate('menu:');
};

/** Deletes a column along with the links under it. */
export const deleteFooterGroup = async (db, id) => {
  const key = Number(id) || 0;
  await db.prepare('DELETE FROM menu_items WHERE parent_id = ?').bind(key).run();
  const result = await db
    .prepare("DELETE FROM menu_items WHERE id = ? AND location = 'footer' AND kind = 'group_heading'")
    .bind(key)
    .run();
  invalidate('menu:');
  return Boolean(result.meta && result.meta.changes);
};

/** Adds one link to a column. A parent that is not a column writes nothing. */
export const createFooterLink = async (db, values) => {
  const order = Number.isFinite(values.position) ? values.position : await nextFooterOrder(db, values.parentId);
  const result = await db
    .prepare(
      `INSERT INTO menu_items (location, parent_id, kind, column_no, group_label, label, url, image, badge, sort_order, enabled)
       SELECT 'footer', g.id, 'link', 1, g.label, ?1, ?2, NULL, NULL, ?3, ?4
         FROM menu_items g
        WHERE g.id = ?5 AND g.kind = 'group_heading' AND g.location = 'footer'`
    )
    .bind(values.label, values.url, order, values.enabled, Number(values.parentId) || 0)
    .run();
  invalidate('menu:');
  return Boolean(result.meta && result.meta.changes);
};

export const updateFooterLink = async (db, id, values) => {
  const result = await db
    .prepare(
      `UPDATE menu_items SET label = ?1, url = ?2, sort_order = COALESCE(?3, sort_order), enabled = ?4
        WHERE id = ?5 AND location = 'footer' AND kind = 'link'`
    )
    .bind(values.label, values.url, values.position, values.enabled, Number(id) || 0)
    .run();
  invalidate('menu:');
  return Boolean(result.meta && result.meta.changes);
};

export const deleteFooterLink = async (db, id) => {
  const result = await db
    .prepare("DELETE FROM menu_items WHERE id = ? AND location = 'footer' AND kind = 'link'")
    .bind(Number(id) || 0)
    .run();
  invalidate('menu:');
  return Boolean(result.meta && result.meta.changes);
};

/**
 * Moves one row one step up or down inside its list and renumbers that list
 * 1..n, the way `moveCategory` renumbers the header row.
 */
const reorderFooterRows = async (db, list, id, direction) => {
  const index = list.findIndex((item) => item.id === Number(id));
  if (index < 0) return false;
  const neighbour = direction === 'up' ? index - 1 : index + 1;
  if (neighbour < 0 || neighbour >= list.length) return false;

  const reordered = [...list];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(neighbour, 0, moved);
  await db.batch(
    reordered.map((item, order) => db.prepare('UPDATE menu_items SET sort_order = ? WHERE id = ?').bind(order + 1, item.id))
  );
  invalidate('menu:');
  return true;
};

/** Swaps one column with its neighbour. */
export const moveFooterGroup = async (db, id, direction) =>
  reorderFooterRows(db, await footerMenu(db), id, direction);

/** Swaps one link with its neighbour inside the same column. */
export const moveFooterLink = async (db, id, direction) => {
  const link = await footerLinkById(db, id);
  if (!link) return false;
  const groups = await footerMenu(db);
  const parent = groups.find((group) => group.id === link.parent_id);
  return reorderFooterRows(db, (parent && parent.links) || [], id, direction);
};

/* --------------------------------------------------------------- content ---- */

export const sections = (db, page = 'home') =>
  memo(`sections:${page}`, async () => {
    const { results } = await db
      .prepare(
        `SELECT id, page, type, name, position, data FROM sections
          WHERE page = ? AND enabled = 1 ORDER BY position, id`
      )
      .bind(page)
      .all();
    return (results || []).map((row) => ({ ...row, data: parseJson(row.data, {}) }));
  });

/**
 * The blocks of one page as the admin edits them: uncached on purpose (the screen
 * has to see its own writes) and hidden rows included, so a disabled hero stays
 * editable instead of turning into a dead end in the admin.
 */
export const pageSections = async (db, page = 'home') => {
  const { results } = await db
    .prepare(
      `SELECT id, page, type, name, position, enabled, data FROM sections
        WHERE page = ? ORDER BY position, id`
    )
    .bind(page)
    .all();
  return (results || []).map((row) => ({ ...row, enabled: Boolean(row.enabled), data: parseJson(row.data, {}) }));
};

/** Writes one section's JSON payload back - the storefront renders it next request. */
export const saveSectionData = async (db, id, data) => {
  const result = await db.prepare('UPDATE sections SET data = ? WHERE id = ?').bind(JSON.stringify(data), Number(id)).run();
  invalidate('sections');
  return Boolean(result.meta && result.meta.changes);
};

/**
 * Shows or hides one homepage block without touching its payload, so a block
 * switched off here comes back exactly as it was.
 */
export const saveSectionEnabled = async (db, id, enabled) => {
  const result = await db
    .prepare('UPDATE sections SET enabled = ? WHERE id = ?')
    .bind(enabled ? 1 : 0, Number(id))
    .run();
  invalidate('sections');
  return Boolean(result.meta && result.meta.changes);
};

/* ------------------------------------------------------------ collections ---- */

export const collections = (db) =>
  memo('collections', async () => {
    const { results } = await db
      .prepare(
        `SELECT c.handle, c.title, c.subtitle, c.description, c.sort_order,
                (SELECT COUNT(*) FROM product_collections pc WHERE pc.collection_handle = c.handle) AS product_count
           FROM collections c ORDER BY c.sort_order, c.title`
      )
      .all();
    return (results || []).map((row) => ({ ...row, productCount: row.product_count }));
  });

export const collection = async (db, handle) => {
  const all = await collections(db);
  return all.find((row) => row.handle === handle) || null;
};

/** The real collection handles - the admin warns about link overrides that miss. */
export const collectionHandles = async (db) => {
  const { results } = await db.prepare('SELECT handle FROM collections ORDER BY handle').all();
  return (results || []).map((row) => row.handle);
};

/* ------------------------------------------------------------ categories ---- */

const CATEGORY_COLUMNS = 'id, slug, name, url, filter_type, filter_value, position, enabled';

/** An empty `url` means "link at the built in /category/<slug> page". */
const hydrateCategory = (row) => ({
  ...row,
  enabled: Boolean(row.enabled),
  filterType: row.filter_type,
  filterValue: row.filter_value,
  href: row.url || `/category/${row.slug}`,
});

/** The categories in the header row and the mobile menu (memoised). */
export const categories = (db) =>
  memo('categories', async () => {
    const { results } = await db
      .prepare(`SELECT ${CATEGORY_COLUMNS} FROM categories WHERE enabled = 1 ORDER BY position, id`)
      .all();
    return (results || []).map(hydrateCategory);
  });

/** Uncached on purpose: the admin has to see its own writes, disabled rows included. */
export const allCategories = async (db) => {
  const { results } = await db.prepare(`SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY position, id`).all();
  return (results || []).map(hydrateCategory);
};

export const categoryBySlug = async (db, slug) => {
  const row = await db.prepare(`SELECT ${CATEGORY_COLUMNS} FROM categories WHERE slug = ?`).bind(slug).first();
  return row ? hydrateCategory(row) : null;
};

export const categorySlugTaken = async (db, slug, exceptId = 0) => {
  const row = await db
    .prepare('SELECT id FROM categories WHERE slug = ? AND id != ?')
    .bind(slug, Number(exceptId) || 0)
    .first();
  return Boolean(row);
};

export const createCategory = async (db, values) => {
  const next = await db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM categories').first();
  const position = Number.isFinite(values.position) ? values.position : (next && next.position) || 1;
  await db
    .prepare(
      `INSERT INTO categories (slug, name, url, filter_type, filter_value, position, enabled)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(values.slug, values.name, values.url, values.filterType, values.filterValue, position, values.enabled)
    .run();
  invalidate('categories');
};

export const updateCategory = async (db, id, values) => {
  await db
    .prepare(
      `UPDATE categories
          SET slug = ?1, name = ?2, url = ?3, filter_type = ?4, filter_value = ?5,
              position = COALESCE(?6, position), enabled = ?7, updated_at = datetime('now')
        WHERE id = ?8`
    )
    .bind(values.slug, values.name, values.url, values.filterType, values.filterValue, values.position, values.enabled, id)
    .run();
  invalidate('categories');
};

export const deleteCategory = async (db, id) => {
  await db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  invalidate('categories');
};

/** Swaps the category with its neighbour and renumbers the whole list 1..n. */
export const moveCategory = async (db, id, direction) => {
  const list = await allCategories(db);
  const index = list.findIndex((item) => item.id === Number(id));
  if (index < 0) return false;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return false;

  const reordered = [...list];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(target, 0, moved);
  await db.batch(
    reordered.map((item, position) =>
      db
        .prepare("UPDATE categories SET position = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(position + 1, item.id)
    )
  );
  invalidate('categories');
  return true;
};

/** The products a /category/<slug> page lists, based on the row's filter. */
export const productsByCategory = async (db, item, limit = 120) => {
  if (item.filterType === 'all' || !item.filterValue) return selectProducts(db, { limit });
  if (item.filterType === 'collection') return productList(db, { collection: item.filterValue, limit });
  const value = String(item.filterValue).toLowerCase();
  return selectProducts(db, {
    where: 'LOWER(p.cat_handle) = ? OR LOWER(p.cat_label) = ?',
    params: [value, value],
    limit,
  });
};


/* --------------------------------------------------------------- products ---- */

const PRODUCT_COLUMNS = `p.id, p.handle, p.title, p.short_title, p.price, p.compare_at_price, p.price_from,
  p.badge, p.image, p.cat_handle, p.cat_label, p.colour, p.colour_hex, p.summary, p.description,
  p.features, p.specs, p.shipping_note, p.collection_handle, p.sold_out, p.is_new,
  p.show_in_home_grid, p.sort_order, p.seo_title, p.seo_description`;

/** Attaches `colours` and `sizes` arrays to a list of hydrated products. */
const withVariants = async (db, products) => {
  if (!products.length) return products;
  const ids = products.map((product) => product.id);
  const placeholders = ids.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT id, product_id, kind, name, hex, image, price, dims, weight, available, sort_order
         FROM product_variants WHERE product_id IN (${placeholders}) ORDER BY sort_order, id`
    )
    .bind(...ids)
    .all();

  const byProduct = groupBy(results || [], 'product_id');
  return products.map((product) => {
    const variants = byProduct.get(product.id) || [];
    return {
      ...product,
      colours: variants
        .filter((row) => row.kind === 'colour')
        .map((row) => ({ name: row.name, hex: row.hex || '#18181b', image: row.image || '' })),
      sizes: variants
        .filter((row) => row.kind === 'size')
        .map((row) => ({
          id: row.id,
          name: row.name,
          price: row.price === null ? product.price : row.price,
          dims: parseJson(row.dims, []),
          weight: row.weight || '',
          image: row.image || '',
          available: Boolean(row.available),
        })),
    };
  });
};

const selectProducts = async (
  db,
  { where = '', params = [], order = 'p.sort_order, p.title', limit = 60, offset = 0 } = {}
) => {
  const { results } = await db
    .prepare(
      `SELECT ${PRODUCT_COLUMNS} FROM products p
        ${where ? `WHERE ${where}` : ''}
        ORDER BY ${order} LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all();
  return withVariants(db, (results || []).map(hydrate));
};

export const productByHandle = (db, handle) =>
  memo(`product:${handle}`, async () => {
    const row = await db
      .prepare(`SELECT ${PRODUCT_COLUMNS} FROM products p WHERE p.handle = ?`)
      .bind(handle)
      .first();
    if (!row) return null;

    const [product] = await withVariants(db, [hydrate(row)]);
    const { results: media } = await db
      .prepare(
        'SELECT id, kind, src, poster, span, sort_order FROM product_media WHERE product_id = ? ORDER BY sort_order, id'
      )
      .bind(row.id)
      .all();
    const { results: usps } = await db
      .prepare(
        `SELECT id, title, description, icon, sort_order FROM product_usps
          WHERE product_id = ? OR product_id IS NULL ORDER BY sort_order, id`
      )
      .bind(row.id)
      .all();

    return {
      ...product,
      media: (media || []).map((item) => ({ ...item, isVideo: item.kind === 'video' })),
      usps: usps || [],
    };
  });

/**
 * The homepage product rows read one product switch each - the same three
 * toggles the admin product form writes on a category screen. A row whose
 * `source` is none of these lists the collections in its `pickers` instead.
 */
const LIST_FLAGS = {
  new: 'p.is_new = 1',
  best: 'p.price_from = 1',
  grid: 'p.show_in_home_grid = 1',
};

export const productList = (db, options = {}) => {
  const { collection: collectionHandle, handles, limit = 60, offset = 0, flag = '', source } = options;
  const key = `list:${collectionHandle || ''}:${source || ''}:${flag}:${(handles || []).join(',')}:${limit}:${offset}`;
  return memo(key, async () => {
    const where = [];
    const params = [];
    if (collectionHandle) {
      where.push('p.id IN (SELECT pc.product_id FROM product_collections pc WHERE pc.collection_handle = ?)');
      params.push(collectionHandle);
    }
    if (handles && handles.length) {
      where.push(`p.handle IN (${handles.map(() => '?').join(', ')})`);
      params.push(...handles);
    }
    if (LIST_FLAGS[flag]) where.push(LIST_FLAGS[flag]);
    return selectProducts(db, { where: where.join(' AND '), params, limit, offset });
  });
};

/** Products sharing the current collection first, then a generic fill. */
export const relatedProducts = async (db, product, limit = 12) => {
  const siblings = await selectProducts(db, {
    where: 'p.id != ? AND p.id IN (SELECT product_id FROM product_collections WHERE collection_handle = ?)',
    params: [product.id, product.collection_handle || ''],
    limit,
  });
  if (siblings.length >= 4) return siblings;

  const seen = [product.id, ...siblings.map((item) => item.id)];
  const fallback = await selectProducts(db, {
    where: `p.id NOT IN (${seen.map(() => '?').join(', ')})`,
    params: seen,
    limit: limit - siblings.length,
  });
  return [...siblings, ...fallback];
};

export const searchProducts = (db, term, limit = 24) => {
  const needle = String(term || '').trim();
  if (!needle) return Promise.resolve([]);
  const like = `%${needle}%`;
  return selectProducts(db, {
    where: 'p.title LIKE ? OR p.summary LIKE ? OR p.description LIKE ? OR p.cat_label LIKE ?',
    params: [like, like, like, like],
    limit,
  });
};

/* ------------------------------------------------- product administration ---- */

/** Every cached product read is prefix keyed, so one call clears them all. */
const invalidateProducts = () => {
  invalidate('list:');
  invalidate('product:');
  invalidate('collections'); // the collection list carries a product count
};

const PICKER_COLUMNS = 'id, handle, title, price, image, cat_handle, cat_label, collection_handle, sold_out';

/** Light rows for the "add an existing product" picker on the admin screen. */
export const productPicker = async (db) => {
  const { results } = await db.prepare(`SELECT ${PICKER_COLUMNS} FROM products ORDER BY title`).all();
  return results || [];
};

export const productById = async (db, id) => {
  const row = await db
    .prepare(`SELECT ${PICKER_COLUMNS} FROM products WHERE id = ?`)
    .bind(Number(id) || 0)
    .first();
  return row || null;
};

export const productHandleTaken = async (db, handle, exceptId = 0) => {
  const row = await db
    .prepare('SELECT id FROM products WHERE handle = ? AND id != ?')
    .bind(handle, Number(exceptId) || 0)
    .first();
  return Boolean(row);
};

/**
 * Inserts one product from the admin form and returns its new id (0 when the
 * insert did not happen). A blank order lands the product at the end of every
 * listing - the storefront sorts on `sort_order, title`.
 */
export const createProduct = async (db, values) => {
  const next = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS sort_order FROM products').first();
  const sortOrder = values.sortOrder === null ? (next && next.sort_order) || 1 : values.sortOrder;
  const result = await db
    .prepare(
      `INSERT INTO products (handle, title, short_title, price, compare_at_price, price_from, badge, image,
                             cat_handle, cat_label, colour, colour_hex, summary, description,
                             collection_handle, sold_out, is_new, show_in_home_grid, sort_order,
                             seo_title, seo_description, specs, features)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)`
    )
    .bind(
      values.handle,
      values.title,
      values.shortTitle,
      values.price,
      values.compareAtPrice,
      values.priceFrom,
      values.badge,
      values.image,
      values.catHandle,
      values.catLabel,
      '', // the legacy single colour name - the swatch hex lives in colour_hex
      values.colourHex,
      values.summary,
      values.description,
      values.collectionHandle,
      values.soldOut,
      values.isNew,
      values.inGrid,
      sortOrder,
      values.seoTitle,
      values.seoDescription,
      JSON.stringify(values.specs || []),
      JSON.stringify(values.features || [])
    )
    .run();
  invalidateProducts();
  return Number(result.meta && result.meta.last_row_id) || 0;
};

/** Writes every field the admin screen edits; `false` when the row is gone. */
export const updateProduct = async (db, id, values) => {
  const result = await db
    .prepare(
      `UPDATE products
          SET handle = ?1, title = ?2, short_title = ?3, price = ?4, compare_at_price = ?5,
              price_from = ?6, badge = ?7, image = ?8, cat_handle = ?9, cat_label = ?10,
              colour_hex = ?11, summary = ?12, description = ?13, sold_out = ?14, is_new = ?15,
              show_in_home_grid = ?16, sort_order = COALESCE(?17, sort_order),
              seo_title = ?18, seo_description = ?19,
              specs = COALESCE(?20, specs), features = COALESCE(?21, features)
        WHERE id = ?22`
    )
    .bind(
      values.handle,
      values.title,
      values.shortTitle,
      values.price,
      values.compareAtPrice,
      values.priceFrom,
      values.badge,
      values.image,
      values.catHandle,
      values.catLabel,
      values.colourHex,
      values.summary,
      values.description,
      values.soldOut,
      values.isNew,
      values.inGrid,
      values.sortOrder,
      values.seoTitle,
      values.seoDescription,
      // `null` means "the form did not carry the repeaters", and COALESCE keeps
      // the stored JSON. Only the current product screen sends has_details.
      values.hasDetails ? JSON.stringify(values.specs || []) : null,
      values.hasDetails ? JSON.stringify(values.features || []) : null,
      Number(id) || 0
    )
    .run();
  invalidateProducts();
  return Number(result.meta && result.meta.changes) > 0;
};

/**
 * Rewrites one kind of variant (`size` or `colour`). Rows are matched by name,
 * so a cart line that points at an unchanged size keeps its variant id; rows the
 * form dropped are deleted.
 */
const saveVariants = async (db, productId, rows, kind) => {
  const { results: existing } = await db
    .prepare('SELECT id, name FROM product_variants WHERE product_id = ? AND kind = ?')
    .bind(productId, kind)
    .all();
  const byName = new Map((existing || []).map((row) => [String(row.name).toLowerCase(), row.id]));
  const kept = new Set();
  const statements = [];

  rows.forEach((row, index) => {
    const name = String(row.name || '').trim();
    if (!name) return;
    const hex = kind === 'colour' ? row.hex || null : null;
    const price =
      kind === 'size' && row.price !== null && row.price !== undefined && Number.isFinite(Number(row.price))
        ? Number(row.price)
        : null;
    const id = byName.get(name.toLowerCase());
    if (id) {
      kept.add(id);
      statements.push(
        db
          .prepare('UPDATE product_variants SET name = ?, hex = ?, price = ?, sort_order = ?, available = 1 WHERE id = ?')
          .bind(name, hex, price, index + 1, id)
      );
    } else {
      statements.push(
        db
          .prepare(
            'INSERT INTO product_variants (product_id, kind, name, hex, price, available, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)'
          )
          .bind(productId, kind, name, hex, price, index + 1)
      );
    }
  });

  for (const row of existing || []) {
    if (!kept.has(row.id)) statements.push(db.prepare('DELETE FROM product_variants WHERE id = ?').bind(row.id));
  }
  if (statements.length) await db.batch(statements);
};

/**
 * Writes everything the four repeaters on the product screen edit: the size and
 * colour variants (`product_variants`), the media gallery (`product_media`) and
 * the specification table / feature bullets (JSON columns on `products`).
 * `has_details` on the form is what makes this run - see `productDetails`.
 */
export const saveProductDetails = async (db, id, values) => {
  const key = Number(id) || 0;
  if (!key) return false;

  await saveVariants(db, key, values.sizes || [], 'size');
  await saveVariants(db, key, values.colours || [], 'colour');

  const { results: media } = await db.prepare('SELECT id FROM product_media WHERE product_id = ?').bind(key).all();
  const statements = (media || []).map((row) => db.prepare('DELETE FROM product_media WHERE id = ?').bind(row.id));
  (values.media || []).forEach((row, index) => {
    const kind = row.kind === 'video' ? 'video' : 'image';
    statements.push(
      db
        .prepare('INSERT INTO product_media (product_id, kind, src, poster, span, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(key, kind, row.src, row.poster || null, kind === 'video' ? 'col-12' : 'col-6', index + 1)
    );
  });
  if (statements.length) await db.batch(statements);

  invalidateProducts();
  return true;
};

/** The gallery rows of several products at once, keyed by product id. */
export const mediaByProduct = async (db, ids = []) => {
  const map = new Map();
  const keys = ids.map(Number).filter(Boolean);
  if (!keys.length) return map;
  const { results } = await db
    .prepare(
      `SELECT id, product_id, kind, src, poster, span, sort_order FROM product_media
        WHERE product_id IN (${keys.map(() => '?').join(', ')}) ORDER BY sort_order, id`
    )
    .bind(...keys)
    .all();
  for (const row of results || []) {
    if (!map.has(row.product_id)) map.set(row.product_id, []);
    map.get(row.product_id).push(row);
  }
  return map;
};

/**
 * Deletes a product for good. The dependent rows are removed by hand (carts
 * included) so the delete works whatever `PRAGMA foreign_keys` says.
 */
export const deleteProduct = async (db, id) => {
  const key = Number(id) || 0;
  if (!key || !(await productById(db, key))) return false;
  await db.batch([
    db.prepare('DELETE FROM cart_items WHERE product_id = ?').bind(key),
    db.prepare('DELETE FROM product_variants WHERE product_id = ?').bind(key),
    db.prepare('DELETE FROM product_media WHERE product_id = ?').bind(key),
    db.prepare('DELETE FROM product_usps WHERE product_id = ?').bind(key),
    db.prepare('DELETE FROM product_collections WHERE product_id = ?').bind(key),
    db.prepare('DELETE FROM products WHERE id = ?').bind(key),
  ]);
  invalidateProducts();
  return true;
};

/** The storefront lists a `tag` category when either of the product fields matches. */
const tagMatches = (product, item) => {
  const value = String((item && item.filterValue) || '').toLowerCase();
  return (
    String(product.cat_handle || '').toLowerCase() === value || String(product.cat_label || '').toLowerCase() === value
  );
};

/**
 * The one category each product belongs to, keyed by product id, taken from the
 * product's own category fields (`cat_handle` / `cat_label`) against the filter
 * value of every tag and collection category - the same match the storefront
 * uses. A product has a single set of fields, so it can belong to a single
 * category; `all` categories list everything and never own anything. Collection
 * links in `product_collections` are curated lists, not ownership, so a product
 * can still appear in several collections.
 */
export const productCategoryIndex = async (db) => {
  const [rows, list] = await Promise.all([
    db.prepare('SELECT id, cat_handle, cat_label FROM products').all(),
    allCategories(db),
  ]);
  const owners = list.filter((item) => item.filterType !== 'all' && item.filterValue);

  const index = new Map();
  for (const product of rows.results || []) {
    const owned = owners.filter((item) => tagMatches(product, item));
    if (owned.length) index.set(product.id, owned);
  }
  return index;
};

/**
 * The category a product detail page names in its breadcrumb.
 *
 * A product that was filed under a category - created from it, or added to it in
 * /admin - carries that category in `cat_handle` / `cat_label`, so the same match
 * that decides ownership above decides the crumb. Only when no category claims
 * the product do the seeded rows' legacy fields fall back to the category that
 * owns the product's collection: a curated `product_collections` list is not a
 * category, but in the seeded catalogue the two line up. Hidden categories are
 * skipped on purpose - the storefront must never link a shopper at a page that
 * would 404 them. Returns the hydrated category row or `null`.
 */
export const categoryOfProduct = async (db, product) => {
  if (!product) return null;
  const list = (await categories(db)).filter((item) => item.filterType !== 'all' && item.filterValue);
  const collection = String(product.collection_handle || '').toLowerCase();
  return (
    list.find((item) => tagMatches(product, item)) ||
    list.find((item) => String(item.filterValue).toLowerCase() === collection) ||
    null
  );
};

/**
 * Puts a product that has no category yet into the one the admin is looking at:
 *
 *   the product's own category fields (tag handle and label) become this
 *   category, so the storefront and the admin show it in the same place;
 *   a collection category also gets a `product_collections` row;
 *   `all` categories list every product already, so there is nothing to add.
 *
 * A product belongs to one category at a time: adding it to a second one is
 * refused and the caller is told which category holds it. Returns
 * `{ ok, reason, owner }` with `reason` either `filter` or `taken`.
 */
export const addProductToCategory = async (db, item, productId) => {
  const id = Number(productId) || 0;
  if (!id || !item || item.filterType === 'all' || !item.filterValue) return { ok: false, reason: 'filter' };
  const owners = (await productCategoryIndex(db)).get(id) || [];
  const other = owners.find((owner) => owner.id !== item.id);
  if (other) return { ok: false, reason: 'taken', owner: other };

  const statements = [];
  if (item.filterType === 'collection') {
    statements.push(
      db
        .prepare('INSERT OR IGNORE INTO product_collections (product_id, collection_handle, sort_order) VALUES (?1, ?2, 0)')
        .bind(id, item.filterValue),
      // Only fills a gap: a product that already points at a collection keeps it.
      db
        .prepare("UPDATE products SET collection_handle = ?2 WHERE id = ?1 AND (collection_handle IS NULL OR collection_handle = '')")
        .bind(id, item.filterValue)
    );
  }
  statements.push(
    db
      .prepare('UPDATE products SET cat_handle = ?2, cat_label = ?3 WHERE id = ?1')
      .bind(id, item.filterValue, item.name)
  );
  await db.batch(statements);
  invalidateProducts();
  return { ok: true, owner: null };
};

/**
 * Takes a product out of the category without touching the rest of the product:
 * the collection link goes and the category fields that point at this category
 * are cleared, so the product is free to join another category. Returns `false`
 * when the product was not in this category in the first place.
 */
export const removeProductFromCategory = async (db, item, productId) => {
  const id = Number(productId) || 0;
  if (!id || !item || item.filterType === 'all' || !item.filterValue) return false;
  const product = await productById(db, id);
  if (!product) return false;

  const statements = [];
  if (item.filterType === 'collection') {
    const link = await db
      .prepare('SELECT 1 AS linked FROM product_collections WHERE product_id = ?1 AND collection_handle = ?2')
      .bind(id, item.filterValue)
      .first();
    if (!link) return false;
    statements.push(
      db
        .prepare('DELETE FROM product_collections WHERE product_id = ?1 AND collection_handle = ?2')
        .bind(id, item.filterValue),
      db
        .prepare("UPDATE products SET collection_handle = '' WHERE id = ?1 AND collection_handle = ?2")
        .bind(id, item.filterValue)
    );
  } else if (!tagMatches(product, item)) {
    return false;
  }
  statements.push(
    db
      .prepare("UPDATE products SET cat_handle = '', cat_label = '' WHERE id = ?1 AND (LOWER(cat_handle) = ?2 OR LOWER(cat_label) = ?2)")
      .bind(id, String(item.filterValue).toLowerCase())
  );
  await db.batch(statements);
  invalidateProducts();
  return true;
};



/* ------------------------------------------------------------------- misc ---- */

export const defaultFeatures = (db) =>
  memo('features:default', async () => {
    const { results } = await db
      .prepare('SELECT title, description, icon FROM product_usps WHERE product_id IS NULL ORDER BY sort_order, id')
      .all();
    return results || [];
  });

export const addSubscriber = (db, email) =>
  db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').bind(email).run();

export const addEnquiry = (db, { name, email, message }) =>
  db
    .prepare('INSERT INTO enquiries (name, email, message) VALUES (?, ?, ?)')
    .bind(name || '', email || '', message || '')
    .run();
