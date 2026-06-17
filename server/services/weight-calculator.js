/**
 * Door weight calculation from admin-managed profiles (source: Calcul poids.xlsx).
 */

export const DEFAULT_WEIGHT_PROFILES = [
  { type_label: 'BP Nexus de base', product_family: 'BP', leaf_kg_m2: 56, frame_kg_m: 7, leaf_formula: null, sort_order: 1 },
  { type_label: 'BP Nexus CR3', product_family: 'BP', leaf_kg_m2: 65, frame_kg_m: 7, leaf_formula: null, sort_order: 2 },
  { type_label: 'BP Nexus CR4', product_family: 'BP', leaf_kg_m2: 82, frame_kg_m: 7, leaf_formula: null, sort_order: 3 },
  { type_label: 'BP Nexus CR4-EI60', product_family: 'BP', leaf_kg_m2: 90, frame_kg_m: 9, leaf_formula: null, sort_order: 4 },
  { type_label: 'BP Nexus CR4-FB6', product_family: 'BP', leaf_kg_m2: 129, frame_kg_m: 11, leaf_formula: null, sort_order: 5 },
  { type_label: 'BP Nexus CR5', product_family: 'BP', leaf_kg_m2: 123, frame_kg_m: 7, leaf_formula: null, sort_order: 6 },
  { type_label: 'BP Nexus CR5-EI60', product_family: 'BP', leaf_kg_m2: 177, frame_kg_m: 9, leaf_formula: null, sort_order: 7 },
  { type_label: 'BP Nexus CR5-FB6', product_family: 'BP', leaf_kg_m2: 199, frame_kg_m: 14, leaf_formula: null, sort_order: 8 },
  { type_label: 'BP Nexus CR6', product_family: 'BP', leaf_kg_m2: 188, frame_kg_m: 11, leaf_formula: null, sort_order: 9 },
  { type_label: 'BP Nexus CR6-FB7', product_family: 'BP', leaf_kg_m2: 227, frame_kg_m: 16, leaf_formula: null, sort_order: 10 },
  { type_label: 'BP Nexus FB6', product_family: 'BP', leaf_kg_m2: 129, frame_kg_m: 11, leaf_formula: null, sort_order: 11 },
  { type_label: 'BP Nexus FB7', product_family: 'BP', leaf_kg_m2: 163, frame_kg_m: 13, leaf_formula: null, sort_order: 12 },
  { type_label: 'BP Nexus EI60', product_family: 'BP', leaf_kg_m2: 72, frame_kg_m: 9, leaf_formula: null, sort_order: 13 },
  { type_label: 'BP Nexus EI90', product_family: 'BP', leaf_kg_m2: 82, frame_kg_m: 9, leaf_formula: null, sort_order: 14 },
  { type_label: 'BP Nexus EI120', product_family: 'BP', leaf_kg_m2: 84, frame_kg_m: 9, leaf_formula: null, sort_order: 15 },
  { type_label: 'BP Nexus Blast 0.5 t/m²', product_family: 'BP', leaf_kg_m2: 56, frame_kg_m: 7, leaf_formula: null, sort_order: 16 },
  { type_label: 'BP Nexus Blast 2 t/m²', product_family: 'BP', leaf_kg_m2: 85, frame_kg_m: 7, leaf_formula: null, sort_order: 17 },
  { type_label: 'BP Nexus Blast 4 t/m²', product_family: 'BP', leaf_kg_m2: 143, frame_kg_m: 7, leaf_formula: null, sort_order: 18 },
  { type_label: 'BP Nexus anti-bélier', product_family: 'BP', leaf_kg_m2: 125, frame_kg_m: 7, leaf_formula: null, sort_order: 19 },
  { type_label: 'CF Nexus CR3', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 6, leaf_formula: 'vitrage_surface_minus_100mm', sort_order: 20 },
  { type_label: 'CF Nexus CR3 - EI60', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 8, leaf_formula: null, sort_order: 21 },
  { type_label: 'CF Nexus CR4', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 6, leaf_formula: null, sort_order: 22 },
  { type_label: 'CF Nexus CR4-EI60', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 8, leaf_formula: null, sort_order: 23 },
  { type_label: 'CF Nexus CR5', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 10, leaf_formula: null, sort_order: 24 },
  { type_label: 'CF Nexus CR5-EI60', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 12, leaf_formula: null, sort_order: 25 },
  { type_label: 'CF Nexus CR5-FB6', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 12, leaf_formula: null, sort_order: 26 },
  { type_label: 'CF Nexus FB4', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 7, leaf_formula: null, sort_order: 27 },
  { type_label: 'CF Nexus FB6', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 9, leaf_formula: null, sort_order: 28 },
  { type_label: 'CF Nexus FB6 - EI60', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 10, leaf_formula: null, sort_order: 29 },
  { type_label: 'CF Nexus FB7', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 11, leaf_formula: null, sort_order: 30 },
  { type_label: 'CF Nexus EI60', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 8, leaf_formula: null, sort_order: 31 },
  { type_label: 'CF Nexus Blast 2 t/m²', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 6, leaf_formula: null, sort_order: 32 },
  { type_label: 'CF Nexus Blast 5 t/m²', product_family: 'CF', leaf_kg_m2: null, frame_kg_m: 6, leaf_formula: null, sort_order: 33 },
]

