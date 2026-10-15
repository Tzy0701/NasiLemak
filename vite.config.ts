import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/test-results*/**', '**/.wrangler/**', '**/.room-data/**'] },
    proxy: { '/api': { target: 'http://127.0.0.1:8790', ws: true } },
  },
  build: { outDir: 'dist/client', chunkSizeWarningLimit: 900 },
});
