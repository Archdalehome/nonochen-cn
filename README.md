# Chen Furniture - Cloudflare Workers storefront

A from-scratch Cloudflare Workers storefront for Chen Furniture: server-rendered
HTML views, D1 for the catalogue + carts, R2 (with a static-asset fallback) for
the product imagery. No framework, no bundler step - just `wrangler.jsonc`, SQL
migrations and tagged-template views.

> The demo catalogue, copy and photography were captured from a public storefront
> and stay the property of their original owner. Treat this as a technical
> exercise rather than a production shop to point customers at.

## 内销中文站：本地化范围与未完成项

这一支是 `nonochen` 的中文版（内销站）：界面中文化、币种改为人民币，但**库里的价格数字与承诺话术没动**。

已完成：

- `src/views/*.js`（店面全部视图 + `/admin` 后台界面）、`src/lib/admin.js`（后台校验提示）、
  `src/index.js`（路由层 404 / 提示表 / SEO 文案 / JSON 接口错误信息）、`public/js/site.js`（前端提示）
  的**用户可见文案**全部改为中文；`<html lang>` 改为 `zh-CN`。
- `migrations/0013_zh_copy.sql`：D1 里 `settings`（购物车、搜索、商品页表单标题、订阅区、版权行）
  与 `menu_items`（页脚栏目名与链接名）的中文改写，幂等，可重复执行。
- `migrations/0015_zh_page_titles.sql`：8 个内容页的**标题**改中文（关于我们 / 联系我们 / 常见问题 /
  服务条款 / 隐私政策 / 配送说明 / 退换货 / 门店位置）。**正文一个字没动**——那四页政策文本写的是
  英国配送与退换期限，要业主自己用 `/admin/pages` 写。
- **币种**：`wrangler.jsonc` 的 `CURRENCY=CNY` / `CURRENCY_SYMBOL=¥`，视图里的 `symbol = '¥'` 默认值、
  `money()` 默认值、`public/js/site.js` 的两处符号、商品页结构化数据的 `priceCurrency: 'CNY'`。
  **价格数字一个没动**（演示商品反正要整套换），人民币定价仍待业主给价目表。
- **后台商品页的四个明细编辑器**：规格表、卖点、尺寸/颜色变体、图片视频图集。写回
  `products.specs` / `products.features`（JSON）、`product_variants`、`product_media`。行可增删、
  用 ↑↓ 或拖拽排序；图集既可填路径也可多选上传（需要绑 R2）。表单带 `has_details` 标记，
  旧页面或脚本提交不会冲掉已有明细；新建商品没有尺寸时自动补一条「默认」。

仍未中文化 / 需业主定稿后才能动：

- **承诺类文案**：`settings` 里的 `announcement_text`（免邮公告）、`brand_line`（品牌话术）、
  `cart_footer_note`、`pdp_trust_1/2`、`pdp_geo_note`、`ship_accordion_body`、`returns_note`
  保持英文原样；`src/views/product.js` 的 `Free UK delivery on orders over ¥75…` 也没有翻——
  这些是免邮、交期、质保类承诺，改写成中文等于对外承诺，需要业主终审。
- **商品与内容数据**：`migrations/0002_seed.sql` 的 120KB 演示商品与页面正文仍是英文；如果这些不是
  真实商品，需要业主给真实品名、规格、价格、图片对应关系后整套替换，再补中文化。

## 自检脚本（不需要网络）

| 命令 | 检查什么 |
| --- | --- |
| `npm run check` | 所有模块能解析、视图能渲染、种子数据与 schema 对齐 |
| `node --experimental-sqlite scripts/verify-product-editor.mjs` | 用内存 SQLite 跑完整链路：保存表单（2 尺寸 / 3 颜色 / 4 图 / 2 规格 / 3 卖点）→ 前台渲染 → 再存一次不重复 → 旧提交不丢数据 → 后台回填 |
| `node scripts/verify-smoke-cn.mjs` | 冒烟脚本里的中文断言是否与本地渲染结果一致 |
| `node --experimental-sqlite scripts/shot-product-editor.mjs` | 渲染后台商品页与前台商品页到 `.shot/`，可配合无头浏览器截图 |

## Stack

