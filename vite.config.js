import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '127.0.0.1',
    port: 7598,
    strictPort: true,
    allowedHosts: ['iachat-v2.pulse7.ooo.ovh', 'localhost'],
    hmr: {
      host: 'iachat-v2.pulse7.ooo.ovh',
      protocol: 'wss',
      clientPort: 443,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7608',
        changeOrigin: true,
      },
    },
  },
})
