/**
 * 渲染 /admin/pages 与 /admin/pages/about 到 `.shot/`，供无头浏览器截图。
 *   node --experimental-sqlite scripts/shot-pages-editor.mjs
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const env = { DB: new Database(sqlite), ADMIN_USER: 'smoke', ADMIN_PASSWORD: 'smoke-password', SITE_NAME: 'Chen Furniture' }
const request = (path, init = {}) => worker.fetch(new Request('https://shop.test' + path, init), env, { waitUntil() {} })

const body = new URLSearchParams({ username: 'smoke', password: 'smoke-password' })
const login = await request('/admin/login', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: body.toString(),
  redirect: 'manual',
})
const cookie = (login.headers.get('set-cookie') || '').split(';')[0]

mkdirSync('.shot', { recursive: true })
cpSync('public/css', '.shot/css', { recursive: true })
cpSync('public/js', '.shot/js', { recursive: true })

const save = (fields) => {
  const payload = new URLSearchParams()
  for (const [key, value] of fields) payload.append(key, value)
  return request('/admin/pages/save', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
    redirect: 'manual',
  })
}

// 让截图里看到真实的编辑状态：标题 + 正文块 + 图片块
await save([
  ['handle', 'about'],
  ['page_title', '关于 Chen Furniture'],
  ['block_key[]', 'k1'],
  ['block_type[]', 'page'],
  ['block_title[]', '我们怎么做事'],
  ['block_body[]', '自有工厂，先打样再量产。\n\n皮料和木料都自己挑。'],
  ['block_image[]', ''],
  ['block_text[]', ''],
  ['block_width[]', 'wide'],
  ['block_key[]', 'k2'],
  ['block_type[]', 'image_banner'],
  ['block_title[]', ''],
  ['block_body[]', ''],
  ['block_image[]', '/images/factory/bench.jpg'],
  ['block_text[]', '车间里的打样台'],
  ['block_width[]', 'narrow'],
])

for (const [name, path] of [
  ['pages-list', '/admin/pages'],
  ['pages-about', '/admin/pages/about'],
]) {
  const response = await request(path, { headers: { cookie } })
  let html = await response.text()
  html = html.replaceAll('href="/css/', 'href="css/').replaceAll('src="/js/', 'src="js/')
  writeFileSync(`.shot/${name}.html`, html, 'utf8')
  console.log(`wrote .shot/${name}.html (${response.status})`)
}
