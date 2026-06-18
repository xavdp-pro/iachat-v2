/**
 * Build XLSX export payload from grid rows (client-side, uses resolveRow).
 */
import { resolveRow } from '../pages/DevisGrid.jsx'

const EQUIPMENT_COLUMNS = [
  { key: 'cremone', label: 'Crémone' },
  { key: 'fp', label: 'Ferme-porte' },
  { key: 'contact', label: 'Contact' },
  { key: 'passeCable', label: 'Passe-câble' },
  { key: 'plinthes', label: 'Plinthe' },
  { key: 'ventouse', label: 'Ventouse' },
  { key: 'vitrage', label: 'Vitrage' },
  { key: 'judas', label: 'Judas' },
  { key: 'paumelle', label: 'Paumelle' },
]

export const GRID_XLSX_HEADERS = [
  '#', 'Désignation', 'Localisation', 'Perfs',
  'H (HT)', 'L (HT)', 'H (PL)', 'L (PL)',
  'TL', 'Serrure', 'Garniture int.', 'Garniture ext.', 'Autres équipements',
  ...EQUIPMENT_COLUMNS.map(c => c.label),
  'PU HT', 'Remise', 'Q.', 'Total HT',
]

function sectionOf(row) {
  return row?.line_section || 'products'
}

function rowLetterLabel(index) {
  let n = index + 1
  let label = ''
  while (n > 0) {
    n -= 1
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26)
  }
  return label
}

function mainEquipLabel(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text.replace(/\s*—\s*réf\.\s*\d{3,5}\s*$/i, '').trim() || text
}

function perfCompact(row, resolved) {
  const parts = [
    row._raw?.[3],
    row._raw?.[4] != null ? `FB${row._raw[4]}` : null,
    row._raw?.[5] != null ? `EI${row._raw[5]}` : null,
    row._raw?.[6] != null ? `Blast ${row._raw[6]}` : null,
    row._raw?.[7],
    row._raw?.[8],
  ].filter(v => v != null && String(v).trim())
  const acoustic = resolved._acousticValue
  if (acoustic) parts.push(typeof acoustic === 'string' ? acoustic : `${acoustic} dB`)
  return parts.join(' · ') || row.gamme || resolved.gamme || ''
}

function equipmentRef(resolved, column) {
  if (column.key === 'vitrage') return resolved._vitrageRef || ''
  if (column.key === 'fp') return resolved._fpRef || ''
  if (column.key === 'cremone') return resolved._cremoneRef || ''
  if (column.key === 'plinthes') return resolved._plintheRef || ''
  const equipment = resolved._equipmentByColumn?.[column.key]
  return equipment?.ref || ''
}

function equipmentPrice(resolved, column) {
  if (column.key === 'vitrage') return resolved._vitragePrix
  if (column.key === 'fp') return resolved._optFP?.prix
  if (column.key === 'cremone') return resolved._cremonePrix
  if (column.key === 'plinthes') return resolved._plinthePrix
  const equipment = resolved._equipmentByColumn?.[column.key]
  return equipment?.prix ?? null
}

function equipmentLabel(row, resolved, column) {
  if (column.key === 'vitrage') return mainEquipLabel(resolved._vitrageLabel)
  if (column.key === 'fp') return mainEquipLabel(row._raw?.[15] || resolved._fpLabel)
  if (column.key === 'cremone') return mainEquipLabel(resolved._cremoneLabel)
  if (column.key === 'plinthes') return mainEquipLabel(resolved._plintheLabel)
  const equipment = resolved._equipmentByColumn?.[column.key]
  return mainEquipLabel(equipment?.label)
}

function cell(value, palette = 'normal') {
  return { v: value ?? '', p: palette }
}

function buildMainProductCells(row, resolved, displayIndex, multGlobal) {
  const qty = Number.isFinite(row.qty) ? row.qty : 1
  const mult = Number.isFinite(row.multiple) ? row.multiple : multGlobal
  return [
    cell(rowLetterLabel(displayIndex), 'normal'),
    cell(row.designation || row.type || '', 'yellow'),
    cell(row.localisation || '', 'yellow'),
    cell(perfCompact(row, resolved), 'yellow'),
    cell(row.haut_mm ?? row.hauteur_mm ?? '', 'yellow'),
    cell(row.larg_mm ?? row.largeur_mm ?? '', 'yellow'),
    cell(resolved.hauteur_pl_mm ?? '', 'yellow'),
    cell(resolved.largeur_pl_mm ?? '', 'yellow'),
    cell(resolved._thermolaquageLabel || resolved._thermolaquageType || '', 'yellow'),
    cell(mainEquipLabel(row._raw?.[12] || resolved._serrureLabel), 'yellow'),
    cell(mainEquipLabel(row._raw?.[13] || resolved._garnIntLabel), 'yellow'),
    cell(mainEquipLabel(row._raw?.[14] || resolved._garnExtLabel), 'yellow'),
    cell(resolved._otherExtras?.map(item => mainEquipLabel(item.label)).filter(Boolean).join(', '), 'yellow'),
    ...EQUIPMENT_COLUMNS.map(column => cell(equipmentLabel(row, resolved, column), 'yellow')),
    cell(resolved._pu > 0 ? resolved._pu : row.prix_base_ht ?? '', 'gray'),
    cell(mult, 'yellow'),
    cell(qty, 'yellow'),
    cell(resolved._totalHt ?? row.total_ligne_ht ?? '', 'blue'),
  ]
}

