/**
 * Burn dynamic fields on Armand's official detail sheet PDF templates (B3/F1).
 * Coordinates from pdftotext -bbox on `Fiche de détail 1 vantail.pdf` / `2 vantaux.pdf` (A4 595×842 pt).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PAGE_H = 841.89
const TEMPLATE_DIR = path.resolve(__dirname, '../../../ressources/XLSX/2606/NEW')
const TEMPLATE_2V = path.join(TEMPLATE_DIR, 'Fiche de détail 2 vantaux.pdf')
const TEMPLATE_1V = path.join(TEMPLATE_DIR, 'Fiche de détail 1 vantail.pdf')
const FONT_REGULAR = path.resolve(__dirname, '../../../ressources/260625/Montserrat-Regular.ttf')
const FONT_SEMIBOLD = path.resolve(__dirname, '../../../ressources/260625/Montserrat-SemiBold.ttf')

/** PDF origin is bottom-left; bbox from pdftotext is top-down. */
function yFromTop(top) {
  return PAGE_H - top
}

function field(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function parseJson(value, fallback) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function repLetter(index) {
  let n = index + 1
  let label = ''
  while (n > 0) {
    n -= 1
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26)
  }
  return label
}

function isTwoLeafLine(line = {}) {
  const text = [line.type_porte, line.type, line.designation, line.vantail].filter(Boolean).join(' ').toUpperCase()
  return /\b2\s*V\b|2\s*VANTAUX|DEUX\s+VANTAUX/u.test(text)
}

function isFixedFrameLine(line = {}) {
  return /ch[aâ]ssis|fixe/i.test([line.type_porte, line.designation, line.gamme].filter(Boolean).join(' '))
}

function dimensions(line) {
  const h = Number(line.hauteur_mm || line.hauteur || line.height_mm)
  const l = Number(line.largeur_mm || line.largeur || line.width_mm)
  return {
    h: Number.isFinite(h) ? h : null,
    l: Number.isFinite(l) ? l : null,
  }
}

function lineDetailMeta(line = {}) {
  const meta = parseJson(line.raw_json, {}) || {}
  const cells = Array.isArray(meta) ? meta : []
  const metaObj = Array.isArray(meta) ? {} : meta
  const text = [
    line.designation,
    line.localisation,
    metaObj.opening_sense,
    metaObj.sens_ouverture,
    metaObj.sens,
    metaObj.notes,
    ...cells.filter(item => typeof item === 'string'),
  ].filter(Boolean).join('\n')

  const openingFromRaw = String(metaObj.opening_sense || metaObj.sens_ouverture || metaObj.sens || '').trim().toUpperCase()
  let openingSense = null
  if (/^SENS\s+[ABCD]$/.test(openingFromRaw)) openingSense = openingFromRaw.replace(/^SENS\s+/, '')
  else if (/^[ABCD]$/.test(openingFromRaw)) openingSense = openingFromRaw
  else {
    const match = text.match(/\bsens\s+([ABCD])\b/i)
    if (match) openingSense = match[1].toUpperCase()
  }

  const seuilRaw = String(metaObj.barre_seuil || metaObj.seuil || metaObj.threshold || '').toLowerCase()
  let withThreshold = null
  if (/sans/.test(seuilRaw) && /barre|seuil/.test(seuilRaw)) withThreshold = false
  else if (/avec/.test(seuilRaw) && /barre|seuil/.test(seuilRaw)) withThreshold = true
  else if (/\bsans\s+barre/i.test(text)) withThreshold = false
  else if (/\bavec\s+barre/i.test(text)) withThreshold = true

  let weatherExposed = null
  if (metaObj.exposition_intemperies === true || metaObj.weather_exposed === true) weatherExposed = true
  if (metaObj.exposition_intemperies === false || metaObj.weather_exposed === false) weatherExposed = false
  if (weatherExposed == null) {
    if (/\bexpos[ée].*intemp[ée]ries.*\bou?i\b/i.test(text)) weatherExposed = true
    if (/\bexpos[ée].*intemp[ée]ries.*\bnon\b/i.test(text)) weatherExposed = false
  }

  return { openingSense, withThreshold, weatherExposed, meta: metaObj }
}

function affairLabel(devis) {
  const analysis = parseJson(devis?.analysis_json, {}) || {}
  return field(analysis.affaire || analysis.project_name || devis?.name || devis?.client_name)
}

function thermoLabel(line, meta) {
  if (/thermolaquage|RAL/i.test(String(line.designation || ''))) {
    return String(line.designation || '').match(/teinte RAL[^,\n]*/i)?.[0] || 'Teinte RAL au choix'
  }
  return field(meta?.thermolaquage || meta?.teinte, 'Teinte RAL au choix')
}

function productSummary(line) {
  return field(
    [line.type_porte, line.gamme].filter(Boolean).join(' — ')
      || line.designation?.split('\n')[0]
      || line.gamme,
  )
}

function wrapText(text, maxChars = 52) {
  const words = String(text || '').split(/\s+/)
  const rows = []
  let row = ''
  for (const word of words) {
    const next = row ? `${row} ${word}` : word
    if (next.length > maxChars && row) {
      rows.push(row)
      row = word
    } else {
      row = next
    }
  }
  if (row) rows.push(row)
  return rows
}

