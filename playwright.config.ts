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
        // Production Node build, isolated test state and shortened timers.
        command: `npm run build && node dist/server/index.mjs --port ${PORT}`,
        env: { FAST_TIMERS: '1', ROOM_STORE_PATH: '.room-data/e2e', HOST: '127.0.0.1' },
        url: `http://127.0.0.1:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 240_000,
      },
});
