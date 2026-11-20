import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En desarrollo, /api se reenvía al backend de Express (puerto 3000) para evitar CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true, timeout: 0, proxyTimeout: 0 },
    },
  },
})
