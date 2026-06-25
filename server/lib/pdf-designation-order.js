/**
 * Canonical PDF designation line order (Construction détail ligne devis 20260526.xlsx).
 * Weight (ordre 12) sits after reservation / hors-tout and before finition / equipment.
 */

const WEIGHT_LINE_RE = /poids\s+approximatif|approximate\s+weight|ungefähres\s+gewicht/i

const INSERT_BEFORE_PATTERNS = [
  /^Finition\s*:/i,
  /^Remplissage par/i,
  /^Equipement fourni[-\s]posé\s*:/i,
  /^Equipment supplied/i,
  /^Mitgelieferte Ausstattung/i,
]

const DIMENSION_ANCHOR_PATTERNS = [
  /^Réservation gros/i,
  /^Structural opening/i,
  /^Rohbauöffnung/i,
  /^Dimensions\s+hors[-\s]tout\s*:/i,
  /^Soit dimensions hors[-\s]tout\s*:/i,
  /^Overall dimensions\s*:/i,
  /^Außenmaße\s*:/i,
]

export function isPdfWeightLine(text = '') {
  return WEIGHT_LINE_RE.test(String(text || '').trim())
}

function findWeightInsertIndex(lines = []) {
  for (let i = 0; i < lines.length; i += 1) {
    if (INSERT_BEFORE_PATTERNS.some((re) => re.test(lines[i]))) return i
  }
  let lastDim = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (DIMENSION_ANCHOR_PATTERNS.some((re) => re.test(lines[i]))) lastDim = i
  }
  return lastDim >= 0 ? lastDim + 1 : lines.length
}

/**
 * Insert or relocate the weight line within designation body lines.
 * @param {string[]} lines
 * @param {string} [weightLine] — computed label; if omitted, only reorders an existing weight line
 */
export function insertWeightLineInDesignation(lines = [], weightLine = '') {
  const existingWeight = lines.find((line) => isPdfWeightLine(line))
  const withoutWeight = lines.filter((line) => !isPdfWeightLine(line))
  const weightToInsert = String(weightLine || existingWeight || '').trim()
  if (!weightToInsert) return lines

  const insertAt = findWeightInsertIndex(withoutWeight)
  const result = [...withoutWeight]
  result.splice(insertAt, 0, weightToInsert)
  return result
}
