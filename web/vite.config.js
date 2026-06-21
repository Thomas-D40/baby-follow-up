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
})
