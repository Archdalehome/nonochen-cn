import { test, expect } from '@playwright/test';

/**
 * 用户报的那条路径，一字不差地在真浏览器里走一遍：
 *
 *   登录后台 → /admin/pages/about → 点「添加图片块」→ 选一张图 → 保存
 *   → 前台 /pages/about 上出现这张图，而且图片真的加载成功（naturalWidth > 0）
 *
 * 这条用例要抓的正是「只发 POST 的测试抓不到」的那类 bug：浏览器给文件字段改名
 * 而块标识没跟着改，服务端按标识找不到文件，图片被静默丢掉。
 *
 * 本地跑（需要先 `npx playwright install chromium`）：
 *   npx playwright test
 * 管理员账号默认 admin/admin（本地 wrangler dev 的默认值），可用两个环境变量覆盖：
 *   PW_ADMIN_USER / PW_ADMIN_PASSWORD
 */

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.PW_ADMIN_PASSWORD || 'admin';

// 1×1 的 PNG，够当一张能加载的图，不用往仓库里放二进制文件
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('后台加图片块并上传，前台能看到这张图', async ({ page }) => {
  // 1. 登录
  await page.goto('/admin/login');
  await page.fill('#admin-username', ADMIN_USER);
  await page.fill('#admin-password', ADMIN_PASSWORD);
  await page.click('form[action="/admin/login"] button[type="submit"]');
  await page.waitForURL('**/admin/categories');

  // 2. 打开「关于我们」的编辑器
  await page.goto('/admin/pages/about');
  await expect(page.locator('h1')).toContainText('关于我们');

  // 3. 新增一个图片块，并给它选一张图
  await page.click('[data-repeat-add="image_banner"]');
  const row = page.locator('[data-repeat-row]').last();
  await expect(row.locator('[data-block-fields="image_banner"]')).toBeVisible();
  await row.locator('input[type="file"]').setInputFiles({
    name: 'bench.png',
    mimeType: 'image/png',
    buffer: PNG,
  });

  // 4. 保存，并确认成功后是回到编辑器
  await page.click('form[action="/admin/pages/save"] button[type="submit"]');
  await page.waitForURL('**/admin/pages/about**');
  await expect(page.locator('.alert')).toContainText('页面已保存');

  // 5. 前台：图片块在，路径对，而且图真的加载出来了
  await page.goto('/pages/about');
  const image = page.locator('figure.content-image img').last();
  await expect(image).toHaveAttribute('src', /^\/images\/pages\//);
  await expect
    .poll(() => image.evaluate((element) => element.naturalWidth), { timeout: 10_000 })
    .toBeGreaterThan(0);

  // 6. 再回后台看一眼：图片路径回填进了块里（没有「传了但没进去」）
  await page.goto('/admin/pages/about');
  const savedRow = page.locator('[data-repeat-row]').filter({ has: page.locator('[data-block-type]') }).last();
  await expect(savedRow.locator('input[name="block_image[]"]')).toHaveValue(/^\/images\/pages\//);

  // 7. 收尾：把自己加的那一块删掉再保存，页面恢复原样
  //    （这一步让这条用例也能对着预发环境跑，不会留下测试内容）
  await page.locator('[data-repeat-row]').last().locator('[data-repeat-remove]').click();
  await page.click('form[action="/admin/pages/save"] button[type="submit"]');
  await page.waitForURL('**/admin/pages/about**');
  await expect(page.locator('.alert')).toContainText('页面已保存');
});

test('上传的文件名与块标识成对（前端 bug 的定点回归）', async ({ page }) => {
  await page.goto('/admin/login');
  await page.fill('#admin-username', ADMIN_USER);
  await page.fill('#admin-password', ADMIN_PASSWORD);
  await page.click('form[action="/admin/login"] button[type="submit"]');
  await page.waitForURL('**/admin/categories');

  await page.goto('/admin/pages/about');
  await page.click('[data-repeat-add="image_banner"]');

  const row = page.locator('[data-repeat-row]').last();
  const blockKey = await row.locator('input[name="block_key[]"]').inputValue();
  const uploadName = await row.locator('input[type="file"]').getAttribute('name');

  expect(blockKey).toBeTruthy();
  expect(uploadName).toBe(`upload.${blockKey}`);
});
