#!/usr/bin/env node
/**
 * Sync PDF samples into public/validation/samples/ for Armand downloads.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const samplesDir = join(root, 'public', 'validation', 'samples')
const refSrc = resolve(root, '../ressources/XLSX/2606/NEW/605.0106 - The Hive.pdf')
const refDst = join(samplesDir, 'hive-reference-605.0106.pdf')
const hiveGenDst = join(samplesDir, 'hive-the-hive-sample.pdf')
const detailDst = join(samplesDir, 'fiches-detail-echantillon-1v-2v.pdf')

mkdirSync(samplesDir, { recursive: true })

if (existsSync(refSrc)) {
  copyFileSync(refSrc, refDst)
  console.log(`✓ ${refDst}`)
} else {
  console.warn(`⚠ Missing reference: ${refSrc}`)
}

if (!existsSync(hiveGenDst)) {
  const r = spawnSync('node', ['scripts/sync-hive-preview.mjs'], { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status || 1)
} else {
  console.log(`✓ ${hiveGenDst} (already present)`)
}

if (!existsSync(detailDst)) {
  const r = spawnSync('node', ['scripts/render-detail-sample-pdf.mjs', detailDst], { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status || 1)
} else {
  console.log(`✓ ${detailDst} (already present)`)
}

console.log('Validation samples ready → public/validation/samples/')
