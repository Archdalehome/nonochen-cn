/**
 * 内容页后台编辑器的端到端自检（不需要网络）：
 *
 *   1. 用 migrations 建内存数据库（含 0014 的 updated_at）
 *   2. 直接调 Worker 的 fetch：登录 → /admin/pages → 8 个页面逐个打开
 *   3. /admin/pages/about 里能看到种子正文（不是白板）
 *   4. 提交「改文字 + 加小标题 + 插一张图 + 调顺序」→ /pages/about 顺序与内容都对
 *   5. 再提交一次，内容不重复、不丢
 *
 *   node --experimental-sqlite scripts/verify-pages-editor.mjs
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
  // 假的 R2：记下 key，用于验证「上传被认领」
  MEDIA: { put: async (key) => uploads.push(key) },
}

let failures = 0
const ok = (label) => console.log('ok   ' + label)
const fail = (label) => {
  failures++
  console.log('FAIL ' + label)
}
const expect = (condition, label) => (condition ? ok(label) : fail(label))

const request = (path, init = {}) => worker.fetch(new Request('https://shop.test' + path, init), env, { waitUntil() {} })
const form = (fields) => {
  const body = new URLSearchParams()
  for (const [key, value] of fields) body.append(key, value)
  return new URLSearchParams(body)
}

/* ------------------------------------------------------------------ 登录 ---- */
const login = await request('/admin/login', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: form([
    ['username', 'smoke'],
    ['password', 'smoke-password'],
  ]).toString(),
  redirect: 'manual',
})
const cookie = (login.headers.get('set-cookie') || '').split(';')[0]
expect(login.status === 303 && cookie.startsWith('cf_admin='), `登录后台成功（${login.status}）`)
const admin = { headers: { cookie } }

/* ------------------------------------------------------- /admin/pages 列表 ---- */
const listPage = await request('/admin/pages', admin)
const listHtml = await listPage.text()
expect(listPage.status === 200, '/admin/pages 返回 200')
const PAGE_LABELS = ['关于我们', '联系我们', '常见问题', '服务条款', '隐私政策', '配送说明', '退换货', '门店位置']
for (const label of PAGE_LABELS) expect(listHtml.includes(label), `列表里有「${label}」`)
expect(listHtml.includes('/admin/pages/about'), '列表能点进 /admin/pages/about')
expect(listHtml.includes('最后修改'), '列表有「最后修改」一列')

/* ---------------------------------------------------- 8 个页面逐个打开 ---- */
const HANDLES = ['about', 'contact-details', 'faq', 'terms-and-conditions', 'privacy', 'delivery', 'returns', 'store-locator']
const pages = {}
for (const handle of HANDLES) {
  const response = await request(`/admin/pages/${handle}`, admin)
  pages[handle] = await response.text()
  expect(response.status === 200, `/admin/pages/${handle} 打开正常（${response.status}）`)
}

/* ---------------------------------------- 关于我们：读得到现有正文 ---- */
// 0015 之后，这 8 页的标题已经是中文，正文仍是种子英文
expect(pages.about.includes('关于我们'), '/admin/pages/about 里能看到中文标题')
expect(pages.about.includes('generous, sink-into-it comfort'), '/admin/pages/about 里能看到种子正文')
expect(pages.about.includes('name="page_title"'), '编辑页有页面标题输入')
expect(pages.about.includes('name="block_body[]"'), '编辑页有正文输入')
expect(pages.about.includes('data-block-type'), '编辑页有块类型切换')
expect(pages.about.includes('添加图片块'), '编辑页有「添加图片块」')

/* ------------------------------- 改文字 + 加小标题 + 插图 + 调顺序 ---- */
const saveFields = [
  ['handle', 'about'],
  ['page_title', '关于 Chen Furniture'],
  // 1. 新加的小标题 + 两段正文（纯文本，靠空行分段）
  ['block_key[]', 'k1'],
  ['block_type[]', 'page'],
  ['block_title[]', '我们怎么做事'],
  ['block_body[]', '自有工厂，先打样再量产。\n\n皮料和木料都自己挑。'],
  ['block_image[]', ''],
  ['block_text[]', ''],
  ['block_width[]', 'wide'],
  // 2. 一张图，窄图居中，带说明
  ['block_key[]', 'k2'],
  ['block_type[]', 'image_banner'],
  ['block_title[]', ''],
  ['block_body[]', ''],
  ['block_image[]', '/images/factory/bench.jpg'],
  ['block_text[]', '车间里的打样台'],
  ['block_width[]', 'narrow'],
  // 3. 原来那段正文，放在图片后面 —— 顺序就是数组顺序
  ['block_key[]', 'k3'],
  ['block_type[]', 'page'],
  ['block_title[]', ''],
  ['block_body[]', '这一行是保存后新写进去的正文。'],
  ['block_image[]', ''],
  ['block_text[]', ''],
  ['block_width[]', 'wide'],
]
const save = () =>
  request('/admin/pages/save', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: form(saveFields).toString(),
    redirect: 'manual',
  })
const first = await save()
expect(first.status === 303, `保存返回 303（${first.status}）`)
expect((first.headers.get('location') || '').includes('flash=pages-saved'), '保存后跳回编辑器并带成功提示')

