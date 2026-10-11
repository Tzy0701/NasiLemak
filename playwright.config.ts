import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8792);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 900_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx vite dev --port ${PORT} --strictPort --host 127.0.0.1`,
        env: { WRANGLER_CONFIG: 'tests/wrangler.test.jsonc' },
        url: `http://127.0.0.1:${PORT}/api/health`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
