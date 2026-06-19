import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * SSL terminé par nginx (prod: devis.zerux.com, dev possible: zeruxcom-ds.zerux.com) → Vite :7598.
 * HMR : navigateur → wss sur le même host public (port 443) → nginx → WebSocket → Vite.
 * Nginx doit transmettre Upgrade + Connection "upgrade".
 */
function resolvePublicHost(env) {
  const raw = env.VITE_DEV_PUBLIC_URL?.trim()
  if (raw) {
    try {
      const u = raw.startsWith('http') ? raw : `https://${raw}`
      return new URL(u).hostname
    } catch { /* ignore invalid URL */ }
  }
  const h = env.VITE_HMR_CLIENT_HOST?.trim()
  if (h) return h
  return 'devis.zerux.com'
}

function configureForwardedHeaders(proxy) {
  proxy.on('proxyReq', (proxyReq, req) => {
    const remoteAddress = req.socket?.remoteAddress || ''
    const forwardedFor = req.headers['x-forwarded-for'] || remoteAddress
    const realIp = req.headers['x-real-ip'] || String(forwardedFor).split(',')[0].trim()
    if (forwardedFor) proxyReq.setHeader('X-Forwarded-For', forwardedFor)
    if (realIp) proxyReq.setHeader('X-Real-IP', realIp)
    if (req.headers['x-forwarded-proto']) proxyReq.setHeader('X-Forwarded-Proto', req.headers['x-forwarded-proto'])
    if (req.headers.host) proxyReq.setHeader('X-Forwarded-Host', req.headers.host)
  })
}

const apiProxy = {
  target: 'http://127.0.0.1:7608',
  changeOrigin: true,
  xfwd: true,
  configure: configureForwardedHeaders,
}

/** Let React handle /validation — static assets stay under public/validation/*. */
function validationAssetsPlugin() {
  return {
    name: 'validation-assets-only',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (path === '/validation' || path === '/validation/') {
          req.url = '/index.html' + ((req.url || '').includes('?') ? req.url.slice(req.url.indexOf('?')) : '')
        }
        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const publicHost = resolvePublicHost(env)

  return {
    plugins: [
      react(),
      tailwindcss(),
      validationAssetsPlugin(),
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
        '/api': apiProxy,
        '/uploads': apiProxy,
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 7598,
      strictPort: true,
      proxy: {
        '/api': apiProxy,
        '/uploads': apiProxy,
      },
    },
  }
})
