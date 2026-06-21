import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The front is served statically by Caddy in prod (no runtime).
// In dev, proxy /api and /q to Quarkus (port 8080).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/q': 'http://localhost:8080',
    },
  },
  // Vitest (Épic 2, D2-A): jsdom + Testing-Library. e2e is Playwright, excluded here.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    exclude: ['node_modules', 'e2e', 'dist'],
  },
})
