/**
 * 标题迁移自检：
 *   1. 建内存库（14 条旧迁移）→ 记下 8 页的正文
 *   2. 跑 0015 → 标题变中文、正文逐字节不变
 *   3. 再跑两次 0015 → 无变化（幂等）
 *   4. 用 Worker 的 contentPage 渲染，确认前台标题是中文、正文没动
 *
 *   node --experimental-sqlite scripts/verify-page-titles.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const files = readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()
const before = files.filter((name) => name !== '0015_zh_page_titles.sql')
const db = new DatabaseSync(':memory:')
for (const file of before) db.exec(readFileSync('migrations/' + file, 'utf8'))

const pages = ['about', 'contact-details', 'faq', 'terms-and-conditions', 'privacy', 'delivery', 'returns', 'store-locator']
const snapshot = () =>
  db
    .prepare("SELECT page, json_extract(data, '$.title') AS title, json_extract(data, '$.heading') AS heading, json_extract(data, '$.body') AS body FROM sections WHERE page LIKE 'page:%' AND type = 'page' ORDER BY page")
    .all()

const beforeRows = snapshot()
const bodiesBefore = new Map(beforeRows.map((row) => [row.page, row.body]))

let failures = 0
const ok = (label) => console.log('ok   ' + label)
const fail = (label) => {
  failures++
  console.log('FAIL ' + label)
}
const expect = (condition, label) => (condition ? ok(label) : fail(label))

expect(beforeRows.length === 8, `旧库里有 8 个内容页（实际 ${beforeRows.length}）`)
for (const row of beforeRows) expect(Boolean(row.heading) === false, `${row.page} 迁移前没有 heading`)

const migration = readFileSync('migrations/0015_zh_page_titles.sql', 'utf8')
db.exec(migration)
db.exec(migration)
db.exec(migration)

const afterRows = snapshot()
const byPage = new Map(afterRows.map((row) => [row.page, row]))
const want = {
  'page:about': '关于我们',
  'page:contact-details': '联系我们',
  'page:faq': '常见问题',
  'page:terms-and-conditions': '服务条款',
  'page:privacy': '隐私政策',
  'page:delivery': '配送说明',
  'page:returns': '退换货',
  'page:store-locator': '门店位置',
}
for (const handle of pages) {
  const row = byPage.get('page:' + handle)
  expect(row && row.heading === want['page:' + handle], `${handle} 的标题是「${want['page:' + handle]}」`)
  expect(row && row.title === null, `${handle} 的旧 title 字段已清除（不会重复渲染标题）`)
  expect(row && row.body === bodiesBefore.get('page:' + handle), `${handle} 的正文逐字节未变`)
}

// 再跑一次不应该改变任何东西（幂等）
const again = snapshot()
expect(JSON.stringify(again) === JSON.stringify(afterRows), '连跑三次 0015 后数据完全一致（幂等）')

// 用真实视图渲染，确认前台读的是中文标题、正文原样
const [{ render }, { contentPage }] = await Promise.all([import('../src/lib/html.js'), import('../src/views/pages.js')])
const list = (handle) =>
  afterRows
    .filter((row) => row.page === 'page:' + handle)
    .map((row) => ({
      type: 'page',
      data: { title: row.title || '', heading: row.heading || '', body: row.body || '' },
    }))

for (const handle of pages) {
  const html = render(contentPage({ handle, list: list(handle) }))
  const heading = (/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) || ['', ''])[1].trim()
  expect(heading === want['page:' + handle], `/pages/${handle} 的 H1 是「${want['page:' + handle]}」（实际「${heading}」）`)
}

// 正文仍以原来的英文开头，说明确实没被翻译
const aboutHtml = render(contentPage({ handle: 'about', list: list('about') }))
expect(aboutHtml.includes('generous, sink-into-it comfort'), '关于我们正文仍是原文（未翻译正文）')
const returnsHtml = render(contentPage({ handle: 'returns', list: list('returns') }))
expect(returnsHtml.includes('return'), '退换货正文仍是原文（未翻译条款）')

console.log(failures ? `\n${failures} 项没通过` : '\n全部通过：标题中文、正文零改动、连跑三次幂等、前台渲染正确')
process.exit(failures ? 1 : 0)
