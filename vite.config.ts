import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // A WebAuthn origin is protocol + host + port, so silently falling back to
    // :5174 (or another port) breaks passkey enrollment against APP_ORIGIN.
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  build: { outDir: 'dist' },
});
