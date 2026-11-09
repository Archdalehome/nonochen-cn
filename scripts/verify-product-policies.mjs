/**
 * 商品页「配送与退换」= 两个内容页的实时内容。
 *
 *   node --experimental-sqlite scripts/verify-product-policies.mjs
 *
 * 断言：
 *   1. 商品页里出现 /pages/delivery 的正文与 /pages/returns 的正文
 *   2. 两段各有「查看完整配送说明 →」「退换货政策 →」链接
 *   3. 再也搜不到 Free UK delivery / 1pm / ¥75 这些写死的英文
 *   4. 在后台把 delivery 页正文改掉 → 直接刷新商品页，文字跟着变（不重新部署）
 *   5. 两页正文清空 → 商品页不再显示「配送与退换」整块，也不留空标题
 */
import { readdirSync, readFileSync } from 'node:fs'
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

const worker = (await import('../src/index.js')).default
const uploads = []
const env = {
  DB: new Database(sqlite),
  ADMIN_USER: 'smoke',
  ADMIN_PASSWORD: 'smoke-password',
  SITE_NAME: 'Chen Furniture',
  MEDIA: { put: async (key) => uploads.push(key) },
}
const request = (path, init = {}) => worker.fetch(new Request('https://shop.test' + path, init), env, { waitUntil() {} })

let failures = 0
const ok = (label) => console.log('ok   ' + label)
const fail = (label) => {
  failures++
  console.log('FAIL ' + label)
}
const expect = (condition, label) => (condition ? ok(label) : fail(label))

/* ---------------------------------------------------------------- 登录 ---- */
const loginBody = new URLSearchParams({ username: 'smoke', password: 'smoke-password' })
const login = await request('/admin/login', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: loginBody.toString(),
  redirect: 'manual',
})
const cookie = (login.headers.get('set-cookie') || '').split(';')[0]
const admin = { headers: { cookie } }

/* ------------------------------------------------- 页面保存（后台编辑器） ---- */
const savePage = (handle, blocks) => {
  const form = new URLSearchParams()
  form.append('handle', handle)
  form.append('page_title', blocks[0] && blocks[0].heading ? blocks[0].heading : '')
  for (const block of blocks) {
    form.append('block_key[]', block.key || 'k' + Math.random().toString(36).slice(2, 8))
    form.append('block_type[]', 'page')
    form.append('block_title[]', block.title || '')
    form.append('block_body[]', block.body || '')
    form.append('block_image[]', '')
    form.append('block_text[]', '')
    form.append('block_width[]', 'wide')
  }
  return request('/admin/pages/save', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    redirect: 'manual',
  })
}

const productHandle = sqlite.prepare('SELECT handle FROM products ORDER BY sort_order, id LIMIT 1').get().handle
const productPage = async () => {
  const response = await request(`/products/${productHandle}`)
  const html = await response.text()
  if (response.status !== 200) throw new Error(`商品页 /products/${productHandle} 返回 ${response.status}`)
  return html
}

/* --------------------------------------------- 1. 默认（种子）内容 ---- */
const first = await productPage()
expect(first.includes('3-5 working days'), '商品页出现 /pages/delivery 的种子正文')
expect(first.includes('There are some circumstances where you may wish to return'), '商品页出现 /pages/returns 的种子正文')
expect(first.includes('/pages/delivery'), '有「查看完整配送说明」的链接')
expect(first.includes('/pages/returns'), '有「退换货政策」的链接')
expect(first.includes('配送说明') && first.includes('退换货'), '两段各有中文小标题')
expect(!first.includes('Free UK delivery'), '没有写死的 Free UK delivery')
expect(!first.includes('1pm'), '没有写死的 1pm')
expect(!first.includes('¥75'), '没有写死的 ¥75')
expect(!first.includes('British Quality Guaranteed'), '没有旧的质保英文')

/* --------------------------------- 2. 改后台 → 商品页实时跟着变 ---- */
await savePage('delivery', [
  { heading: '配送说明', key: 'd1', title: '', body: '<p>全国大部分地区 15 天内送达，偏远地区另议。</p>' },
])
const second = await productPage()
expect(second.includes('全国大部分地区 15 天内送达'), '改完后台，商品页立刻显示新配送文案')
expect(!second.includes('3-5 working days'), '旧的配送文案已经不在商品页')
expect(second.includes('There are some circumstances where you may wish to return'), '退换货那一段没被牵连')

await savePage('returns', [
  { heading: '退换货', key: 'r1', title: '七天无理由', body: '<p>收到货七天内可退，运费由买家承担。</p>' },
])
const third = await productPage()
expect(third.includes('七天无理由'), '退换货的小标题也实时出现')
expect(third.includes('收到货七天内可退'), '退换货正文实时出现')

/* --------------------------------------- 3. 两页清空 → 整块不显示 ---- */
await savePage('delivery', [{ heading: '配送说明', key: 'd2', body: '' }])
await savePage('returns', [{ heading: '退换货', key: 'r2', body: '' }])
const empty = await productPage()
expect(!empty.includes('id="pdp-delivery"'), '两页都空时不再渲染「配送与退换」折叠块')
expect(!empty.includes('查看完整配送说明'), '空的时候不留空链接')
expect(!empty.includes('退换货政策 →'), '空的时候不留空链接')
expect(empty.includes('商品描述'), '商品页其它折叠块不受影响')

/* ------------------------------- 4. 只填一页 → 只出那一段 ---- */
await savePage('delivery', [{ heading: '配送说明', key: 'd3', body: '<p>只在配送页写了内容。</p>' }])
const oneSide = await productPage()
expect(oneSide.includes('只在配送页写了内容'), '只填配送页时显示配送段')
expect(!oneSide.includes('退换货政策 →'), '退换货空着就不显示那一段')

/* ------------------------------------------- 5. 旧配置项已清掉 ---- */
const leftovers = sqlite
  .prepare("SELECT key FROM settings WHERE key IN ('pdp_delivery_copy','pdp_shipping_note','pdp_returns_note')")
  .all()
expect(leftovers.length === 0, 'settings 里三个旧的 PDP 文案键已被删掉')

console.log(
  failures
    ? `\n${failures} 项没通过`
    : '\n全部通过：商品页实时取两个内容页 → 改后台立刻生效 → 清空不出空块 → 旧英文与配置项清零'
)
process.exit(failures ? 1 : 0)