| piece | detail |
| --- | --- |
| runtime | Workers module syntax, built-in `fetch` only, no dependencies at runtime |
| routes | `src/index.js` - pages, `/cart/*`, `/checkout`, `/search`, `/sitemap.xml`, `/robots.txt`, `/images/*` |
| views | `src/views/*.js` tagged-template helpers (`src/lib/html.js`) |
| data | D1 `el_store`, created by `migrations/0001_schema.sql` + `0002_seed.sql` (+ `0003_cart_items_detail.sql`, `0004_rebrand.sql`) |
| media | R2 `el-media` bound as `MEDIA`; `/images/*` streams the object with an `immutable` cache header and falls back to the mirrored copy in `public/images` |
| assets | `public/` (`css/site.css`, `js/site.js`, `images/`) served by the assets binding with `run_worker_first`, so dynamic routes always win |
| tooling | Node 22+ (Wrangler 4 refuses to run on less) and Wrangler 4 (the only devDependency) |

## First run

```bash
npm install
npm run setup        # mirror ./images -> public/images, apply migrations to the local D1
npm run media:local  # optional: copy ./images into the local R2 bucket
npm run dev          # http://localhost:8787
```

With `npm run dev` running:

```bash
npm run smoke                # pages, static assets, 404s, /images/*, cart round trip
npm run check                # syntax-check every module, render views against the seed
```

`npm run smoke` takes an optional base URL, so the same script verifies the
deployed Worker: `npm run smoke -- https://chen-furniture.<subdomain>.workers.dev`.
Right after a deploy the edge can still answer with the previous release, so pass
`SMOKE_HEADER_ATTEMPTS` to retry the header-placement check (the deploy workflow
uses 12 retries of 5s; every other check stays single-shot).
`_scratch/` holds the scraped reference dumps the views were authored from and is
git-ignored.

## Commands

| command | what it does |
| --- | --- |
| `npm run dev` | `wrangler dev` on http://localhost:8787 with local D1, R2 and assets |
| `npm run setup` | `scripts/setup.mjs` - mirror `./images` + `d1 migrations apply` |
| `npm run db:local` / `db:remote` | migrations only |
| `npm run media:local` / `media:remote` | upload `./images` to the `MEDIA` bucket |
| `npm run media:fetch` | re-download `./images` from the storefront they came from: `npm run media:fetch -- --origin https://example.com` (manifest: `scripts/data/media.json`, which keeps paths only) |
| `npm run seed:build` | regenerate `migrations/0002_seed.sql` from `scripts/data/*` |
| `npm run check` | local sanity check (parse + render) |
| `npm run smoke` | HTTP smoke test against `wrangler dev` or a deployment |
| `npm run deploy` | publish with `wrangler deploy` |

Flags: `scripts/setup.mjs` takes `--local|--remote`, `--db-only`, `--media-only`,
`--with-media`, `--skip-copy`, `--reset`, `--dry-run`; `scripts/upload-media.mjs`
takes `--local|--remote`, `--only <glob>`, `--concurrency <n>`, `--retries <n>`,
`--dry-run`.

## Deploying

The bindings in `wrangler.jsonc` already point at provisioned resources on the
`chenfurnitureco@gmail.com` account:

- D1 `el_store` - `ddcc120e-87bc-408a-bbc4-9d2c7f36569a`
- R2 `el-media`

```bash
npx wrangler login
npx wrangler d1 create el_store         # only on a fresh account - copy the id into wrangler.jsonc
npx wrangler r2 bucket create el-media  # only on a fresh account
node scripts/setup.mjs --remote --with-media   # migrate D1 + push ./images to R2
npx wrangler deploy --dry-run           # inspect the bundle without publishing
npm run deploy                          # publishes chen-furniture.<subdomain>.workers.dev
```

`npm run deploy` publishes the demo catalogue to a public URL, so committing to
`main` (see below) is the intended way to release.

Two things to know when switching accounts:

1. local dev keeps its SQLite file and R2 objects under `.wrangler/state/v3`,
   keyed by `database_id`, so after changing the id re-run `npm run setup`;
2. `wrangler d1 migrations apply` can only reach the remote database once
   `database_id` is a real UUID - a placeholder id fails with
   `Invalid property: databaseId => Invalid uuid [code: 7400]`.

## Continuous deployment

`.github/workflows/deploy.yml` publishes the Worker on every push to `main`, and
can also be started by hand from the Actions tab (or `gh workflow run deploy.yml`):

1. `npm ci` then `npm run check` - nothing ships if a view stops parsing or rendering;
2. `node scripts/setup.mjs --skip-db` - mirrors `./images` into `public/` so the
   assets binding always carries the local copies;
