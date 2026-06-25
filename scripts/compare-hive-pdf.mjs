#!/usr/bin/env node
/**
 * Compare reference vs generated Hive PDF — export JPG page 1 + Y-position report.
 * Usage: node scripts/compare-hive-pdf.mjs
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const previewDir = join(root, 'public', 'preview')
const refPdf = join(previewDir, 'reference-the-hive.pdf')
const genPdf = join(previewDir, 'hive-sample.pdf')
const outDir = join(previewDir, 'compare')

const MARKERS = ['livraison', 'Devis', 'facturation', 'Date', 'Rép.', 'Désignation']

mkdirSync(outDir, { recursive: true })

function pdftoppmJpg(pdf, outBase) {
  return spawnSync(
    'pdftoppm',
    ['-jpeg', '-jpegopt', 'quality=92', '-f', '1', '-l', '1', '-singlefile', '-r', '200', pdf, outBase],
    { stdio: 'inherit' },
  ).status === 0
}

function wordPositions(pdfPath) {
  const r = spawnSync('pdftotext', ['-bbox-layout', pdfPath, '-'], { encoding: 'utf8' })
  if (r.status !== 0) return {}
  const out = {}
  const re = /yMin="([0-9.]+)"[^>]*>([^<]+)</g
  let m
  while ((m = re.exec(r.stdout)) !== null) {
    const yMin = parseFloat(m[1])
    const text = m[2].trim()
    for (const key of MARKERS) {
      if (text.includes(key) && out[key] == null) out[key] = yMin
    }
  }
  return out
}

if (!existsSync(refPdf) || !existsSync(genPdf)) {
  console.error('Missing PDF — run: npm run test:hive-pdf')
  process.exit(1)
}

console.log('Export JPG page 1…')
pdftoppmJpg(refPdf, join(outDir, 'ref-page1'))
pdftoppmJpg(genPdf, join(outDir, 'gen-page1'))
console.log(`→ ${outDir}/ref-page1.jpg`)
console.log(`→ ${outDir}/gen-page1.jpg`)

const ref = wordPositions(refPdf)
const gen = wordPositions(genPdf)
console.log('\nY positions (PDF coords):')
console.log('Marker'.padEnd(14), 'Ref'.padStart(8), 'Gen'.padStart(8), 'Δ'.padStart(8))
let maxDelta = 0
for (const key of MARKERS) {
  const rv = ref[key]
  const gv = gen[key]
  const d = rv != null && gv != null ? gv - rv : null
  if (d != null) maxDelta = Math.max(maxDelta, Math.abs(d))
  console.log(
    key.padEnd(14),
    (rv?.toFixed(1) ?? '—').padStart(8),
    (gv?.toFixed(1) ?? '—').padStart(8),
    (d != null ? d.toFixed(1) : '—').padStart(8),
  )
}
console.log(`\nMax |Δ| = ${maxDelta.toFixed(1)} pt (target < 8)`)
if (maxDelta >= 8) process.exit(2)