function normalizeLabel(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim()
}

function numberOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function rowText(row = {}) {
  return [
    row.type, row.type_porte, row.designation, row.gamme, row.vantail, row.ref_base,
    row.rc, row.pb, row.cf, row.blast, row.belier, row.prison,
    ...(Array.isArray(row._raw) ? row._raw : []),
  ].filter(Boolean).join(' ')
}

export function isChassisProduct(row = {}) {
  return /\bCHASSIS\b/i.test(rowText(row))
}

function detectRc(row) {
  if (row.rc) return String(row.rc).toUpperCase().replace(/^RC/, 'CR')
  const m = rowText(row).match(/\b(?:CR|RC)\s*([2-6])\b/i)
  return m ? `CR${m[1]}` : null
}

function detectPb(row) {
  if (row.pb) return String(row.pb).toUpperCase()
  const m = rowText(row).match(/\bFB\s*([4-7])\b/i)
  return m ? `FB${m[1]}` : null
}

function detectCf(row) {
  if (row.cf) {
    const v = String(row.cf).toUpperCase().replace(/\s+/g, '')
    if (/EI/.test(v)) return v.replace('EI', 'EI')
    return v
  }
  const m = rowText(row).match(/\bEI\s*(30|60|90|120)\b/i)
  return m ? `EI${m[1]}` : null
}

function detectBlast(row) {
  if (row.blast) return String(row.blast)
  const m = rowText(row).match(/\b(0[,.]5|[245])\s*t\s*\/\s*m(?:²|2)?\b/i)
  if (!m) return null
  const val = String(m[1]).replace(',', '.')
  if (val === '0.5') return '0.5 t/m²'
  return `${val} t/m²`
}

function detectBelier(row) {
  if (row.belier) return true
  return /anti[-\s]?belier|anti[-\s]?bélier/i.test(rowText(row))
}

function formatBlastLabel(blast) {
  const text = String(blast || '').replace(/\s+/g, ' ').trim()
  if (/0[,.]5/.test(text)) return 'Blast 0.5 t/m²'
  if (/2\s*t/i.test(text)) return 'Blast 2 t/m²'
  if (/4\s*t/i.test(text)) return 'Blast 4 t/m²'
  if (/5\s*t/i.test(text)) return 'Blast 5 t/m²'
  return `Blast ${text}`
}

function formatCfSuffix(cf) {
  const v = String(cf || '').toUpperCase().replace(/\s+/g, '')
  if (/EI30/.test(v)) return 'EI30'
  if (/EI60/.test(v)) return 'EI60'
  if (/EI90/.test(v)) return 'EI90'
  if (/EI120/.test(v)) return 'EI120'
  return null
}

