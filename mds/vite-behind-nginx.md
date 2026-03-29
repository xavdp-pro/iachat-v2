# Vite behind Nginx (iachat-v2.pulse7.ooo.ovh)

Nginx proxies `https://iachat-v2.pulse7.ooo.ovh` → `http://127.0.0.1:7598`.

## Run Vite

```bash
cd /apps/iachat-v2/app
npm run dev
```

Ensure `package.json` dev script uses port **7598** and binds **127.0.0.1** (not only `localhost` if IPv6 issues):

```json
"vite --host 127.0.0.1 --port 7598"
```

## `vite.config.js` (HMR over WSS)

When the site is served as HTTPS but Vite is HTTP locally, set HMR explicitly:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 7598,
    strictPort: true,
    allowedHosts: ['iachat-v2.pulse7.ooo.ovh'],
    hmr: {
      protocol: 'wss',
      host: 'iachat-v2.pulse7.ooo.ovh',
      clientPort: 443,
    },
  },
})
```

Adjust `allowedHosts` / `hmr.host` if the public hostname changes.

## Production note: 502 Bad Gateway

Nginx returns **502** if nothing listens on **7598**. Either run `npm run dev` manually or use the host **systemd** unit:

```bash
sudo systemctl enable --now iachat-v2.service
sudo systemctl status iachat-v2.service
```

Unit file: `/etc/systemd/system/iachat-v2.service` (user `iachat-v2`, `WorkingDirectory=/apps/iachat-v2/app`).

Ensure the app tree is owned by `iachat-v2` so Vite can write `node_modules/.vite/`:

```bash
sudo chown -R iachat-v2:www-data /apps/iachat-v2/app
```
