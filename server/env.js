/**
 * Load project .env before any other server module that reads process.env (e.g. db pool).
 * In ESM, static imports run before the rest of the entry file — importing this first
 * ensures DB_USER / DB_NAME / paths are set when db/index.js is evaluated.
 */
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '../.env') })