export function buildWeightTypeCandidates(row = {}) {
  const chassis = isChassisProduct(row)
  const prefix = chassis ? 'CF Nexus' : 'BP Nexus'
  const rc = detectRc(row)
  const pb = detectPb(row)
  const cf = formatCfSuffix(detectCf(row))
  const blast = detectBlast(row)
  const belier = detectBelier(row)
  const candidates = []

  if (belier && !chassis) candidates.push(`${prefix} anti-bélier`)
  if (blast) candidates.push(`${prefix} ${formatBlastLabel(blast)}`)

  if (chassis) {
    if (rc && cf) {
      candidates.push(`${prefix} ${rc} - ${cf}`)
      candidates.push(`${prefix} ${rc}-${cf}`)
    }
    if (rc && pb) candidates.push(`${prefix} ${rc}-${pb}`)
    if (pb && cf) {
      candidates.push(`${prefix} ${pb} - ${cf}`)
      candidates.push(`${prefix} ${pb}-${cf}`)
    }
    if (rc) candidates.push(`${prefix} ${rc}`)
    if (pb) candidates.push(`${prefix} ${pb}`)
    if (cf) candidates.push(`${prefix} ${cf}`)
  } else {
    if (rc && cf) candidates.push(`${prefix} ${rc}-${cf}`)
    if (rc && pb) candidates.push(`${prefix} ${rc}-${pb}`)
    if (rc) candidates.push(`${prefix} ${rc}`)
    if (pb) candidates.push(`${prefix} ${pb}`)
    if (cf) candidates.push(`${prefix} ${cf}`)
    if (!rc && !pb && !cf && !blast && !belier) candidates.push(`${prefix} de base`)
  }

  return [...new Set(candidates)]
}

export function resolveWeightProfile(row = {}, profiles = []) {
  const active = profiles.filter(p => p.active !== 0 && p.active !== false)
  const byLabel = new Map(active.map(p => [normalizeLabel(p.type_label), p]))
  for (const candidate of buildWeightTypeCandidates(row)) {
    const hit = byLabel.get(normalizeLabel(candidate))
    if (hit) return hit
  }
  const fallback = active.find(p => normalizeLabel(p.type_label) === normalizeLabel('BP Nexus de base'))
  return fallback || active[0] || null
}

export function calculateLineWeightKg(profile, { height_mm, width_mm, qty = 1, vitrage_kg_m2 = null } = {}) {
  if (!profile) return null
  const hMm = numberOrNull(height_mm)
  const lMm = numberOrNull(width_mm)
  if (!hMm || !lMm) return null

  const h = hMm / 1000
  const l = lMm / 1000
  const perimeter = 2 * (h + l)
  let leafWeight = 0

  if (profile.leaf_formula === 'vitrage_surface_minus_100mm') {
    const vitrage = numberOrNull(vitrage_kg_m2) || 0
    const effH = Math.max(0, hMm - 100) / 1000
    const effL = Math.max(0, lMm - 100) / 1000
    leafWeight = vitrage * effH * effL
  } else if (profile.leaf_kg_m2 != null) {
    leafWeight = Number(profile.leaf_kg_m2) * h * l
  }

  const frameWeight = Number(profile.frame_kg_m || 0) * perimeter
  const unitKg = leafWeight + frameWeight
  const quantity = numberOrNull(qty) || 1
  return Math.round(unitKg * quantity * 100) / 100
}

export function calculateDevisWeight(rows = [], profiles = [], options = {}) {
  const vitrageKgM2 = options.vitrage_kg_m2 ?? null
  const lines = []
  let totalKg = 0

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {}
    const section = row.line_section || row._section || 'products'
    if (section !== 'products') continue
    if (row._isFooter || row._isBlank) continue

    const profile = resolveWeightProfile(row, profiles)
    const height_mm = row.haut_mm ?? row.hauteur_mm
    const width_mm = row.larg_mm ?? row.largeur_mm
    const qty = row.qty ?? row.quantite ?? 1
    const weight_kg = calculateLineWeightKg(profile, { height_mm, width_mm, qty, vitrage_kg_m2: vitrageKgM2 })

    if (weight_kg != null) totalKg += weight_kg
    lines.push({
      index,
      designation: row.designation || row.type || `Ligne ${index + 1}`,
      type_label: profile?.type_label || null,
      height_mm: numberOrNull(height_mm),
      width_mm: numberOrNull(width_mm),
      qty: numberOrNull(qty) || 1,
      weight_kg,
      profile_id: profile?.id || null,
    })
  }

  return {
    total_kg: Math.round(totalKg * 100) / 100,
    lines,
    vitrage_kg_m2: vitrageKgM2,
  }
}
