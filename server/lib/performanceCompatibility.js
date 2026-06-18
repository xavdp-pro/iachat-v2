/**
 * Static performance compatibility checks (CR / FB / EI / Blast).
 * Complements IA rule validation — fast, deterministic.
 */

const INCOMPATIBILITY_RULES = [
  {
    id: 'fb7-ei60',
    test: (p) => p.has('FB7') && p.has('EI60'),
    reason: 'FB7 et EI60 sont incompatibles sur une même ligne',
    fix: 'Retirer FB7 ou le classement feu EI60 (choix exclusif)',
    severity: 'blocking',
  },
  {
    id: 'fb7-ei30',
    test: (p) => p.has('FB7') && p.has('EI30'),
    reason: 'FB7 et EI30 sont incompatibles sur une même ligne',
    fix: 'Retirer FB7 ou le classement feu EI30',
    severity: 'blocking',
  },
  {
    id: 'fb7-ei120',
    test: (p) => p.has('FB7') && p.has('EI120'),
    reason: 'FB7 et EI120 sont incompatibles sur une même ligne',
    fix: 'Retirer FB7 ou le classement feu EI120',
    severity: 'blocking',
  },
  {
    id: 'cr6-fb7',
    test: (p) => p.has('CR6') && p.has('FB7'),
    reason: 'Sur CR6, FB7 est exclusif et non cumulable avec le feu',
    fix: 'Retirer FB7 ou basculer sur une autre performance pare-balles',
    severity: 'blocking',
  },
  {
    id: 'anti-belier-2v',
    test: (p, line) => p.has('ANTI-BELIER') && isTwoLeafLine(line),
    reason: 'BP 2 vantaux + anti-bélier : combinaison hors tarif',
    fix: 'Passer en 1 vantail ou retirer la performance anti-bélier',
    severity: 'blocking',
  },
]

function normalizePerfToken(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^RC/, 'CR')
}

function pushPerf(set, token) {
  const norm = normalizePerfToken(token)
  if (!norm) return
  if (/^CR[2-6]$/.test(norm)) set.add(norm)
  else if (/^FB[4-7]$/.test(norm)) set.add(norm)
  else if (/^EI(?:30|60|90|120)$/.test(norm)) set.add(norm)
  else if (norm === 'BLAST' || /^BLAST\d/.test(norm) || /^\dT/.test(norm)) set.add('BLAST')
  else if (norm.includes('ANTI-BELIER') || norm.includes('ANTIBELIER') || norm === 'BELIER') set.add('ANTI-BELIER')
  else if (norm === 'PRISON') set.add('PRISON')
}

function extractPerfsFromText(text) {
  const set = new Set()
  const upper = String(text || '').toUpperCase()
  const patterns = [
    /\bCR\s*([2-6])\b/g,
    /\bRC\s*([2-6])\b/g,
    /\bFB\s*([4-7])\b/g,
    /\bEI\s*(30|60|90|120)\b/g,
    /\bBLAST\b/g,
    /\bANTI[\s-]?B[ÉE]LIER\b/g,
    /\bPRISON\b/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(upper))) {
      if (match[0].includes('CR') || match[0].includes('RC')) pushPerf(set, `CR${match[1]}`)
      else if (match[0].includes('FB')) pushPerf(set, `FB${match[1]}`)
      else if (match[0].includes('EI')) pushPerf(set, `EI${match[1]}`)
      else pushPerf(set, match[0])
    }
  }
  return set
}

function extractPerfsFromRaw(raw) {
  const set = new Set()
  if (!Array.isArray(raw)) return set
  if (raw[3] != null && String(raw[3]).trim()) pushPerf(set, `CR${raw[3]}`)
  if (raw[4] != null && String(raw[4]).trim()) pushPerf(set, `FB${raw[4]}`)
  if (raw[5] != null && String(raw[5]).trim()) pushPerf(set, `EI${raw[5]}`)
  if (raw[6] != null && String(raw[6]).trim()) pushPerf(set, 'BLAST')
  if (raw[7] != null && String(raw[7]).trim()) pushPerf(set, 'ANTI-BELIER')
  if (raw[8] != null && String(raw[8]).trim()) pushPerf(set, 'PRISON')
  return set
}

function isTwoLeafLine(line = {}) {
  const text = [line.type, line.type_porte, line.designation, line.vantail].filter(Boolean).join(' ').toUpperCase()
  return /\b2\s*V\b|2\s*VANTAUX|DEUX\s+VANTAUX/.test(text)
}

export function collectLinePerformances(line = {}) {
  const perfs = new Set()
  const text = [
    line.gamme,
    line.designation,
    line.type,
    line.type_porte,
    line.rc,
    line.pb,
    line.cf,
    line.blast,
    line.belier,
    line.prison,
    line.acoustic,
    ...(Array.isArray(line.options_json) ? line.options_json : []),
    ...(Array.isArray(line.options) ? line.options : []),
    ...(Array.isArray(line.alertes_json) ? line.alertes_json : []),
    ...(Array.isArray(line.alertes) ? line.alertes : []),
  ].map(item => (typeof item === 'object' ? item?.label || item?.name : item)).filter(Boolean).join(' ')

  for (const token of extractPerfsFromText(text)) perfs.add(token)
  for (const token of extractPerfsFromRaw(line._raw)) perfs.add(token)
  if (line.gamme) pushPerf(perfs, line.gamme)
  return perfs
}

/**
 * @param {object[]} lines
 * @param {(index:number)=>string} labelFn
 */
export function auditPerformanceCompatibility(lines = [], labelFn = (i) => String.fromCharCode(65 + i)) {
  const issues = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || {}
    if ((line.line_section || 'products') !== 'products') continue
    const perfs = collectLinePerformances(line)
    if (!perfs.size) continue
    const label = line.ligne || labelFn(index)
    for (const rule of INCOMPATIBILITY_RULES) {
      if (!rule.test(perfs, line)) continue
      issues.push({
        ligne: label,
        rule: rule.id.toUpperCase().replace(/-/g, '_'),
        status: rule.severity === 'blocking' ? 'violation' : 'warning',
        reason: rule.reason,
        fix: rule.fix,
        performances: [...perfs],
      })
    }
  }
  return issues
}
