import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Single React instance for the app + zustand / framer-motion (avoids "Invalid hook call")
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand', 'framer-motion'],
  },
  server: {
    host: '127.0.0.1',
    port: 7598,
    strictPort: true,
    allowedHosts: [
      'iachat-v2.pulse7.ooo.ovh',
      'zeruxcomm.xavdp.pro',
      'zeruxcom-ds.zerux.com',
      'localhost',
    ],
    // Public HTTPS hostname. HMR WebSocket: browser connects to wss://host:443 (Cloudflare Tunnel or orange-cloud proxy).
    // Tunnel / nginx must forward to this dev server on port 7598 (same as `port` above). If you change the port,
    // update cloudflared ingress (or nginx upstream) and restart tunnel + `npm run dev`.
    hmr: {
      host: 'zeruxcomm.xavdp.pro',
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
