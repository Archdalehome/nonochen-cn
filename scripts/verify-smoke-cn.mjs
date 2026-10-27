/**
 * 冒烟断言的中文对应自检（不需要网络）：
 * 用与 `scripts/check.mjs` 相同的方式直接渲染后台/店面视图，
 * 确认 `scripts/smoke.mjs` 里改过的断言字符串真的出现在渲染结果里。
 *
 *   node scripts/verify-smoke-cn.mjs
 */
import { readFileSync } from 'node:fs'

const [{ render }, admin, footer, cart, drawerView, chrome] = await Promise.all([
  import('../src/lib/html.js'),
  import('../src/views/admin.js'),
  import('../src/views/footer.js'),
  import('../src/views/cart.js'),
  import('../src/views/cart-drawer.js'),
  import('../src/views/chrome.js'),
])

let failures = 0
const expectIn = (label, html, needles) => {
  for (const needle of needles) {
    if (html.includes(needle)) {
      console.log(`ok   ${label}: 「${needle}」`)
    } else {
      failures++
      console.log(`FAIL ${label}: 渲染结果里没有「${needle}」`)
    }
  }
}

/* /admin/categories -------------------------------------------------------- */
const categories = render(
  admin.adminPage({
    user: 'admin',
    siteName: 'Chen Furniture',
    title: '商品分类',
    body: admin.categoriesView({
      list: [
        {
          id: 1,
          slug: 'outdoor-range',
          name: '户外系列',
          url: '',
          href: '/category/outdoor-range',
          filterType: 'collection',
          filterValue: 'outdoor-range',
          position: 1,
          enabled: true,
        },
      ],
    }),
  })
)
expectIn('/admin/categories', categories, ['商品分类', '新增分类'])

/* /admin/home -------------------------------------------------------------- */
const homePage = render(
  admin.adminPage({
    user: 'admin',
    siteName: 'Chen Furniture',
    title: '首页内容',
    body: admin.homeView({
      settings: { announcement_text: 'Free Mainland UK Shipping On All Orders', announcement_icon: '/images/icon-delivery.svg' },
      hero: {
        id: 3,
        name: 'Homepage carousel',
        enabled: true,
        data: {
          interval: 3000,
          slides: [
            {
              url: '/collections/outdoor-range',
              title: 'Embrace the Outdoors',
              button: { label: 'Shop Outdoor', url: '/collections/outdoor-range', style: 'btn-white', color: '#000000' },
              video: '/images/hero-outdoor-desktop.mp4',
            },
          ],
        },
      },
      media: true,
    }),
  })
)
expectIn('/admin/home', homePage, ['首页内容', '公告栏', 'action="/admin/home/announcement"', 'action="/admin/home/hero"'])

/* /admin/footer ------------------------------------------------------------ */
const footerPage = render(
  admin.adminPage({
    user: 'admin',
    siteName: 'Chen Furniture',
    title: '页脚',
    body: admin.footerView({
      media: true,
      settings: { footer_copyright: '© 2026 Chen Furniture', site_name: 'Chen Furniture' },
      groups: [
        {
          id: 1,
          parent_id: null,
          kind: 'group_heading',
          label: '公司',
          url: '',
          sort_order: 1,
          enabled: true,
          links: [{ id: 11, parent_id: 1, kind: 'link', label: '关于我们', url: '/pages/about', sort_order: 1, enabled: true }],
        },
      ],
    }),
  })
)
expectIn('/admin/footer', footerPage, ['页脚</h1>', 'action="/admin/footer/brand"', 'action="/admin/footer/group"', 'action="/admin/footer/link"'])

/* /admin/categories/products ----------------------------------------------- */
const productScreen = render(
  admin.adminPage({
    user: 'admin',
    siteName: 'Chen Furniture',
    title: '户外系列 中的商品',
    body: admin.categoryProductsView({
      category: { id: 1, slug: 'outdoor-range', name: '户外系列', href: '/category/outdoor-range', filterType: 'collection', filterValue: 'outdoor-range' },
      list: [
        {
          id: 7,
          handle: 'b-bag-grey',
          title: 'B-Bag - Grey',
          price: 249,
          compare_at_price: null,
          price_from: 0,
          badge: 'Best seller',
          image: '/images/b-bag-grey.png',
          cat_handle: 'outdoor',
          cat_label: 'Outdoor',
          colour_hex: '#5f6062',
          summary: 'A bean bag.',
          description: 'The long copy.',
          collection_handle: 'outdoor-range',
          sold_out: 0,
          is_new: 0,
          show_in_home_grid: 1,
          sort_order: 3,
          soldOut: false,
          inGrid: true,
        },
      ],
      picker: [],
      symbol: '£',
    }),
  })
)
expectIn('/admin/categories/products', productScreen, ['删除商品', '从该分类移除'])

const emptyProductScreen = render(
  admin.categoryProductsView({
    category: { id: 1, slug: 'outdoor-range', name: '户外系列', href: '/category/outdoor-range', filterType: 'collection', filterValue: 'outdoor-range' },
    list: [],
    picker: [],
    symbol: '£',
  })
)
expectIn('/admin/categories/products (empty)', emptyProductScreen, ['暂无可编辑的商品'])

/* /admin/login ------------------------------------------------------------- */
const login = render(admin.loginView({ siteName: 'Chen Furniture', error: '', next: '/admin/categories' }))
expectIn('/admin/login', login, ['登录后即可管理店铺', 'name="username"', 'name="password"'])

/* 空购物车 ---------------------------------------------------------------- */
const emptyCart = render(cart.cartPage({ cart: { items: [], subtotal: 0 }, settings: {}, symbol: '£' }))
expectIn('/cart (empty)', emptyCart, ['购物车是空的', '继续选购'])

const drawer = render(drawerView.cartDrawer({}, { items: [], subtotal: 0 }, '£'))
expectIn('/cart/drawer (empty)', drawer, ['购物车是空的', '继续选购'])

/* 站点根路径 -------------------------------------------------------------- */
const page = render(
  cart.checkoutPage({ cart: { items: [{ id: 1, handle: 'x', title: 'X', image: '/x.png', qty: 1, lineTotal: 1 }], subtotal: 1 }, symbol: '£' })
)
expectIn('/checkout', page, ['订单摘要', '小计', '合计'])

/* 后台 404 文案（来自 src/index.js 的字符串常量） --------------------------- */
const indexSource = readFileSync('src/index.js', 'utf8')
expectIn('src/index.js', indexSource, ['这个分类已经不存在了。', '页面不存在'])

/* 头部与移动菜单（分类由 D1 提供，这里只验证固定文案） ---------------------- */
const chromeHtml = render(chrome.mobileNav([], '/'))
expectIn('mobile menu', chromeHtml, ['搜索', '联系方式', '门店位置'])

console.log(failures ? `\n${failures} 条断言在本地渲染结果里找不到` : '\n全部断言与本地渲染结果一致')
process.exit(failures ? 1 : 0)
