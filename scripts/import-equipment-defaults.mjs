#!/usr/bin/env node
/**
 * Generate CR5/CR6 equipment XLSX (if needed) and import all default performances.
 */
import '../server/env.js'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  defaultImportPath,
  importEquipmentFromXlsx,
  DEFAULT_EQUIPMENT_PERFORMANCES,
  BOOTSTRAP_EQUIPMENT_PERFORMANCES,
} from '../server/services/equipment-catalog.js'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

async function ensureGenerated(performances) {
  const missing = performances.filter(perf => !existsSync(defaultImportPath(perf)))
  if (!missing.length) return
  console.log(`Generating XLSX for: ${missing.join(', ')}`)
  await execFileAsync('node', [join(__dirname, 'generate-equipment-xlsx-cr5-cr6.mjs'), ...missing], {
    cwd: join(__dirname, '..'),
  })
}

const performances = process.argv.includes('--all')
  ? DEFAULT_EQUIPMENT_PERFORMANCES
  : process.argv.slice(2).map(p => String(p).toUpperCase().replace(/^RC/, 'CR'))

if (!performances.length) {
  console.error('Usage: npm run import:equipment -- [--all | CR5 CR6 ...]')
  process.exit(1)
}

await ensureGenerated(performances.filter(perf => BOOTSTRAP_EQUIPMENT_PERFORMANCES.includes(perf)))

const results = []
for (const performance of performances) {
  try {
    results.push(await importEquipmentFromXlsx(performance, { replace: true }))
    console.log(`Imported ${performance}: ${results.at(-1).count} rows`)
  } catch (err) {
    results.push({ performance, error: err.message })
    console.error(`Failed ${performance}:`, err.message)
  }
}

const failed = results.filter(row => row.error)
process.exit(failed.length ? 1 : 0)
