import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // WRANGLER_CONFIG lets the test suite run the Worker with fast timers.
    // PERSIST_DIR isolates local Durable Object storage per test suite.
    cloudflare({
      configPath: process.env.WRANGLER_CONFIG ?? 'wrangler.jsonc',
      persistState: process.env.PERSIST_DIR ? { path: process.env.PERSIST_DIR } : true,
    }),
  ],
  // Test builds (WRANGLER_CONFIG set) go to a separate folder so they can never be deployed by accident.
  ...(process.env.WRANGLER_CONFIG
    ? {
        environments: {
          client: { build: { outDir: 'dist-test/client' } },
          nasi_lemak_online_test: { build: { outDir: 'dist-test/worker' } },
        },
      }
    : {}),
  build: {
    chunkSizeWarningLimit: 900,
  },
});
