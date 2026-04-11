/**
 * PM2 — DEVELOPMENT: Vite dev server (HMR) + API with --watch
 *
 * Stops production apps first (same ports 7598 / 7608):
 *   npm run pm2:switch:dev
 *
 * Back to production (preview + built assets):
 *   npm run pm2:switch:prod
 */
const fs = require('fs')
const path = require('path')
const root = __dirname
fs.mkdirSync(path.join(root, 'tmp', 'logs'), { recursive: true })

module.exports = {
  apps: [
    {
      name: 'zeruxcomm-api-dev',
      cwd: root,
      script: 'server/index.js',
      interpreter: 'node',
      watch: true,
      ignore_watch: ['node_modules', 'dist', 'tmp', 'logs', '*.log'],
      env: { NODE_ENV: 'development', PORT: 7608 },
      error_file: path.join(root, 'tmp/logs/pm2-api-dev-error.log'),
      out_file: path.join(root, 'tmp/logs/pm2-api-dev-out.log'),
      merge_logs: true,
      autorestart: true,
      max_restarts: 30,
      min_uptime: '5s',
    },
    {
      name: 'zeruxcomm-vite-dev',
      cwd: root,
      script: 'node_modules/vite/bin/vite.js',
      args: '--host 127.0.0.1 --port 7598 --strictPort',
      interpreter: 'node',
      env: { NODE_ENV: 'development' },
      error_file: path.join(root, 'tmp/logs/pm2-vite-dev-error.log'),
      out_file: path.join(root, 'tmp/logs/pm2-vite-dev-out.log'),
      merge_logs: true,
      autorestart: true,
      max_restarts: 30,
      min_uptime: '3s',
    },
  ],
}
