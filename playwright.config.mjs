import { defineConfig } from '@playwright/test';

/**
 * 页面编辑器的真浏览器测试（草稿，待审核后由 Chief 决定是否并入 CI）。
 *
 * - 默认对着本地 `wrangler dev` 跑（Playwright 自己起服务，本地 D1 用 `npm run db:local` 灌好）
 * - 也可以设 `PW_BASE_URL` 指到别的地址，这时不启动 webServer
 * - 失败留截图与 trace，CI 里用 upload-artifact 收走
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // 这一包只跑关键路径，单文件串行，别把部署拖慢
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.PW_BASE_URL || 'http://127.0.0.1:8787',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        // 本地 D1 灌种子 + 起 wrangler dev；CI 上每次都是干净状态
        command: 'npm run db:local && npm run dev',
        url: 'http://127.0.0.1:8787',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
