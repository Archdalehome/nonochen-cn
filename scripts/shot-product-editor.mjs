/**
 * 渲染两张页面到本地 HTML，供无头浏览器截图：
 *   - 后台商品编辑页（规格 / 卖点 / 尺寸 / 颜色 / 图集四个重排器都有数据）
 *   - 前台商品页（两个尺寸、三个颜色、四张图、规格表、卖点）
 *
 *   node --experimental-sqlite scripts/shot-product-editor.mjs
 * 产物在 .shot/ 下，不提交仓库。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, cpSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const anonymous = (sql, params) => {
  if (!/\?\d+/.test(sql)) return { sql, params }
  const order = []
  const rewritten = sql.replace(/\?(\d+)/g, (_, index) => {
    order.push(Number(index))
    return '?'
  })
  return { sql: rewritten, params: order.map((index) => params[index - 1]) }
}
class Statement {
  constructor(db, sql, params = []) {
    this.db = db
    this.sql = sql
    this.params = params
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params)
  }
  async first() {
    const { sql, params } = anonymous(this.sql, this.params)
    return this.db.prepare(sql).get(...params) ?? null
  }
  async all() {
    const { sql, params } = anonymous(this.sql, this.params)
    return { results: this.db.prepare(sql).all(...params) }
  }
  async run() {
    const { sql, params } = anonymous(this.sql, this.params)
    const result = this.db.prepare(sql).run(...params)
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }
  }
}
class Database {
  constructor(db) {
    this.db = db
  }
  prepare(sql) {
    return new Statement(this.db, sql)
  }
  async batch(statements) {
    const out = []
    for (const statement of statements) out.push(await statement.run())
    return out
  }
}

const sqlite = new DatabaseSync(':memory:')
for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
  sqlite.exec(readFileSync('migrations/' + file, 'utf8'))
}
const db = new Database(sqlite)

const [{ normalizeProduct }, { createProduct, saveProductDetails, productByHandle }, { render }, { productView }, { categoryProductsView }] =
  await Promise.all([
    import('../src/lib/admin.js'),
    import('../src/lib/db.js'),
    import('../src/lib/html.js'),
    import('../src/views/product.js'),
    import('../src/views/admin.js'),
  ])

const form = {
  title: '真皮方形脚凳',
  handle: 'leather-square-ottoman',
  price: '2680',
  image: '/images/ottoman-cover.png',
  summary: '头层牛皮，坐面平整，四条实木腿。',
  description: '手工包边，坐垫可拆洗；皮面会随使用变得更有光泽。',
  sold_out: '0',
  is_new: '1',
  price_from: '0',
  show_in_home_grid: '1',
  has_details: '1',
  spec_label: ['尺寸', '材质', '颜色'],
  spec_value: ['62 × 62 × 40 cm', '头层牛皮 + 实木腿', '焦糖棕 / 深咖 / 米白'],
  feature: ['头层牛皮，越用越润', '坐垫可拆洗', '五金件可选哑光黑'],
  size_name: ['中号', '大号'],
  size_price: ['2680', '3180'],
  colour_name: ['焦糖棕', '深咖', '米白'],
  colour_swatch: ['#8b5e3c', '#4a2f21', '#efe7d9'],
  media_src: ['/images/ottoman-1.png', '/images/ottoman-2.png', '/images/ottoman-3.png', '/images/ottoman-4.png'],
  media_kind: ['image', 'image', 'image', 'image'],
}

const { values } = normalizeProduct(form)
const id = await createProduct(db, values)
await saveProductDetails(db, id, values)
const product = await productByHandle(db, 'leather-square-ottoman')

const shell = (title, body, extra = '') => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="css/bootstrap.min.css">
<link rel="stylesheet" href="css/site.css">
${extra}
</head><body class="d-flex flex-column min-vh-100 bg-body">${body}
<script src="js/bootstrap.bundle.min.js" defer></script>
<script src="js/site.js" defer></script>
</body></html>`

mkdirSync('.shot', { recursive: true })
cpSync('public/css', '.shot/css', { recursive: true })
cpSync('public/js', '.shot/js', { recursive: true })

const adminBody = render(
  categoryProductsView({
    category: { id: 1, slug: 'furniture', name: '家具', href: '/category/furniture', filterType: 'collection', filterValue: 'furniture' },
    list: [{ ...product, media: product.media }],
    picker: [],
    owners: new Map(),
    collections: [],
    symbol: '¥',
    mediaBound: true,
  })
)
writeFileSync('.shot/admin.html', shell('后台 · 商品编辑', `<main class="container py-4">${adminBody}</main>`), 'utf8')

const storefront = render(productView({ product, related: [], settings: {}, symbol: '¥' }))
writeFileSync('.shot/product.html', shell('前台 · 商品页', `<main class="flex-grow-1">${storefront}</main>`), 'utf8')

console.log('wrote .shot/admin.html and .shot/product.html')
