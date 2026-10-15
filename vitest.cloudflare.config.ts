import { defineConfig, mergeConfig } from 'vitest/config';
import integration from './vitest.integration.config.ts';

export default mergeConfig(integration, defineConfig({
  test: {
    exclude: ['tests/integration/node-host.test.ts'],
    env: { TEST_BACKEND: 'cloudflare' },
  },
}));