3. `npx wrangler d1 migrations list <db> --remote` probes whether the token may
   talk to D1 at all. If it may, `node scripts/setup.mjs --remote --db-only`
   applies any new `migrations/*.sql`; if it may not, that step is skipped with a
   warning telling you to run `npm run db:remote` from a machine with
   `npx wrangler login` (or to add *D1: Edit* to the token);
4. `npm run deploy` - uploads the Worker, captures the `*.workers.dev` URL and
   runs `scripts/smoke.mjs` against it: home, `/products`, a product page,
   `/collections`, `/cart`, `/cart/drawer`, `/search`, `sitemap.xml`,
   `robots.txt`, the CSS/JS assets and `/images/*` all have to answer, the cart
   round trip has to work against the real D1, the product categories have to
   render in the header row and at the top of the mobile drawer - which holds
   nothing else but the Search / Contact Details / Store Locator links - and every
   one of their links has to answer (those checks retry for up to a minute, because
   the edge can serve the release that was live a moment earlier), and the admin
   area has to sign in
   with `SMOKE_ADMIN_USER` /
   `SMOKE_ADMIN_PASSWORD`,
   add a hidden `smoke-<timestamp>` category, reject a duplicate slug and a bad
   slug, edit it, move it, create a `smoke-product-<timestamp>` product in it,
   reject a bad price and a duplicate product slug, edit that product, take it
   out of the category and put it back, open `/admin/home`, save the announcement
   bar and the hero back exactly as the screen showed them (so nothing on the
   homepage moves) and find both on `/`, do the same round trip for the footer
   columns on `/admin/footer` (whose About and FAQ links have to answer), delete
   the product, delete the category
   and sign out - all against the live D1 (`/wrangler.jsonc`, `/src/...`,
   `/migrations/...` have to keep returning 404 as well);
5. if the push touched `images/`, `npm run media:remote` syncs the bucket (a push
   that only changes code skips it);
6. the Wrangler log is uploaded as a build artifact when a deploy fails.

The only secret it needs:

| secret | where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard -> My Profile -> API Tokens -> Create Token. The **Edit Cloudflare Workers** template covers Workers, D1 and R2; if you build it by hand you need *Account - Workers Scripts: Edit*, *Account - D1: Edit* and *Account - R2: Edit* |

Without *Account - D1: Edit* the pipeline still deploys code: the probe above
fails, the migration step is skipped and the run prints a `D1 migrations were
skipped` warning instead of stopping. The smoke test that follows then fails on
whatever that migration was meant to add (a page it creates, a screen it seeds),
so apply it from a machine where `npx wrangler login` works before the next push:

```bash
npm run db:remote        # npx wrangler d1 migrations apply el_store --remote
```

`CLOUDFLARE_ACCOUNT_ID` is optional - the workflow falls back to the account in
this repo (`7357c2534797a4c04fc95ec58cc04a89`). Set it as a secret or variable if
you fork this onto another account. Add the secret with
`gh secret set CLOUDFLARE_API_TOKEN`, or in the repo under *Settings -> Secrets
and variables -> Actions*.

Deploys are serialised (`concurrency`) and a running deploy is never cancelled,
so two quick pushes queue up instead of racing each other. Until
`CLOUDFLARE_API_TOKEN` exists the job stops on the first step with a
`Missing CLOUDFLARE_API_TOKEN` annotation instead of failing inside Wrangler.

## Admin (`/admin`)

A small admin area manages the **product categories** - the row of links in the
header, next to the logo and the search/cart icons, on every page -, the **home
page content** - the announcement bar that sits above that header and the hero
video with the wording and links over it - and the **footer** under every page:
the company block in the corner (the uploaded logo, the name of the business
beside it and the line of copy under both) and the **footer columns** beside it -
the column headings and the links in them. The mobile drawer shows the same
category list above its three fixed links - **Search**, **Contact Details** and
**Store Locator**; the menu tree that came in with the Shopify import is not
rendered anywhere.

* `/admin/login` - sign in with **admin / admin** (see below to change it)
* `/admin/home` - the announcement bar and the hero: its video (a path, a URL or
  an upload), the heading, text and links over it
* `/admin/footer` - the company block at the bottom left of every page (its logo,
  the company name beside it and the description under both) and the link columns
  beside it (Company, Follow and Help): upload, rename, reorder, hide and re-fill
  them
