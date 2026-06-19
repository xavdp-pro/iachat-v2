import { FONT_FACES_CSS, renderDevisPdfBuffer } from './devis-pdf.js'
import { extractGridMeta } from './lib/gridRowMeta.js'

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

function lineWeightKg(line = {}) {
  const weight = Number(line?.weight_kg)
  return Number.isFinite(weight) && weight > 0 ? weight : null
}

function lineDetailMeta(line = {}) {
  const { meta, cells } = parseRawJson(line.raw_json)
  const text = [
    line.designation,
    line.localisation,
    meta.opening_sense,
    meta.sens_ouverture,
    meta.sens,
    meta.notes,
    ...cells.filter(item => typeof item === 'string'),
  ].filter(Boolean).join('\n')

  const openingFromRaw = String(meta.opening_sense || meta.sens_ouverture || meta.sens || '').trim().toUpperCase()
  let openingSense = null
  if (/^SENS\s+[ABCD]$/.test(openingFromRaw)) openingSense = openingFromRaw.replace(/^SENS\s+/, '')
  else if (/^[ABCD]$/.test(openingFromRaw)) openingSense = openingFromRaw
  else {
    const match = text.match(/\bsens\s+([ABCD])\b/i)
    if (match) openingSense = match[1].toUpperCase()
  }

  const seuilRaw = String(meta.barre_seuil || meta.seuil || meta.threshold || '').toLowerCase()
  let withThreshold = null
  if (/sans/.test(seuilRaw) && /barre|seuil/.test(seuilRaw)) withThreshold = false
  else if (/avec/.test(seuilRaw) && /barre|seuil/.test(seuilRaw)) withThreshold = true
  else if (/\bsans\s+barre/i.test(text)) withThreshold = false
  else if (/\bavec\s+barre/i.test(text)) withThreshold = true

  let weatherExposed = null
  if (meta.exposition_intemperies === true || meta.weather_exposed === true) weatherExposed = true
  if (meta.exposition_intemperies === false || meta.weather_exposed === false) weatherExposed = false
  if (weatherExposed == null) {
    if (/\bexpos[ée].*intemp[ée]ries.*\bou?i\b/i.test(text)) weatherExposed = true
    if (/\bexpos[ée].*intemp[ée]ries.*\bnon\b/i.test(text)) weatherExposed = false
  }

  return { openingSense, withThreshold, weatherExposed }
}

function checkboxBox(checked) {
  const cls = checked ? 'checkbox-box checked' : 'checkbox-box'
  return `<span class="${cls}">${checked ? '✓' : ''}</span>`
}

function openingDiagram(selected, twoLeaf = true) {
  const senses = ['A', 'B', 'C', 'D']
  const hinge = {
    A: { hinge: 'M18 8 L18 52', leaf: 'M18 8 L82 30 L18 52 Z' },
    B: { hinge: 'M82 8 L82 52', leaf: 'M82 8 L18 30 L82 52 Z' },
    C: { hinge: 'M8 48 L92 48', leaf: 'M8 48 L50 12 L92 48 Z' },
    D: { hinge: 'M8 12 L92 12', leaf: 'M8 12 L50 48 L92 12 Z' },
  }
  return `<div class="opening-diagram-grid">
    ${senses.map(sense => {
      const active = selected === sense
      const cfg = hinge[sense]
      const fill = active ? '#c5d4d8' : '#e8ecee'
      const centerLeaf = twoLeaf ? '<line x1="50" y1="8" x2="50" y2="52" stroke="#9aa4a8" stroke-width="1"/>' : ''
      return `<div class="opening-diagram-cell${active ? ' active' : ''}">
        <svg viewBox="0 0 100 60" class="opening-svg" aria-hidden="true">
          <rect x="6" y="6" width="88" height="48" rx="2" fill="#f7f9fa" stroke="#cfd6d8" stroke-width="1.2"/>
          <path d="${cfg.hinge}" stroke="#3c4b4d" stroke-width="2.2" fill="none"/>
          <path d="${cfg.leaf}" fill="${fill}" stroke="#3c4b4d" stroke-width="1"/>
          ${centerLeaf}
          ${active ? '<circle cx="50" cy="54" r="3" fill="#2f7d32"/>' : ''}
        </svg>
        <div class="opening-diagram-label">Sens ${sense}</div>
      </div>`
    }).join('')}
  </div>`
}

function affairLabel(devis) {
  const analysis = parseJson(devis?.analysis_json, {}) || {}
  return field(analysis.affaire || analysis.project_name || devis?.name || devis?.client_name, '—')
}

