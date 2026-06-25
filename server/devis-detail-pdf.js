import { renderDevisPdfBuffer } from './devis-pdf.js'
import { extractGridMeta } from './lib/gridRowMeta.js'
import {
  isFixedFrameLine,
  mergeDetailSheetPages,
  renderDetailSheetOverlay,
  repLetter,
} from './lib/detail-sheet-overlay.js'

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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

function field(value, fallback = '—') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function parseRawJson(value) {
  const parsed = parseJson(value, null)
  if (Array.isArray(parsed)) {
    return { cells: parsed, meta: extractGridMeta(parsed) }
  }
  if (parsed && typeof parsed === 'object') {
    return { cells: [], meta: parsed }
  }
  return { cells: [], meta: {} }
}

function affairLabel(devis) {
  const analysis = parseJson(devis?.analysis_json, {}) || {}
  return field(analysis.affaire || analysis.project_name || devis?.name || devis?.client_name, '—')
}

function chassisDetailSheetHtml(line, index, devis) {
  const rep = repLetter(index)
  const { meta } = parseRawJson(line.raw_json)
  const h = Number(line.hauteur_mm || line.hauteur)
  const l = Number(line.largeur_mm || line.largeur)
  const thermo = /thermolaquage|RAL/i.test(String(line.designation || ''))
    ? (String(line.designation || '').match(/teinte RAL[^,\n]*/i)?.[0] || 'Teinte RAL au choix')
    : field(meta?.thermolaquage || meta?.teinte, 'Teinte RAL au choix')

  return `
    <section class="sheet chassis-sheet">
      <header class="sheet-header">
        <div>
          <div class="sheet-title">Fiche de détail - Châssis fixe Nexus</div>
          <div class="sheet-ref">FICHE Y15 — MODÈLE PROVISOIRE (PDF Armand en attente — F2)</div>
        </div>
        <div class="sheet-quote">
          <div><span class="lbl">Devis</span> ${escapeHtml(field(devis.quote_number || devis.name || devis.id))}</div>
          <div><span class="lbl">Client</span> ${escapeHtml(field(devis.client_name))}</div>
        </div>
      </header>
      <div class="meta-grid">
        <div class="meta-box"><span class="lbl">Affaire</span><div class="val">${escapeHtml(affairLabel(devis))}</div></div>
        <div class="meta-box"><span class="lbl">Repère devis</span><div class="val strong">${escapeHtml(rep)}</div></div>
        <div class="meta-box"><span class="lbl">Localisation</span><div class="val">${escapeHtml(field(line.localisation || meta?.localisation))}</div></div>
      </div>
      <div class="dims-grid">
        <div class="dims-col">
          <div class="section-title">Dimensions baie (HT × L)</div>
          <div class="dims-card">
            <div class="dims-row"><span>Largeur hors-tout</span><strong>${Number.isFinite(l) ? `${l} mm` : '—'}</strong></div>
            <div class="dims-row"><span>Hauteur hors-tout</span><strong>${Number.isFinite(h) ? `${h} mm` : '—'}</strong></div>
          </div>
        </div>
        <div class="dims-col">
          <div class="section-title">Teinte</div>
          <div class="dims-card"><div class="info-value">${escapeHtml(thermo)}</div></div>
        </div>
      </div>
      <footer class="sheet-footer">
        <div>En complément de l'offre n° <strong>${escapeHtml(field(devis.quote_number || devis.name || devis.id))}</strong></div>
      </footer>
    </section>
  `
}

const CHASSIS_DETAIL_CSS = `
  @page { size: A4; margin: 12mm 10mm 14mm; }
  body { margin: 0; font-family: Montserrat, Arial, sans-serif; color: #3c4b4d; font-size: 9.5pt; }
  .sheet { page-break-after: always; min-height: 255mm; display: flex; flex-direction: column; gap: 12px; }
  .sheet-header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #3c4b4d; padding-bottom: 8px; }
  .sheet-title { font-size: 13pt; font-weight: 800; text-transform: uppercase; }
  .lbl { color: #7a8689; font-weight: 700; margin-right: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1.2fr .8fr 1fr; gap: 10px; }
  .meta-box { border: 1px solid #d5dcde; border-radius: 6px; padding: 8px 10px; }
  .dims-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .dims-card { border: 1px solid #d5dcde; border-radius: 6px; padding: 10px; }
  .dims-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #e3e8ea; }
  .section-title { font-size: 8pt; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
  .sheet-footer { margin-top: auto; border-top: 1px solid #d5dcde; padding-top: 10px; font-size: 8.5pt; }
`

async function buildChassisSheetsPdf(chassisLines, devis) {
  if (!chassisLines.length) return null
  const body = chassisLines.map((line, index) => chassisDetailSheetHtml(line, index, devis)).join('\n')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CHASSIS_DETAIL_CSS}</style></head><body>${body}</body></html>`
  return renderDevisPdfBuffer(html, { offerNumber: `${devis.quote_number || devis.id}-detail-chassis` })
}

export async function buildDetailSheetsPdf({ devis, lines = [] }) {
  const productLines = lines.filter(l => (l.line_section || 'products') === 'products')
  const doorLines = productLines.filter(line => !isFixedFrameLine(line))
  const chassisLines = productLines.filter(line => isFixedFrameLine(line))

  const overlayPages = []
  for (const [index, line] of doorLines.entries()) {
    const bytes = await renderDetailSheetOverlay({ devis, line, index })
    overlayPages.push(bytes)
  }

  const buffers = []
  if (overlayPages.length) {
    buffers.push(Buffer.from(await mergeDetailSheetPages(overlayPages)))
  }
  if (chassisLines.length) {
    const chassisBuf = await buildChassisSheetsPdf(chassisLines, devis)
    if (chassisBuf) buffers.push(chassisBuf)
  }

  if (!buffers.length) {
    const empty = await renderDevisPdfBuffer('<html><body><p>Aucune fiche à produire</p></body></html>', { offerNumber: 'detail-empty' })
    return { buffer: empty, filename: `fiches-detail-${devis.quote_number || devis.id}.pdf` }
  }

  if (buffers.length === 1) {
    return { buffer: buffers[0], filename: `fiches-detail-${devis.quote_number || devis.id}.pdf` }
  }

  const { PDFDocument } = await import('pdf-lib')
  const merged = await PDFDocument.create()
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf)
    const copied = await merged.copyPages(src, src.getPageIndices())
    copied.forEach(page => merged.addPage(page))
  }
  const buffer = Buffer.from(await merged.save())
  return { buffer, filename: `fiches-detail-${devis.quote_number || devis.id}.pdf` }
}
