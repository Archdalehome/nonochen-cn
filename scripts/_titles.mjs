import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(':memory:')
for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
  db.exec(readFileSync('migrations/' + file, 'utf8'))
}
const rows = db
  .prepare("SELECT page, type, json_extract(data, '$.title') AS title, json_extract(data, '$.heading') AS heading, length(json_extract(data, '$.body')) AS bodyLength FROM sections WHERE page LIKE 'page:%' ORDER BY page")
  .all()
for (const row of rows) console.log([row.page, row.type, row.title, row.heading, row.bodyLength].join(' | '))
