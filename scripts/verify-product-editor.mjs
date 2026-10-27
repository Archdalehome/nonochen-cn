/**
 * 商品编辑页的端到端自检（不需要网络、不需要 wrangler）：
 *
 *   1. 用 migrations 建一个内存数据库（和线上同一套 0013 条迁移）
 *   2. 走真实代码路径：normalizeProduct -> createProduct -> saveProductDetails
 *   3. 用 productByHandle 读回来，渲染前台商品页，检查尺寸/颜色/图集/规格/卖点
 *   4. 再存一次同样的表单，确认没有重复也没有丢
 *   5. 模拟一个不带 has_details 的旧提交，确认不会把已有明细冲掉
 *   6. 渲染后台商品页，确认四组输入框和已有值都在
 *
 *   node --experimental-sqlite scripts/verify-product-editor.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

/* ---------------------------------------------------------------- D1 shim ---- */
/**
 * D1 用 `?1, ?2 ...` 编号占位符，node:sqlite 只认匿名 `?`，所以这里按出现顺序
 * 把编号占位符换成匿名占位符，并把参数重排一次。只影响这个自检脚本。
 */
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

const [{ normalizeProduct }, { createProduct, updateProduct, saveProductDetails, productByHandle }, { render }, { productView }, admin, { categoryProductsView }] =
  await Promise.all([
    import('../src/lib/admin.js'),
    import('../src/lib/db.js'),
    import('../src/lib/html.js'),
    import('../src/views/product.js'),
    import('../src/views/admin.js'),
    import('../src/views/admin.js'),
  ])

let failures = 0
const ok = (label) => console.log('ok   ' + label)
const fail = (label) => {
  failures++
  console.log('FAIL ' + label)
}
const expect = (condition, label) => (condition ? ok(label) : fail(label))

/* ----------------------------------------------------------- 1. 表单保存 ---- */
// 验收场景：2 个尺寸、3 个颜色、4 张图、2 条规格、3 条卖点
const form = {
  title: '真皮方形脚凳',
  handle: 'leather-square-ottoman',
  price: '2680',
  image: '/images/ottoman-cover.png',
  summary: '头层牛皮，坐面平整。',
  description: '手工包边，四条实木腿。',
  sold_out: '0',
  is_new: '1',
  price_from: '0',
  show_in_home_grid: '1',
  has_details: '1',
  spec_label: ['尺寸', '材质'],
  spec_value: ['62 × 62 × 40 cm', '头层牛皮 + 实木腿'],
  feature: ['头层牛皮，越用越润', '坐垫可拆洗', '五金件可选哑光黑'],
  size_name: ['中号', '大号'],
  size_price: ['2680', '3180'],
  colour_name: ['焦糖棕', '深咖', '米白'],
  colour_swatch: ['#8b5e3c', '#4a2f21', '#efe7d9'],
  media_src: ['/images/ottoman-1.png', '/images/ottoman-2.png', '/images/ottoman-3.png', '/images/ottoman-4.png'],
  media_kind: ['image', 'image', 'image', 'image'],
}

const parsed = normalizeProduct(form)
expect(!parsed.error, 'normalizeProduct 接受这份表单' + (parsed.error ? `（实际报错 ${parsed.error}）` : ''))
expect(parsed.values.specs.length === 2, '规格表 2 条')
expect(parsed.values.features.length === 3, '卖点 3 条')
expect(parsed.values.sizes.length === 2, '尺寸 2 条')
expect(parsed.values.colours.length === 3, '颜色 3 条')
expect(parsed.values.media.length === 4, '图集 4 项')
expect(parsed.values.sizes[1].price === 3180, '第二个尺寸的价格是 3180')
expect(parsed.values.colours[0].hex === '#8b5e3c', '颜色色值按表单保存')

const id = await createProduct(db, parsed.values)
expect(id > 0, '商品写入 products，id=' + id)
await saveProductDetails(db, id, parsed.values)

const product = await productByHandle(db, 'leather-square-ottoman')
expect(Boolean(product), 'productByHandle 能读回这个商品')
expect(product.sizes.length === 2, '读回的尺寸是 2 条')
expect(product.colours.length === 3, '读回的颜色是 3 条')
expect(product.specs.length === 2, '读回的规格是 2 条')
expect(product.features.length === 3, '读回的卖点是 3 条')
expect(product.media.length === 4, '读回的图集是 4 项')
expect(product.sizes[1].price === 3180, '尺寸价格读回一致')