function equipmentBulletRows(line) {
  const { meta } = parseRawJson(line.raw_json)
  const options = parseJson(line.options_json, [])
  const bullets = []

  const pushIf = (label, value) => {
    const text = String(value || '').trim()
    if (text) bullets.push([label, text])
  }

  pushIf('Serrure', line.serrure_ref || meta?.serrure_ref || meta?.serrure)
  pushIf('Béquillage', line.bequillage_ref || meta?.bequillage_ref || meta?.bequillage)
  pushIf('Ferme-porte', line.ferme_porte_ref || meta?.ferme_porte_ref || meta?.ferme_porte)
  pushIf('Sélecteur', line.selecteur_ref || meta?.selecteur_ref || meta?.selecteur)
  pushIf('Autres', line.autres_ref || meta?.autres_ref || meta?.autres)

  for (const option of Array.isArray(options) ? options : []) {
    const label = [option.ref, option.label].filter(Boolean).join(' — ')
    if (label) bullets.push(['Option', label])
  }

  const designationLines = String(line.designation || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(item => /^-\s+/.test(item) || /^Equipement fourni-posé/i.test(item))

  for (const item of designationLines) {
    bullets.push(['Désignation', item.replace(/^-\s+/, '')])
  }

  return bullets
}

function chassisFrameDiagram() {
  return `<div class="chassis-diagram" aria-hidden="true">
    <svg viewBox="0 0 120 80" class="chassis-svg">
      <rect x="8" y="8" width="104" height="64" rx="2" fill="#eef3f4" stroke="#3c4b4d" stroke-width="2"/>
      <rect x="16" y="16" width="88" height="48" rx="1" fill="#d9e8ee" stroke="#6d8a94" stroke-width="1.2"/>
      <line x1="16" y1="40" x2="104" y2="40" stroke="#9aa4a8" stroke-width="0.8" stroke-dasharray="3 2"/>
      <line x1="60" y1="16" x2="60" y2="64" stroke="#9aa4a8" stroke-width="0.8" stroke-dasharray="3 2"/>
    </svg>
    <div class="info-note">Châssis fixe vitré — cadre + remplissage (convention plafond)</div>
  </div>`
}

function chassisDetailSheetHtml(line, index, devis) {
  const rep = repLetter(index)
  const { meta } = parseRawJson(line.raw_json)
  const dims = dimensions(line)
  const equipment = equipmentBulletRows(line)
  const thermo = /thermolaquage|RAL/i.test(String(line.designation || ''))
    ? (String(line.designation || '').match(/teinte RAL[^,\n]*/i)?.[0] || 'Teinte RAL au choix')
    : field(meta?.thermolaquage || meta?.teinte, 'Teinte RAL au choix')
  const refCadre = field(meta?.ref_chassis || meta?.ref_cadre || line.ref_base || meta?.ref, '—')
  const vitrageRef = field(meta?.vitrage_ref || meta?.vitrage, '—')
  const gammeLabel = field(line.gamme || meta?.gamme, 'NEXUS')

  return `
    <section class="sheet chassis-sheet">
      <header class="sheet-header">
        <div>
          <div class="sheet-title">Fiche de détail - Châssis fixe Nexus</div>
          <div class="sheet-ref">FICHE Y15 — ÉDITION 2025 · MODÈLE PROVISOIRE (en attente PDF Armand)</div>
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
            <div class="dims-row"><span>Largeur hors-tout</span><strong>${dims.l != null ? `${dims.l} mm` : '—'}</strong></div>
            <div class="dims-row"><span>Hauteur hors-tout</span><strong>${dims.h != null ? `${dims.h} mm` : '—'}</strong></div>
            <div class="dims-note">Convention châssis : cotes plafond (fabrication). Jeu de pose à prévoir côté gros œuvre.</div>
          </div>
        </div>
        <div class="dims-col">
          <div class="section-title">Références tarif</div>
          <div class="dims-card">
            <div class="dims-row"><span>Gamme</span><strong>${escapeHtml(gammeLabel)}</strong></div>
            <div class="dims-row"><span>Réf. cadre</span><strong>${escapeHtml(refCadre)}</strong></div>
            <div class="dims-row"><span>Vitrage / remplissage</span><strong>${escapeHtml(vitrageRef)}</strong></div>
          </div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <div class="section-title">Teinte</div>
          <div class="info-value">${escapeHtml(thermo)}</div>
        </div>
        <div class="info-card">
          <div class="section-title">Schéma</div>
          ${chassisFrameDiagram()}
        </div>
      </div>

      <div class="equipment-card">
        <div class="section-title">Options &amp; compléments</div>
        ${equipment.length
          ? `<ul>${equipment.map(([, value]) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`
          : '<div class="empty">Voir désignation devis — cadre + remplissage détaillés au chiffrage.</div>'}
      </div>

      <footer class="sheet-footer">
        <div>En complément de l'offre n° <strong>${escapeHtml(field(devis.quote_number || devis.name || devis.id))}</strong></div>
        <div class="footer-line">Date : ____________________ &nbsp;&nbsp; Cachet : ____________________</div>
      </footer>
    </section>
  `
}

function detailSheetHtml(line, index, devis) {
  const rep = repLetter(index)
  const { meta } = parseRawJson(line.raw_json)
  const twoLeaf = isTwoLeafLine(line)
  const fixedFrame = isFixedFrameLine(line)
  if (fixedFrame) return chassisDetailSheetHtml(line, index, devis)
  const dims = dimensions(line)
  const equipment = equipmentBulletRows(line)
  const detailMeta = lineDetailMeta(line)
  const weightKg = lineWeightKg(line)
  const sheetTitle = twoLeaf ? 'Fiche de détail - BP Nexus 2 vantaux' : 'Fiche de détail - BP Nexus 1 vantail'
  const thermo = /thermolaquage|RAL/i.test(String(line.designation || ''))
    ? (String(line.designation || '').match(/teinte RAL[^,\n]*/i)?.[0] || 'Teinte RAL au choix')
    : field(meta?.thermolaquage || meta?.teinte, 'Teinte RAL au choix')

  return `
    <section class="sheet">
      <header class="sheet-header">
        <div>
          <div class="sheet-title">${escapeHtml(sheetTitle)}</div>
          <div class="sheet-ref">FICHE Y15 — ÉDITION 2025</div>
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
          <div class="section-title">Largeur</div>
          <div class="dims-card">
            ${twoLeaf ? `
              <div class="dims-row"><span>2 vantaux égaux</span><strong>${dims.l != null ? `${dims.l} mm` : '—'}</strong></div>
              <div class="dims-row"><span>L. passage de service</span><strong>—</strong></div>
              <div class="dims-row"><span>Largeur hors-tout</span><strong>${dims.l != null ? `${dims.l} mm` : '—'}</strong></div>
            ` : `
              <div class="dims-row"><span>Largeur hors-tout</span><strong>${dims.l != null ? `${dims.l} mm` : '—'}</strong></div>
            `}
          </div>
        </div>
        <div class="dims-col">
          <div class="section-title">Hauteur</div>
          <div class="dims-card">
            <div class="dims-row"><span>Hauteur hors-tout</span><strong>${dims.h != null ? `${dims.h} mm` : '—'}</strong></div>
            <div class="dims-note">Les dimensions indiquées sont les côtes de fabrication ; elles ne comprennent aucun jeu.</div>
          </div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <div class="section-title">Teinte</div>
          <div class="info-value">${escapeHtml(thermo)}</div>
          <div class="info-note">Largeur hors-tout + jeu de pose = largeur baie (ou gros œuvre)</div>
        </div>
        <div class="info-card">
          <div class="section-title">Produit</div>
          <div class="info-value strong">${escapeHtml(field(line.type_porte || line.designation?.split('\n')[0] || line.gamme))}</div>
          <div class="info-note">${escapeHtml(field(line.gamme))} ${escapeHtml(field(line.vantail))}</div>
          ${weightKg ? `<div class="info-note">Poids approximatif — vantail : <strong>${weightKg} kg</strong></div>` : ''}
        </div>
      </div>

      <div class="bottom-grid">
        <div class="info-card">
          <div class="section-title">Sens d'ouverture</div>
          ${openingDiagram(detailMeta.openingSense, twoLeaf)}
          ${detailMeta.openingSense ? `<div class="info-note">Sens retenu : ${escapeHtml(detailMeta.openingSense)} (prérempli depuis la grille)</div>` : '<div class="info-note">Cocher le sens retenu sur site.</div>'}
        </div>
        <div class="info-card">
          <div class="section-title">Seuil, exposition</div>
          <div class="threshold-row"><span>Avec barre de seuil</span>${checkboxBox(detailMeta.withThreshold === true)}</div>
          <div class="threshold-row"><span>Sans barre de seuil</span>${checkboxBox(detailMeta.withThreshold === false)}</div>
          <div class="threshold-row threshold-row-split">
            <span>Côté agression exposé aux intempéries</span>
            <span class="threshold-inline">${checkboxBox(detailMeta.weatherExposed === true)} Oui &nbsp; ${checkboxBox(detailMeta.weatherExposed === false)} Non</span>
          </div>
        </div>
      </div>

      <div class="equipment-card">
        <div class="section-title">Équipements fournis-posés</div>
        ${equipment.length
          ? `<ul>${equipment.map(([, value]) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`
          : '<div class="empty">Voir désignation devis pour le détail des équipements.</div>'}
      </div>

      <footer class="sheet-footer">
        <div>En complément de l'offre n° <strong>${escapeHtml(field(devis.quote_number || devis.name || devis.id))}</strong></div>
        <div class="footer-line">Date : ____________________ &nbsp;&nbsp; Cachet : ____________________</div>
      </footer>
    </section>
  `
}

export async function buildDetailSheetsPdf({ devis, lines = [] }) {
  const productLines = lines.filter(l => (l.line_section || 'products') === 'products')
  const body = productLines.map((line, index) => detailSheetHtml(line, index, devis)).join('\n')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fiches détail</title>
  <style>
    ${FONT_FACES_CSS}
    @page { size: A4; margin: 12mm 10mm 14mm; }
    body { margin: 0; font-family: Montserrat, Arial, sans-serif; color: #3c4b4d; font-size: 9.5pt; }
    .sheet { page-break-after: always; min-height: 255mm; display: flex; flex-direction: column; gap: 12px; }
    .sheet-header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #3c4b4d; padding-bottom: 8px; }
    .sheet-title { font-size: 13pt; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; }
    .sheet-ref { font-size: 8pt; font-weight: 700; color: #6d7a7d; margin-top: 3px; }
    .sheet-quote { text-align: right; font-size: 8.5pt; line-height: 1.5; }
    .lbl { color: #7a8689; font-weight: 700; margin-right: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1.2fr .8fr 1fr; gap: 10px; }
    .meta-box { border: 1px solid #d5dcde; border-radius: 6px; padding: 8px 10px; min-height: 52px; }
    .meta-box .val { margin-top: 4px; font-weight: 500; }
    .strong { font-weight: 800; }
    .section-title { font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #3c4b4d; margin-bottom: 6px; }
    .dims-grid, .info-grid, .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .dims-card, .info-card, .equipment-card { border: 1px solid #d5dcde; border-radius: 6px; padding: 10px; }
    .dims-row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px dashed #e3e8ea; }
    .dims-row:last-child { border-bottom: none; }
    .dims-note, .info-note { margin-top: 8px; font-size: 8pt; color: #7a8689; line-height: 1.35; }
    .info-value { font-size: 10pt; line-height: 1.4; }
    .opening-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .opening-diagram-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .opening-diagram-cell { border: 1px solid #cfd6d8; border-radius: 4px; padding: 6px 4px 4px; text-align: center; background: #fafbfc; }
    .opening-diagram-cell.active { border-color: #3c4b4d; background: #eef3f4; box-shadow: inset 0 0 0 1px #3c4b4d; }
    .opening-svg { width: 100%; max-width: 120px; height: auto; display: block; margin: 0 auto; }
    .opening-diagram-label { font-size: 7.5pt; font-weight: 700; color: #6d7a7d; margin-top: 2px; }
    .opening-diagram-cell.active .opening-diagram-label { color: #3c4b4d; }
    .checkbox-box { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border: 1.2px solid #3c4b4d; border-radius: 2px; font-size: 10px; font-weight: 800; color: #2f7d32; vertical-align: middle; }
    .checkbox-box.checked { background: #eef3f4; }
    .threshold-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 5px 0; font-size: 8.5pt; border-bottom: 1px dashed #e3e8ea; }
    .threshold-row:last-child { border-bottom: none; }
    .threshold-row-split { flex-wrap: wrap; }
    .threshold-inline { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
    .equipment-card ul { margin: 0; padding-left: 18px; line-height: 1.45; }
    .equipment-card li { margin-bottom: 4px; }
    .empty { color: #98a1a4; font-style: italic; font-size: 8.5pt; }
    .sheet-footer { margin-top: auto; border-top: 1px solid #d5dcde; padding-top: 10px; font-size: 8.5pt; color: #667276; }
    .chassis-diagram { margin-top: 4px; }
    .chassis-svg { width: 100%; max-width: 180px; height: auto; display: block; }
    .chassis-sheet .sheet-ref { color: #b45309; }
  </style></head><body>${body || '<section class="sheet"><h1>Aucune fiche à produire</h1></section>'}</body></html>`
  const buffer = await renderDevisPdfBuffer(html, { offerNumber: `${devis.quote_number || devis.id}-detail` })
  return { buffer, filename: `fiches-detail-${devis.quote_number || devis.id}.pdf` }
}
