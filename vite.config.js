import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * SSL terminé par le serveur intermédiaire (zerux.com) → tunnel → nginx ici → Vite :7598.
 * HMR activé : browser → wss://zeruxcom-ds.zerux.com:443 → nginx intermédiaire (WebSocket upgrade)
 * → nginx local (WebSocket upgrade) → Vite :7598.
 * Les deux nginx doivent transmettre Upgrade + Connection "upgrade".
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const publicHost = env.VITE_HMR_CLIENT_HOST || 'zeruxcom-ds.zerux.com'

  return {
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
      allowedHosts: ['zeruxcom-ds.zerux.com', 'zeruxcom.xavdp.pro', 'devis.zerux.com'],
      origin: `https://${publicHost}`,
      hmr: {
        host: publicHost,
        protocol: 'wss',
        clientPort: 443,
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:7608',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://127.0.0.1:7608',
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 7598,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:7608',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://127.0.0.1:7608',
          changeOrigin: true,
        },
      },
    },
  }
})
