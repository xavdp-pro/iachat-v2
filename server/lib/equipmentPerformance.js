/**
 * Resolve which equipment matrix (tariff tab) applies to a grid row.
 */

/** Base tariff tab priority — equipment menus follow the pricing gamme, not cumulated options. */
export const EQUIPMENT_CATALOG_PRIORITY = [
  'CR6', 'CR5', 'CR4', 'CR3', 'CR2',
  'FB7', 'FB6', 'FB5', 'FB4',
  'EI120', 'EI90', 'EI60', 'EI30',
  'BLAST', 'PRISON', 'ANTI-BELIER', 'EF2',
]

export function normalizeCatalogPerformance(value = '') {
  return String(value || '').trim().toUpperCase().replace(/^RC/, 'CR')
}

function normalizeGammeText(value = '') {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/RC([2-6])/g, 'CR$1')
}

/** Primary tariff tab encoded in the row gamme label (before option tokens). */
export function resolveGammePrimaryPerformance(gamme = '') {
  const text = normalizeGammeText(gamme)
  if (!text) return null
  if (/\bBLAST\b/.test(text)) return 'BLAST'
  if (/\bEI\s*120\b|\bEI120\b/.test(text)) return 'EI120'
  if (/\bEI\s*90\b|\bEI90\b/.test(text)) return 'EI90'
  if (/\bEI\s*60\b|\bEI60\b/.test(text)) return 'EI60'
  if (/\bEI\s*30\b|\bEI30\b/.test(text)) return 'EI30'
  if (/\bFB\s*7\b|\bFB7\b/.test(text)) return 'FB7'
  if (/\bFB\s*6\b|\bFB6\b/.test(text)) return 'FB6'
  if (/\bFB\s*4\b|\bFB4\b/.test(text)) return 'FB4'
  if (/CR5.*EI|EI.*CR5|CR5EI/.test(text)) return 'CR5'
  if (/\bCR\s*6\b|\bCR6\b/.test(text)) return 'CR6'
  if (/\bCR\s*5\b|\bCR5\b/.test(text)) return 'CR5'
  if (/\bCR\s*4\b|\bCR4\b/.test(text)) return 'CR4'
  if (/\bCR\s*3\b|\bCR3\b/.test(text)) return 'CR3'
  if (/\bCR\s*2\b|\bCR2\b/.test(text)) return 'CR2'
  if (/\bPRISON\b/.test(text)) return 'PRISON'
  if (/ANTI.?BELIER|BELIER/.test(text)) return 'ANTI-BELIER'
  if (/\bEF\s*2\b|\bEF2\b/.test(text)) return 'EF2'
  return null
}

/**
 * Pick the catalog performance key for a row, preferring the base tariff tab
 * that has an imported matrix in DB when `availablePerformances` is provided.
 */
export function resolveEquipmentCatalogPerformance(rowPerformances = [], availablePerformances = null, gamme = '') {
  const normalized = [...new Set((rowPerformances || []).map(normalizeCatalogPerformance).filter(Boolean))]
  const available = availablePerformances
    ? new Set(availablePerformances.map(normalizeCatalogPerformance).filter(Boolean))
    : null

  const gammePrimary = resolveGammePrimaryPerformance(gamme)
  if (gammePrimary) {
    const perf = normalizeCatalogPerformance(gammePrimary)
    if (normalized.includes(perf) && (!available || available.has(perf))) return perf
  }

  for (const perf of EQUIPMENT_CATALOG_PRIORITY) {
    if (!normalized.includes(perf)) continue
    if (available && !available.has(perf)) continue
    return perf
  }

  if (available) {
    const fallback = normalized.find(perf => available.has(perf))
    if (fallback) return fallback
  }
  return normalized[0] || null
}
