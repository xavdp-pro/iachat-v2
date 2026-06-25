#!/usr/bin/env node
/**
 * Measure Hive PDF layout: table header height and designation paragraph gaps.
 * Usage: node scripts/measure-hive-pdf.mjs [refPdf] [genPdf]
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const previewDir = join(__dirname, '..', 'public', 'preview')
const refPdf = process.argv[2] || join(previewDir, 'reference-the-hive.pdf')
const genPdf = process.argv[3] || join(previewDir, 'hive-sample.pdf')

const NS = 'http://www.w3.org/1999/xhtml'

function loadWords(pdfPath) {
  const r = spawnSync('pdftotext', ['-bbox-layout', pdfPath, '-'], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`pdftotext failed: ${pdfPath}`)
  const pages = [...r.stdout.matchAll(/<page[^>]*>([\s\S]*?)<\/page>/g)].map((m) => m[1])
  const words = []
  for (let page = 0; page < pages.length; page++) {
    const re = /xMin="([^"]+)"[^>]*yMin="([^"]+)"[^>]*yMax="([^"]+)"[^>]*>([^<]*)</g
    let m
    while ((m = re.exec(pages[page])) !== null) {
      const text = m[4].trim()
      if (!text) continue
      words.push({
        page: page + 1,
        text,
        xMin: parseFloat(m[1]),
        yMin: parseFloat(m[2]),
        yMax: parseFloat(m[3]),
      })
    }
  }
  return words
}

function pageWords(words, page) {
  return words.filter((w) => w.page === page)
}

function theadHeight(words, page) {
  const ws = pageWords(words, page)
  const rep = ws.find((w) => w.text === 'Rép.')
  if (!rep) return null
  const row = ws.filter((w) => Math.abs(w.yMin - rep.yMin) < 2)
  const yMin = Math.min(...row.map((w) => w.yMin))
  const yMax = Math.max(...row.map((w) => w.yMax))
  const data = ws
    .filter((w) => w.xMin < 80 && w.text.length === 1 && w.text.match(/^[A-Z]$/) && w.yMin > yMax)
    .sort((a, b) => a.yMin - b.yMin)[0]
  return {
    textHeight: yMax - yMin,
    gapToFirstRow: data ? data.yMin - yMax : null,
  }
}

function localisationToTitleGap(words, page) {
  const ws = pageWords(words, page)
  const locs = ws.filter((w) => w.text === 'Localisation')
  const titles = ws.filter((w) => w.text.startsWith('BLOC-PORTE'))
  const gaps = []
  for (const loc of locs) {
    const line = ws.filter((w) => Math.abs(w.yMin - loc.yMin) < 3)
    const yMax = Math.max(...line.map((w) => w.yMax))
    const next = titles.filter((t) => t.yMin > yMax).sort((a, b) => a.yMin - b.yMin)[0]
    if (next) gaps.push(next.yMin - yMax)
  }
  return gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null
}

function titleToBodyGap(words, page) {
  const ws = pageWords(words, page)
  const title = ws.find((w) => w.text.startsWith('BLOC-PORTE'))
  if (!title) return null
  const body = ws.filter((w) => w.yMin > title.yMax && w.xMin > 100).sort((a, b) => a.yMin - b.yMin)[0]
  return body ? body.yMin - title.yMax : null
}

function lastPageMetrics(words) {
  const lastPage = Math.max(...words.map((w) => w.page))
  const ws = pageWords(words, lastPage)
  const nota = ws.find((w) => w.text === 'NOTA')
  const totalHt = ws.filter((w) => w.text === 'Total' && w.yMin > 500).sort((a, b) => a.yMin - b.yMin)[0]
  const footer = ws.find((w) => w.text === 'Zerux' || w.text.startsWith('Zerux'))
  const pageNo = ws.find((w) => w.text === 'Page')
  const notaEnd = nota
    ? Math.max(...ws.filter((w) => Math.abs(w.yMin - nota.yMin) < 4).map((w) => w.yMax))
    : null
  return {
    lastPage,
    notaToTotalGap: notaEnd != null && totalHt ? totalHt.yMin - notaEnd : null,
    footerPresent: Boolean(footer),
    footerY: footer?.yMin ?? pageNo?.yMin ?? null,
  }
}

function headerToTableGap(words) {
  const ws = pageWords(words, 1)
  const rep = ws.find((w) => w.text === 'Rép.')
  if (!rep) return null
  const headerWords = ws.filter((w) => w.yMax < rep.yMin - 5)
  if (!headerWords.length) return null
  const bottom = Math.max(...headerWords.map((w) => w.yMax))
  return rep.yMin - bottom
}

function measurePdf(label, pdfPath) {
  const words = loadWords(pdfPath)
  return {
    label,
    page1Thead: theadHeight(words, 1),
    page2Thead: theadHeight(words, 2),
    locToTitleP2: localisationToTitleGap(words, 2),
    titleToBodyP1: titleToBodyGap(words, 1),
    headerToTableP1: headerToTableGap(words),
    lastPage: lastPageMetrics(words),
  }
}

function fmt(v, suffix = 'pt') {
  return v == null ? '—' : `${v.toFixed(1)}${suffix}`
}

function delta(ref, gen) {
  return ref != null && gen != null ? gen - ref : null
}

if (!existsSync(refPdf) || !existsSync(genPdf)) {
  console.error('Missing PDF — run: npm run test:hive-pdf')
  process.exit(1)
}

const ref = measurePdf('REF', refPdf)
const gen = measurePdf('GEN', genPdf)

console.log('Hive PDF layout metrics (pdftotext -bbox-layout)\n')
console.log('Metric'.padEnd(28), 'Ref'.padStart(10), 'Gen'.padStart(10), 'Δ'.padStart(10))
console.log('-'.repeat(60))

const rows = [
  ['Page 1 thead height', ref.page1Thead?.textHeight, gen.page1Thead?.textHeight],
  ['Page 1 thead→data gap', ref.page1Thead?.gapToFirstRow, gen.page1Thead?.gapToFirstRow],
  ['Page 2 thead height', ref.page2Thead?.textHeight, gen.page2Thead?.textHeight],
  ['Page 2 Localisation→title', ref.locToTitleP2, gen.locToTitleP2],
  ['Page 1 title→body gap', ref.titleToBodyP1, gen.titleToBodyP1],
  ['Page 1 header→table gap', ref.headerToTableP1, gen.headerToTableP1],
  ['Last page NOTA→Total HT', ref.lastPage.notaToTotalGap, gen.lastPage.notaToTotalGap],
  ['Last page footer Y', ref.lastPage.footerY, gen.lastPage.footerY],
]

let maxAbs = 0
for (const [name, rv, gv] of rows) {
  const d = delta(rv, gv)
  if (d != null) maxAbs = Math.max(maxAbs, Math.abs(d))
  console.log(name.padEnd(28), fmt(rv).padStart(10), fmt(gv).padStart(10), fmt(d).padStart(10))
}

console.log(`\nMax |Δ| = ${maxAbs.toFixed(1)} pt`)
console.log(`\nFooter text present: ref=${ref.lastPage.footerPresent ? 'yes' : 'no'}, gen=${gen.lastPage.footerPresent ? 'yes' : 'no'}`)
console.log('\nTargets: thead ~12 pt, Localisation→title ~11 pt, NOTA→Total ~50 pt, footer legal lines visible')
