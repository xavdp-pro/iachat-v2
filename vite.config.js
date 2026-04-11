import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * SSL is terminated by the external tunnel (https://zeruxcom-ds.zerux.com:443).
 * Tunnel → nginx :443 → Vite :7598.
 * Vite proxies /api + /uploads to Express :7608.
 * HMR is disabled because WebSocket cannot traverse the SSH tunnel.
 */

// Completely neuter HMR: strip the client script tag from HTML AND
// intercept /@vite/client + @react-refresh via server middleware so the
// browser gets a harmless no-op module instead of the real WS client.
const CLIENT_STUB = `
// Minimal Vite-client shim: CSS injection works, WebSocket/HMR is a no-op.
const styles = new Map();
export function updateStyle(id, css) {
  let el = styles.get(id);
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-dev-id', id);
    el.setAttribute('type', 'text/css');
    document.head.appendChild(el);
    styles.set(id, el);
  }
  el.textContent = css;
}
export function removeStyle(id) {
  const el = styles.get(id);
  if (el) { document.head.removeChild(el); styles.delete(id); }
}
export function injectQuery(url, query) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const s = url.indexOf('?');
  return s > -1 ? url.slice(0, s) + '?' + query + '&' + url.slice(s + 1) : url + '?' + query;
}
export function createHotContext() {
  return { accept(){}, dispose(){}, prune(){}, decline(){}, invalidate(){}, on(){}, send(){}, data:{} };
}
export default {};
`

function disableHmrPlugin() {
  return {
    name: 'disable-hmr',
    enforce: 'pre',
    transformIndexHtml(html) {
      return html.replace(
        /<script[^>]*src="\/@vite\/client"[^>]*><\/script>/g,
        '<!-- hmr disabled -->',
      )
    },
    configureServer(server) {
      // Runs before Vite's internal middleware so we can intercept early
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/@vite/client') || req.url?.startsWith('/@react-refresh')) {
          res.setHeader('Content-Type', 'application/javascript')
          res.end(CLIENT_STUB)
          return
        }
        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const publicHost = env.VITE_HMR_CLIENT_HOST || 'zeruxcom-ds.zerux.com'

  return {
    plugins: [
      disableHmrPlugin(),
      react({ fastRefresh: false }),
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
      allowedHosts: true,
      origin: `https://${publicHost}`,
      hmr: false,
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