* `/admin/categories` - add, rename, reorder, hide and delete categories
* `/admin/categories/products?slug=<slug>` - the products one category lists:
  edit any row, add a product that is already in the shop, create a brand new
  one, take a product out of the category, or delete it for good

Every category row links straight to that screen ("Manage the products in this
category").

Each row controls:

| field | meaning |
| --- | --- |
| name | the label shown in the header |
| slug | the unique key, also used for `/category/<slug>` |
| link override | optional - empty means the label links at `/category/<slug>`; set it to reuse an existing page such as `/collections/outdoor-range`. A `/collections/<handle>` no collection uses is flagged in red on the row: that link would 404, so nothing added to the category could show on the site |
| products shown | `collection` (everything in a collection), `tag` (products whose `cat_handle` / `cat_label` matches) or `all products` |
| order | position in the header row - the arrows move a row one step |
| visible | unchecked rows stay in the admin but leave the storefront |

Edits are written to the D1 `categories` table (created and seeded by
`migrations/0005_categories.sql`) and appear straight away: the storefront
memoises the list for 30 seconds per Worker isolate and the admin invalidates it
on every write. Only `position` is compared, so deleting a row can leave a gap
(the seeded ten may read 1..9, 11 after the deploy smoke test has created and
removed its own row) - the admin list and the storefront show the same order
either way.

The migration is idempotent (`create table if not exists`, `insert or ignore`),
so applying it twice - for example once by hand and once by the pipeline - is
harmless.

### The products in a category

`/admin/categories/products?slug=<slug>` (linked from every row above) shows the
products the header link leads to, and changes them without touching D1 by hand:

* **edit** any product - title, slug, price, "was" price, badge, image, tag
  handle/label, swatch colour, order, summary, description, `sold out`, `new`,
  the `from` label, whether it may appear in the homepage rows, and the SEO title
  / description. Saving rewrites that `products` row;
* **add** a product that is already in the shop - the picker offers the products
  this category does not list yet, plus the ones another category already holds as
  locked entries naming that category (and the action refuses those with
  `?error=product-taken`), or **create** a brand new one - it lands in
  the category it was created from;
* **remove** a product from this category without deleting it, or **delete** it
  for good (its variants, media and cart lines go with it). The destructive
  buttons ask first; without JS the form simply submits.

What "in this category" means follows the row's filter:

| filter | adding | removing |
| --- | --- | --- |
| collection | a `product_collections` row (and the product's own `collection_handle`, when it is still empty) plus the product's category fields | that row goes, the pointer and the fields are cleared |
| tag | the product's `cat_handle` / `cat_label` become the filter value | they are cleared again |
| all products | nothing to add, every product is listed already | nothing to remove |

**A product belongs to one category.** `cat_handle` and `cat_label` - the *Tag
handle* and *Tag label* fields on the product form - are that category, so adding
a product sets both to the category the admin is looking at, whichever filter the
row uses, so the category page the storefront renders and the fields on the
product always agree. A product that
another category already holds cannot be added again: the picker locks it and the
action answers `?error=product-taken`, and *Remove from this category* sets it
free. The `product_collections` rows are curated lists rather than ownership, so
the seeded products stay in every collection they were imported into.
The product detail page reads the same ownership: its breadcrumb is *Home / the
category / the product*, and the middle crumb is named and linked exactly like the
category in the header. A product whose seeded `collection_handle` points somewhere
else still shows the category it was filed under, because a collection is not a
category; the collection only decides the crumb when no category claims the product
at all, and a hidden category never does (`categoryOfProduct` in `src/lib/db.js`).
`npm run smoke` fails a release whose product breadcrumb names anything but one of
the header categories.

Both writes invalidate the Worker's 30 second product cache, so the storefront
shows the change on its next request. A category lists at most 200 products on
that screen; the storefront reads the same rows, so it shows the same list.

When the row's link override is a `/collections/<handle>` that no collection
answers to, both admin screens warn instead of letting the products disappear:
the storefront link 404s, while the products themselves are still listed at
`/category/<slug>`. Clear the override (or pick a collection that exists) to put
them back on the link in the header.

### The announcement bar and the hero

`/admin/home` edits the two blocks the storefront already renders, and only what
they say - never how they are laid out:

* the **announcement bar** - the message and the icon in front of it
  (`settings.announcement_text` / `announcement_icon`). An empty icon drops the
  icon, which is what the bar already does;
* the **hero** - one form per slide of the `hero` row in `sections`: the desktop
  and phone video, the two still images, the heading and text over the video, the
  link for the whole slide, and the button (label + link). Every field is one the
  hero already reads, so the button keeps the style and colour it was given and
  the carousel keeps its timing.

The screen opens with what is live right now - the bar itself and a small player
for the video - so what a save replaces is visible before it happens.

A media field takes a **path or URL** (`/images/hero-outdoor-desktop.mp4`,
`https://...`) and, next to it, a **file**. Picking a file stores it in R2 as
`images/hero/<timestamp>-<name>.<ext>` and writes that path into the field: the
timestamp keeps the new video out of the year long cache of the one it replaced,
and the extension follows the declared type (MP4 / WebM / MOV, JPEG / PNG / WebP
/ AVIF - no SVG, like the other uploads). Files stop at 25 MB, and when the
`MEDIA` binding is missing the file pickers are not offered at all.

Two details that keep the hero working: a slide with no phone video reuses the
desktop file (a phone would otherwise show an empty hero), and clearing the
button label removes the button, which makes the whole slide the link. Saving
invalidates the cached `sections` / `settings` rows exactly like the category
writes do, so the storefront shows the change on its next request.

### The company block

The bottom left corner of every page is the company block: a logo, the name of the
business beside it and one line of description under both. `/admin/footer` edits
all three in one form:

* the **logo** is a path to an image that is already on the site
  (`/images/footer/logo.png`), a full `https://` URL, or a file picked in the form
  - a picked file is stored in R2 under `images/footer/` and the field next to the
  picker is updated to it, the same way the hero videos are handled. It sits to the
  left of the company name on the mark's own bottom edge, and the name is a fifth
  smaller than it is on its own so the two read as one lockup (a narrow column wraps
  the name under the mark). Leaving it empty is fine: the name then takes the line to
  itself at its full size, which is how that corner of the footer read before the
  upload existed;
* the **company name** is required - the page titles (`<title>`, `og:site_name`)
  and the meta description read the same `site_name` setting;
* the **description** is the sentence under the name (`brand_line`), and it is
  also the fallback meta description for pages without one of their own.

The three parts are ordinary `settings` rows (`footer_logo`, `site_name`,
`brand_line`), so the screen writes exactly what `views/footer.js` renders -
`migrations/0012_footer_brand_logo.sql` added the `footer_logo` key to databases
that were seeded before it, and an empty value means no logo.

### The footer columns

`/admin/footer` edits the columns at the bottom of **every** page - the same rows
the storefront already renders, so nothing about the layout changes:

* a **column** is a heading plus the links under it. Rename it, move it up or
  down the row, switch it off (the storefront then drops it, the links stay in
  the admin) or delete it along with its links;
* a **link** is the text a shopper reads and the page behind it. Links have to be
  a path (`/pages/about`), a full `https://` URL or a `mailto:` address - a link
  that goes nowhere is refused. `https://` links (the socials) open in a new tab,
  paths stay on the site.

The country/currency `<select>` that used to close that row is gone: nothing read
the `country_options` setting, nothing handled the form (`data-localize` posted to
a `/localization` route the Worker never had) and `scripts/data/content.mjs` no
longer carries the country list, so the seed no longer writes the key. The columns
now split the row between themselves.

The columns are rows in `menu_items` (`location = 'footer'`, one `group_heading`
per column and one `link` per item under it, which is what the seed writes too)
and the screen writes them through the same cached reads the storefront uses, so
a save shows up on the next request. The order field and the arrows do the same
job: the field writes `sort_order`, the arrows renumber the whole list.

Two things worth knowing:

* the width of a column follows how many of them there are, so the columns always
  fill the half of the footer that sits under the logo - two read as halves, three
  as thirds and four as quarters (halves on a tablet) - and the row never wraps;
* the seeded columns are **Company** (About, Contact, FAQ), **Follow**
  (Instagram, Facebook, TikTok) and **Help** (Terms, Privacy, Delivery, Returns).
  `migrations/0006_footer.sql` is what puts them there, and it also creates the
  `page:about` and `page:faq` pages those two Company links need - ordinary
  content pages, with copy that sticks to what the site already publishes. Point
  a link somewhere else from this screen and the pages are simply unused.
  `migrations/0007_drop_footer_location_heading.sql` takes the old `Location`
  heading setting, and `migrations/0008_drop_country_options.sql` the country list
  behind the old currency picker, back out of a database that still has them.

The social handles in the seeded Follow column point at the platforms' own
homepages; replace them with your profile URLs.

### Changing the password

```bash
npx wrangler secret put ADMIN_USER      # optional, defaults to admin
npx wrangler secret put ADMIN_PASSWORD  # defaults to admin - set this before sharing the URL
```

The session cookie is signed with the password, so changing it signs everybody
out. The admin screens are `noindex` and blocked in `robots.txt`, but the login
is the only protection there is - add the same values as `SMOKE_ADMIN_USER` /
`SMOKE_ADMIN_PASSWORD` repository secrets so the deploy smoke test (and
`npm run smoke`) keeps passing.

## Editing the content

The categories - and the products in them - have an admin UI; everything else
lives in Cloudflare and can be changed without a deploy:

| what | where |
| --- | --- |
| the remaining copy, the other homepage blocks, carts | D1 `el_store` - Cloudflare dashboard -> *Workers & Pages -> D1 -> el_store -> Console*, or `npx wrangler d1 execute el_store --remote --command "select * from settings"` |
| the announcement bar, the hero video and its wording | `/admin/home` (see above) |
| the company block in the footer and the link columns beside it | `/admin/footer` (see above), or the `settings` rows `footer_logo` / `site_name` / `brand_line` and the `menu_items` rows with `location = 'footer'` |
| the header categories | `/admin/categories` (see above), or the `categories` table directly |
| the products inside a category | `/admin/categories/products?slug=<slug>` (see above), or the `products` / `product_collections` / `product_variants` tables directly |
| images and video | R2 `el-media` - dashboard -> *R2 -> el-media -> Objects*, or drop files into `./images` and run `npm run media:remote` |
| the defaults used to (re)seed a database | `scripts/data/content.mjs`, then `npm run seed:build`, then `npm run db:remote` |
| worker name, vars, bindings | `wrangler.jsonc` (a change there needs a `git push` to take effect) |
| deploy history, logs, secrets | GitHub -> *Actions*, and dashboard -> *Workers & Pages -> chen-furniture -> Deployments / Logs / Settings* |

### The homepage blocks

The homepage is the `sections` rows with `page = 'home'`, rendered in `position`
order. The seeded order is the one the shop asked for:

| # | block | the `sections` row |
| --- | --- | --- |
| 1 | the hero carousel | `type = 'hero'`, *Homepage carousel* |
| 2 | **New Products** | `type = 'product_row'`, *New Products* |
| 3 | **Discover Products & Ranges** | `type = 'masonry'`, *Discover Products & Ranges* |
| 4 | **All Products** | `type = 'product_row'`, *All Products* |
| 5 | Shop Outdoor / Shop Indoor | `type = 'link_grid'` |
| 6 | *Are you sitting comfortably?* | `type = 'image_banner'` |
| 7 | *Keep Cosy Anywhere* | `type = 'image_banner'` |

Blocks 2-4 are the three product blocks and they sit directly under the hero.
Every block keeps its own markup, copy and images - moving one means changing its
`position` alone - and `migrations/0009_home_block_order.sql` is what put them in
this order in the databases that were already seeded. `scripts/data/content.mjs`
carries the same positions, so `0002_seed.sql` and a fresh database match, and
`npm run smoke` fails the release if a database still serves the old order.
Changing what a block contains (the products in the two rows, the tiles in the
masonry) is still a D1 edit on its `data` column.

## Layout

```
wrangler.jsonc        bindings: DB (D1), MEDIA (R2), ASSETS, vars
.github/workflows/    deploy.yml - the auto-deploy pipeline described above
migrations/           D1 schema + generated seed
public/               css/site.css, js/site.js, images/ (generated by `npm run setup`)
images/               scraped product imagery (source of truth for R2 + assets)
scripts/              setup.mjs, upload-media.mjs, wrangler-cli.mjs (shared helpers),
                      fetch-media.mjs, build-seed.mjs, check.mjs, smoke.mjs, data/
src/index.js          router + request handlers (storefront + /admin)
src/lib/              html.js (templates), db.js (queries), cart.js (cart + cookies),
                      cookies.js (cookie helpers), admin.js (login, session, category +
                      product + home content rules, hero uploads)
src/views/            layout, chrome (incl. the header categories), home, product,
                      collection, cart, cart-drawer, admin (login, the home page content
                      - announcement bar + hero -, the category manager, the products of a category), ...
_scratch/             scraped dumps used while writing the views (git-ignored)
```
