/**
 * Compose detect_nexus raw[16] (autres_eq) from per-column equipment slots.
 * Avoids plinthe/judas/vitrage overwriting each other (Arthur 25/06/2026).
 */

export const GARN_INT_MIRROR_EXT_REFS = new Set([
  '4024', '4025', '4026', '4027', '4022', '4023',
  '4095', '4096', '4097', '4098', '4018', '4019', '4211', '4219',
])

const SLOT_SEGMENT_RE = [
  /^plinthe\b/i,
  /\b(?:judas|oculus|oeilleton|œilleton)\b/i,
  /\bpasse[\s-]?c[aâ]ble\b/i,
  /\bventouse\b/i,
  /\bcontact\b/i,
  /\bprotection\b|\bisorel\b/i,
  /\btrappe\b|\bpasse[\s-]?grenade\b/i,
  /\bpaumelle\b|\bpivot\b/i,
  /\bpanneau plein\b/i,
  /\bsans tain\b/i,
  /^(?:remplissage|vitrage)\b/i,
]

function extractRef(text) {
  const m = String(text || '').match(/\b([34]\d{3,4})\b/)
  return m ? m[1] : null
}

function stripSlotSegments(raw16) {
  const parts = String(raw16 || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  const kept = parts.filter(part => !SLOT_SEGMENT_RE.some(re => re.test(part)))
  return kept.join(', ')
}

export function formatSlotForAutres(slotKey, value) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (slotKey === 'plinthes') return /plinthe/i.test(v) ? v : `plinthe ${v}`
  if (slotKey === 'judas') return /(?:judas|oculus|oeilleton|œilleton)/i.test(v) ? v : `oculus judas ${v}`
  return v
}

/** Build autres_eq string from base raw[16] + column slot values. */
export function composeAutresFromSlots(baseRaw16, slots = {}) {
  const base = stripSlotSegments(baseRaw16)
  const slotParts = [
    'vitrage', 'plinthes', 'judas', 'passeCable', 'ventouse', 'contact',
    'protection', 'trappes', 'paumelle', 'divers',
  ]
    .map(key => formatSlotForAutres(key, slots[key]))
    .filter(Boolean)
  return [...(base ? [base] : []), ...slotParts].join(', ') || null
}

/** Derive slot map from a resolved grid row (equip_extra + options). */
export function deriveEquipmentSlots(row = {}) {
  const byCol = row._equipmentByColumn || {}
  const slots = {}
  const pick = (key) => {
    const item = byCol[key]
    if (!item) return ''
    return String(item.label || item.designation || item.ref || '').trim()
  }
  slots.plinthes = pick('plinthes') || (row._plintheLabel || '')
  slots.judas = pick('judas')
  slots.passeCable = pick('passeCable')
  slots.ventouse = pick('ventouse')
  slots.contact = pick('contact')
  slots.protection = pick('protection')
  slots.trappes = pick('trappes')
  slots.paumelle = pick('paumelle')
  slots.divers = pick('divers')
  const vitrageFromOpt = row._vitrageLabel || ''
  const vitrageFromCol = pick('vitrage')
  slots.vitrage = vitrageFromCol || vitrageFromOpt
  return Object.fromEntries(Object.entries(slots).filter(([, v]) => String(v || '').trim()))
}

export function equipmentColumnRecomputePatch(row, columnKey, value, clearedSentinel) {
  const isCleared = value === clearedSentinel
  const slots = { ...deriveEquipmentSlots(row), ...(row._equipmentSlots || {}) }
  slots[columnKey] = isCleared ? '' : String(value || '').trim()
  const raw16 = composeAutresFromSlots(row._raw?.[16], slots)
  return {
    _raw_16: raw16,
    _equipmentSlots: slots,
  }
}

export function mirrorGarnitureExtPatch(garnIntValue) {
  const ref = extractRef(garnIntValue)
  if (ref && GARN_INT_MIRROR_EXT_REFS.has(ref)) {
    return { _raw_14: garnIntValue }
  }
  return {}
}
