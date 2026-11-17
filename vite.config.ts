import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    proxy: { '/api': { target: 'http://127.0.0.1:5178', changeOrigin: true } },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500, sourcemap: false },
});
