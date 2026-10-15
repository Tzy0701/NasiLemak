import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8792);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 2_400_000,
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
        // Built frontend on the actual local Workers/SQLite DO runtime.
        command: `npm run build && wrangler dev --config tests/wrangler.test.jsonc --local --port ${PORT} --persist-to .wrangler/e2e-${PORT}`,
        url: `http://127.0.0.1:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 240_000,
      },
});