function buildRefSubCells(row, resolved) {
  return [
    cell('', 'subrow'),
    cell('Références', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell(resolved._thermolaquageRef || '', 'gray'),
    cell(resolved._serrureRef || '', 'yellow'),
    cell(resolved._garnIntRef || '', 'yellow'),
    cell(resolved._garnExtRef || '', 'yellow'),
    cell((resolved._otherExtrasRefs || []).join(', '), 'yellow'),
    ...EQUIPMENT_COLUMNS.map(column => cell(equipmentRef(resolved, column), 'yellow')),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
  ]
}

function buildPriceSubCells(resolved) {
  const price = (n) => (n != null && Number.isFinite(Number(n)) ? Number(n) : '')
  return [
    cell('', 'subrow'),
    cell('Prix unitaires', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell(price(resolved._thermolaquagePrix), 'gray'),
    cell(price(resolved._optSerrure?.prix), 'yellow'),
    cell(price(resolved._garnIntPrix), 'yellow'),
    cell(price(resolved._garnExtPrix), 'yellow'),
    cell(price(resolved._otherExtrasPrix > 0 ? resolved._otherExtrasPrix : null), 'yellow'),
    ...EQUIPMENT_COLUMNS.map(column => cell(price(equipmentPrice(resolved, column)), 'yellow')),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
    cell('', 'subrow'),
  ]
}

function buildAmountSectionCells(row, resolved, index, multGlobal) {
  const qty = Number.isFinite(row.qty) ? row.qty : 1
  const mult = Number.isFinite(row.multiple) ? row.multiple : multGlobal
  const label = sectionOf(row) === 'transport' ? 'Transport' : 'Calculs'
  return [
    cell(String(index + 1), 'normal'),
    cell(row.designation || row.type || label, 'yellow'),
    cell(row.localisation || '', 'yellow'),
    cell('', 'normal'),
    cell('', 'normal'),
    cell('', 'normal'),
    cell('', 'normal'),
    cell('', 'normal'),
    cell('', 'normal'),
    cell('', 'normal'),
    cell('', 'normal'),
    cell('', 'normal'),
    cell('', 'normal'),
    ...EQUIPMENT_COLUMNS.map(() => cell('', 'normal')),
    cell(resolved._pu ?? row.prix_base_ht ?? '', 'gray'),
    cell(mult, 'yellow'),
    cell(qty, 'yellow'),
    cell(resolved._totalHt ?? row.total_ligne_ht ?? '', 'blue'),
  ]
}

export function buildGridXlsxPayload(rows, {
  change = 1,
  tva = 0.2,
  multGlobal = 1,
  gesteCommercial = 0,
  currency = 'EUR',
  fileName = 'devis-grid.xlsx',
} = {}) {
  const body = []
  let productIndex = 0
  let totalHT = 0

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const resolved = resolveRow(row, change, tva, multGlobal)
    const section = sectionOf(row)
    if (section === 'products') {
      body.push({ rowType: 'main', cells: buildMainProductCells(row, resolved, productIndex, multGlobal) })
      body.push({ rowType: 'sub', cells: buildRefSubCells(row, resolved) })
      body.push({ rowType: 'sub', cells: buildPriceSubCells(resolved) })
      productIndex += 1
    } else {
      body.push({ rowType: 'main', cells: buildAmountSectionCells(row, resolved, index, multGlobal) })
    }
    totalHT += Number(resolved._totalHt) || 0
  }

  const totalAfterGeste = totalHT + (Number(gesteCommercial) || 0)
  const tvaAmount = totalAfterGeste * tva
  const totalTtc = totalAfterGeste + tvaAmount

  return {
    filename: fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
    currency,
    headers: GRID_XLSX_HEADERS,
    body,
    footer: [
      { label: 'Total général HT', value: totalHT, palette: 'blue' },
      { label: 'Geste commercial', value: Number(gesteCommercial) || 0, palette: 'yellow' },
      { label: `TVA (${(tva * 100).toFixed(1)} %)`, value: tvaAmount, palette: 'normal' },
      { label: 'Total TTC', value: totalTtc, palette: 'green' },
    ],
  }
}
