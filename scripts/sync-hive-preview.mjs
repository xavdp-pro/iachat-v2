#!/usr/bin/env node
/**
 * Regenerate Hive PDF sample + preview PNGs for /preview/index.html
 * Usage: node scripts/sync-hive-preview.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const previewDir = join(root, 'public', 'preview')
const pdfOut = join(previewDir, 'hive-sample.pdf')
const refPdfSrc = resolve(root, '../ressources/XLSX/2606/NEW/605.0106 - The Hive.pdf')
const refPdfDst = join(previewDir, 'reference-the-hive.pdf')

mkdirSync(previewDir, { recursive: true })

const render = spawnSync('node', ['scripts/render-hive-sample-pdf.mjs', pdfOut], {
  cwd: root,
  stdio: 'inherit',
})
if (render.status !== 0) process.exit(render.status || 1)

const validationSample = join(root, 'public', 'validation', 'samples', 'hive-the-hive-sample.pdf')
const validationRef = join(root, 'public', 'validation', 'samples', 'hive-reference-605.0106.pdf')
mkdirSync(dirname(validationSample), { recursive: true })
copyFileSync(pdfOut, validationSample)
console.log(`Synced validation sample → ${validationSample}`)

if (existsSync(refPdfSrc)) {
  copyFileSync(refPdfSrc, refPdfDst)
  copyFileSync(refPdfSrc, validationRef)
  console.log(`Synced reference PDF → ${refPdfDst}`)
  console.log(`Synced validation reference → ${validationRef}`)
}

for (const [pdf, prefix] of [
  [pdfOut, 'hive-gen'],
  [join(previewDir, 'reference-the-hive.pdf'), 'hive-ref'],
]) {
  if (!existsSync(pdf)) continue
  for (const page of [1, 2]) {
    const out = join(previewDir, `${prefix}-${page}`)
    const r = spawnSync('pdftoppm', ['-png', '-f', String(page), '-l', String(page), '-singlefile', '-r', '200', pdf, out], {
      stdio: 'inherit',
    })
    if (r.status !== 0) {
      console.warn(`pdftoppm failed for ${pdf} page ${page} (install poppler-utils)`)
    }
  }
}

console.log(`Preview synced → ${previewDir}`)

const compare = spawnSync('node', ['scripts/compare-hive-pdf.mjs'], { cwd: root, stdio: 'inherit' })
if (compare.status === 2) {
  console.warn('Hive PDF layout drift detected — see public/preview/compare/')
}
