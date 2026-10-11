import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // WRANGLER_CONFIG lets the test suite run the Worker with fast timers.
    cloudflare({ configPath: process.env.WRANGLER_CONFIG ?? 'wrangler.jsonc' }),
  ],
  build: {
    chunkSizeWarningLimit: 900,
  },
});
