import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(':memory:')
const files = readdirSync('migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()

function runAll(label) {
  for (const file of files) {
    const sql = readFileSync('migrations/' + file, 'utf8')
    try {
      db.exec(sql)
    } catch (error) {
      console.log(`FAILED ${label} at ${file}: ${error.message}`)
      process.exit(1)
    }
  }
  console.log(`${label}: all ${files.length} migrations applied`)
}

runAll('first run')

// 0003 起几条迁移本来就不是「可重复执行」的（ALTER TABLE 加列，靠 wrangler 的迁移
// 记录只会跑一次），所以幂等性只针对本轮新增的 0013 单独验证。
const zh = readFileSync('migrations/0013_zh_copy.sql', 'utf8')
db.exec(zh)
db.exec(zh)
db.exec(zh)
console.log('0013 re-run three times: no error (idempotent)')

const show = (sql) => db.prepare(sql).all().map((row) => Object.values(row).join(' = ')).join('\n')
console.log('--- settings ---')
console.log(show("SELECT key, value FROM settings WHERE key IN ('cart_title','cart_empty_title','cart_continue_label','cart_checkout_label','search_title','pdp_colour_heading','pdp_size_heading','newsletter_title','newsletter_button','footer_copyright','announcement_text') ORDER BY key"))
console.log('--- footer ---')
console.log(show("SELECT kind, label, url FROM menu_items WHERE location='footer' ORDER BY kind DESC, sort_order"))
console.log('--- still English (red line, untouched) ---')
console.log(show("SELECT key FROM settings WHERE key IN ('announcement_text','brand_line','cart_footer_note','pdp_trust_1','ship_accordion_body') AND value <> ''"))
