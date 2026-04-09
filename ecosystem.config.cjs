/**
 * PM2: keep API (7608) + Vite preview (7598) alive with auto-restart.
 * Usage (after npm ci && npm run build):
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
const fs = require('fs')
const path = require('path')
const root = __dirname
fs.mkdirSync(path.join(root, 'tmp', 'logs'), { recursive: true })

module.exports = {
  apps: [
    {
      name: 'zeruxcomm-api',
      cwd: root,
      script: 'server/index.js',
      interpreter: 'node',
      env: { NODE_ENV: 'production', PORT: 7608 },
      error_file: path.join(root, 'tmp/logs/pm2-api-error.log'),
      out_file: path.join(root, 'tmp/logs/pm2-api-out.log'),
      merge_logs: true,
      autorestart: true,
      max_restarts: 30,
      min_uptime: '5s',
    },
    {
      name: 'zeruxcomm-vite',
      cwd: root,
      script: 'node_modules/vite/bin/vite.js',
      args: '--host 127.0.0.1 --port 7598 --strictPort',
      interpreter: 'node',
      env: { NODE_ENV: 'development' },
      error_file: path.join(root, 'tmp/logs/pm2-vite-error.log'),
      out_file: path.join(root, 'tmp/logs/pm2-vite-out.log'),
      autorestart: true,
      max_restarts: 30,
      min_uptime: '3s',
    },
  ],
}