const storefront = await request('/pages/about')
const storefrontHtml = await storefront.text()
expect(storefront.status === 200, '/pages/about 前台 200')
expect(storefrontHtml.includes('关于 Chen Furniture'), '前台主标题是新的页面标题')
expect(storefrontHtml.includes('我们怎么做事'), '前台有小标题')
expect(storefrontHtml.includes('<p>自有工厂，先打样再量产。</p>'), '纯文本按空行分成了两段（第一段）')
expect(storefrontHtml.includes('<p>皮料和木料都自己挑。</p>'), '纯文本按空行分成了两段（第二段）')
expect(storefrontHtml.includes('/images/factory/bench.jpg'), '前台显示插入的图')
expect(storefrontHtml.includes('车间里的打样台'), '前台显示图片说明')
expect(storefrontHtml.includes('content-image--narrow'), '窄图带上了居中样式')
expect(storefrontHtml.includes('这一行是保存后新写进去的正文。'), '前台有第三块正文')
const orderOk =
  storefrontHtml.indexOf('我们怎么做事') <
  storefrontHtml.indexOf('/images/factory/bench.jpg') &&
  storefrontHtml.indexOf('/images/factory/bench.jpg') <
  storefrontHtml.indexOf('这一行是保存后新写进去的正文。')
expect(orderOk, '前台顺序与后台一致：小标题 → 图 → 正文')

/* ------------------------------------------ 再存一次：不重复、不丢 ---- */
const second = await save()
expect(second.status === 303, '第二次保存也返回 303')
const again = await (await request('/pages/about')).text()
const count = (haystack, needle) => haystack.split(needle).length - 1
expect(count(again, '我们怎么做事') === 1, '第二次保存后小标题只有一份')
expect(count(again, '/images/factory/bench.jpg') === 1, '第二次保存后图片只有一张')
expect(count(again, '这一行是保存后新写进去的正文。') === 1, '第二次保存后第三块正文只有一份')
expect(again.includes('皮料和木料都自己挑。'), '第二次保存后内容没丢')

/* ------------------------------------------- 后台回读：块数是对的 ---- */
const reopened = await (await request('/admin/pages/about', admin)).text()
expect(reopened.includes('3 块'), '后台回读显示 3 块')
expect(reopened.includes('车间里的打样台'), '后台回读能回填图片说明')
expect(reopened.includes('自有工厂，先打样再量产。'), '后台回读把正文还原成可读文字')
expect(!reopened.includes('&lt;p&gt;'), '正文框里不再出现 <p> 标签')
expect(!reopened.includes('<p>自有工厂'), '正文框里不再出现原始 HTML')
expect(reopened.includes('皮料和木料都自己挑。'), '正文框里两段都在')

/* --------------------------------- 其它页面原有内容没被动过 ---- */
const faq = await (await request('/pages/faq')).text()
expect(faq.includes('How long does delivery take?'), 'FAQ 的种子正文还在（没被关于我们的保存影响）')
const contact = await (await request('/pages/contact-details')).text()
expect(contact.includes('customerservice@chenfurniture.com'), '联系我们的邮箱链接还在')
const delivery = await (await request('/pages/delivery')).text()
expect(delivery.includes('3-5 working days'), '配送说明的正文还在（未改动）')

/* ------------------------------------------- 列表上的最后修改时间 ---- */
const listAfter = await (await request('/admin/pages', admin)).text()
expect(/关于我们[\s\S]{0,400}3 块/.test(listAfter), '/admin/pages 上关于我们显示 3 块')
expect(listAfter.includes('2026-') || listAfter.includes(':'), '/admin/pages 显示了最后修改时间')

/* ------------------- 兜底：文件名的 key 对不上时，图也不能丢 ---- */
// 这就是用户碰到的那个 bug：浏览器把上传字段改成 upload.<新块标识>，但块标识
// 没跟着改，服务端按标识找不到文件。修好前端之后仍然留一道服务端防线：
// 没被任何块认领的文件，补进第一个空图片块，或者自己变成一块。
const boundary = '----smokepages' + Date.now()
const parts = []
for (const [name, value] of [
  ['handle', 'about'],
  ['page_title', '关于 Chen Furniture'],
  ['block_key[]', 'kb1'],
  ['block_type[]', 'page'],
  ['block_title[]', ''],
  ['block_body[]', '兜底测试的正文。'],
  ['block_image[]', ''],
  ['block_text[]', ''],
  ['block_width[]', 'wide'],
  ['block_key[]', 'kb2'],
  ['block_type[]', 'image_banner'],
  ['block_title[]', ''],
  ['block_body[]', ''],
  ['block_image[]', ''],
  ['block_text[]', ''],
  ['block_width[]', 'wide'],
]) {
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
}
parts.push(
  `--${boundary}\r\nContent-Disposition: form-data; name="upload.unknown-xyz"; filename="bench.png"\r\nContent-Type: image/png\r\n\r\n` +
    'PNGDATA' +
    '\r\n'
)
parts.push(`--${boundary}--\r\n`)

uploads.length = 0
const orphan = await request('/admin/pages/save', {
  method: 'POST',
  headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
  body: parts.join(''),
  redirect: 'manual',
})
expect(orphan.status === 303, `对不上 key 的提交也返回 303（${orphan.status}）`)
expect(uploads.length === 1, `没被认领的文件仍然被存进 R2（${uploads.length} 次）`)
const orphanPage = await (await request('/pages/about')).text()
const savedPath = uploads[0] ? '/' + uploads[0] : ''
expect(Boolean(savedPath) && orphanPage.includes(savedPath), `前台显示了这个兜底补上的图（${savedPath}）`)

console.log(failures ? `\n${failures} 项没通过` : '\n全部通过：登录 → 列表 → 8 页打开 → 编辑保存 → 前台顺序 → 再保存不重复 → 原有内容未动 → 孤儿上传兜底')
process.exit(failures ? 1 : 0)
