import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8792);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 2_400_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalTeardown: './tests/e2e/teardown.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Production build served by workerd (vite preview), with the test
        // Wrangler config (fast timers). Isolated from source edits / HMR.
        command: `npx vite build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
        env: { WRANGLER_CONFIG: 'tests/wrangler.test.jsonc', PERSIST_DIR: '.wrangler/state-e2e' },
        url: `http://127.0.0.1:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 240_000,
      },
});