/* --------------------------------------------------------- 2. 前台渲染 ---- */
const page = render(productView({ product, related: [], settings: {}, symbol: '¥' }))
expect(page.includes('data-colour-choice="焦糖棕"'), '前台能选到「焦糖棕」')
expect(page.includes('value="' + product.sizes[1].id + '"'), '前台能选到第二个尺寸')
expect(page.includes('¥3180.00'), '前台显示第二个尺寸的价格 ¥3180.00')
expect(page.includes('62 × 62 × 40 cm'), '前台规格表里有尺寸行')
expect(page.includes('头层牛皮，越用越润'), '前台卖点有第一条')
expect(
  ['ottoman-1', 'ottoman-2', 'ottoman-3', 'ottoman-4'].every((name) => page.includes(name)),
  '前台图集 4 张图都在'
)

/* ------------------------------------------------------- 3. 再存一次 ---- */
const again = normalizeProduct(form)
await updateProduct(db, id, again.values)
await saveProductDetails(db, id, again.values)
const reloaded = await productByHandle(db, 'leather-square-ottoman')
expect(reloaded.sizes.length === 2 && reloaded.colours.length === 3, '第二次保存没有把变体翻倍')
expect(reloaded.media.length === 4, '第二次保存没有把图集翻倍')
expect(reloaded.specs.length === 2 && reloaded.features.length === 3, '第二次保存规格与卖点不变')

/* ------------------------------------- 4. 不带 has_details 的旧提交 ---- */
const legacy = normalizeProduct({
  title: '真皮方形脚凳',
  handle: 'leather-square-ottoman',
  price: '2680',
  image: '/images/ottoman-cover.png',
})
expect(legacy.values.hasDetails === false, '旧提交（无 has_details）被识别出来')
await updateProduct(db, id, legacy.values)
const afterLegacy = await productByHandle(db, 'leather-square-ottoman')
expect(
  afterLegacy.sizes.length === 2 && afterLegacy.colours.length === 3 && afterLegacy.media.length === 4,
  '旧提交不会冲掉尺寸/颜色/图集'
)
expect(afterLegacy.specs.length === 2 && afterLegacy.features.length === 3, '旧提交不会冲掉规格与卖点')

/* ------------------------------------------------------- 5. 后台渲染 ---- */
const gallery = (afterLegacy.media || []).map((row) => ({ kind: row.kind, src: row.src }))
const adminHtml = render(
  categoryProductsView({
    category: { id: 1, slug: 'furniture', name: '家具', href: '/category/furniture', filterType: 'collection', filterValue: 'furniture' },
    list: [{ ...afterLegacy, media: gallery }],
    picker: [],
    owners: new Map(),
    collections: [],
    symbol: '¥',
    mediaBound: true,
  })
)
for (const [needle, label] of [
  ['name="spec_label[]"', '后台有规格 label 输入'],
  ['name="spec_value[]"', '后台有规格 value 输入'],
  ['name="feature[]"', '后台有卖点输入'],
  ['name="size_name[]"', '后台有尺寸名称输入'],
  ['name="size_price[]"', '后台有尺寸价格输入'],
  ['name="colour_name[]"', '后台有颜色名称输入'],
  ['name="colour_swatch[]"', '后台有颜色色值输入'],
  ['name="media_src[]"', '后台有图集路径输入'],
  ['name="media_upload[]"', '后台有图集上传框'],
  ['name="has_details" value="1"', '表单带 has_details 标记'],
  ['data-repeat-add', '后台有「添加一行」按钮'],
  ['enctype="multipart/form-data"', '表单支持文件上传'],
  ['value="62 × 62 × 40 cm"', '后台回填了规格值'],
  ['value="大号"', '后台回填了尺寸名称'],
  ['value="3180"', '后台回填了尺寸价格'],
  ['value="#8b5e3c"', '后台回填了颜色色值'],
  ['value="/images/ottoman-4.png"', '后台回填了第 4 张图'],
]) {
  expect(adminHtml.includes(needle), label)
}

console.log(failures ? `\n${failures} 项没通过` : '\n全部通过：保存 → 前台渲染 → 再保存 → 旧提交 → 后台回填')
process.exit(failures ? 1 : 0)
