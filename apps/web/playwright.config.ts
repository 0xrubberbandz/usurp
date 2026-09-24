import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://localhost:3100', headless: true, viewport: { width: 1440, height: 900 }, launchOptions: process.platform === 'win32' ? { channel: 'msedge' } : {}, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --port 3100', url: 'http://localhost:3100', reuseExistingServer: false, timeout: 180_000, env: { NEXT_PUBLIC_DEMO: '1', USURP_E2E: '1' } },
  workers: 1,
  reporter: 'list'
});