async function loadFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit)
  const regularBytes = fs.readFileSync(FONT_REGULAR)
  const semiBytes = fs.readFileSync(FONT_SEMIBOLD)
  const regular = await pdfDoc.embedFont(regularBytes, { subset: true })
  const semi = await pdfDoc.embedFont(semiBytes, { subset: true })
  return { regular, semi }
}

function drawMark(page, x, y, font, size = 10) {
  page.drawText('X', { x, y, size, font, color: rgb(0.12, 0.28, 0.14) })
}

function drawTextLine(page, text, x, top, font, size = 9, maxWidth = 260) {
  const rows = wrapText(text, Math.floor(maxWidth / (size * 0.48)))
  let y = yFromTop(top)
  for (const row of rows) {
    page.drawText(row, { x, y, size, font, color: rgb(0.18, 0.24, 0.26), maxWidth })
    y -= size + 2
  }
  return y
}

function resolveDetailTemplate(twoLeaf) {
  if (twoLeaf) {
    if (!fs.existsSync(TEMPLATE_2V)) throw new Error(`Missing detail sheet template: ${TEMPLATE_2V}`)
    return { path: TEMPLATE_2V, adaptedFrom2V: false, twoLeaf: true }
  }
  if (!fs.existsSync(TEMPLATE_1V)) {
    throw new Error(`Missing detail sheet template: ${TEMPLATE_1V}`)
  }
  return { path: TEMPLATE_1V, adaptedFrom2V: false, twoLeaf: false }
}

const OPENING_MARKS_1V = {
  A: { x: 50, top: 536 },
  B: { x: 158, top: 536 },
  C: { x: 50, top: 608 },
  D: { x: 158, top: 608 },
}

const OPENING_MARKS_2V = {
  A: { x: 44, top: 536 },
  B: { x: 164, top: 536 },
  C: { x: 44, top: 608 },
  D: { x: 164, top: 608 },
}

/** Field tops (y from page top, pt) — 1V layout differs slightly on width row. */
const FIELD_LAYOUT = {
  '1v': { widthTop: 292, heightTop: 358, widthX: 240, heightX: 420 },
  '2v': { widthTop: 304, heightTop: 358, widthX: 240, heightX: 420, equalLeafMarkTop: 248, equalLeafMarkX: 268 },
}

/**
 * @param {{ devis: object, line: object, index: number }} input
 * @returns {Promise<Uint8Array>} single-page PDF bytes
 */
export async function renderDetailSheetOverlay({ devis, line, index }) {
  const twoLeaf = isTwoLeafLine(line)
  const { path: templatePath, twoLeaf: is2vTemplate } = resolveDetailTemplate(twoLeaf)
  const layout = FIELD_LAYOUT[is2vTemplate ? '2v' : '1v']
  const openingMarks = is2vTemplate ? OPENING_MARKS_2V : OPENING_MARKS_1V
  const dims = dimensions(line)
  const detailMeta = lineDetailMeta(line)
  const rep = repLetter(index)

  const templateBytes = fs.readFileSync(templatePath)
  const pdfDoc = await PDFDocument.load(templateBytes)
  const { regular, semi } = await loadFonts(pdfDoc)
  const page = pdfDoc.getPages()[0]

  const textFont = regular
  const boldFont = semi

  drawTextLine(page, affairLabel(devis), 118, 118, textFont, 9, 250)
  drawTextLine(page, rep, 478, 128, boldFont, 10, 80)
  drawTextLine(page, field(line.localisation || detailMeta.meta?.localisation), 118, 136, textFont, 9, 250)

  const summary = productSummary(line)
  if (summary) drawTextLine(page, summary, 118, 152, textFont, 8, 250)

  if (dims.l != null) drawTextLine(page, `${dims.l} mm`, layout.widthX, layout.widthTop, boldFont, 9, 100)
  if (dims.h != null) drawTextLine(page, `${dims.h} mm`, layout.heightX, layout.heightTop, boldFont, 9, 100)

  if (twoLeaf && dims.l != null && layout.equalLeafMarkX != null) {
    drawMark(page, layout.equalLeafMarkX, yFromTop(layout.equalLeafMarkTop), boldFont)
  }

  drawTextLine(page, thermoLabel(line, detailMeta.meta), 90, 384, textFont, 9, 170)

  const sense = detailMeta.openingSense
  if (sense && openingMarks[sense]) {
    const mark = openingMarks[sense]
    drawMark(page, mark.x, yFromTop(mark.top), boldFont)
  }

  if (detailMeta.withThreshold === true) drawMark(page, 392, yFromTop(508), boldFont)
  if (detailMeta.withThreshold === false) drawMark(page, 472, yFromTop(508), boldFont)
  if (detailMeta.weatherExposed === true) drawMark(page, 488, yFromTop(631), boldFont)
  if (detailMeta.weatherExposed === false) drawMark(page, 488, yFromTop(649), boldFont)

  const offerNo = field(devis.quote_number || devis.name || devis.id)
  page.drawText(offerNo, { x: 196, y: yFromTop(706), size: 9, font: boldFont, color: rgb(0.18, 0.24, 0.26) })

  return pdfDoc.save()
}

export async function mergeDetailSheetPages(pageBuffers = []) {
  const merged = await PDFDocument.create()
  for (const bytes of pageBuffers) {
    const src = await PDFDocument.load(bytes)
    const [copied] = await merged.copyPages(src, [0])
    merged.addPage(copied)
  }
  return merged.save()
}

export { isFixedFrameLine, isTwoLeafLine, repLetter, TEMPLATE_1V, TEMPLATE_2V }
