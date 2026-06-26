/**
 * Arthur A1 equipment filtering — allowed refs per gamme × grid column.
 * Source: mails Arthur 24–25/06/2026 + retour CR5 Zimbra (recette colonne par colonne).
 */
import { resolveGammePrimaryPerformance } from './equipmentPerformance.js'

function extractRef(value = '') {
  const m = String(value || '').match(/\b([34]\d{3,4})\b/)
  return m ? m[1] : null
}

function rowHeightHt(row = {}) {
  const h = Number(row.hauteur_mm ?? row.haut_mm ?? row.hauteur_ht_mm ?? row._raw?.[2])
  return Number.isFinite(h) ? h : null
}

function tallDoor(heightHt) {
  return heightHt != null && heightHt >= 3500
}

/** Static catalog entries missing from DB matrices. */
export const STATIC_EQUIPMENT_ENTRIES = [
  { ref: '3921', designation: 'Ventouse électro-mag. 300 kg — 12-24-48 V', grid_column: 'autres', slot: 'ventouse', performances: ['CR4', 'CR5', 'CR6', 'FB4', 'FB6', 'FB7', 'EI60', 'EI90', 'EI120', 'BLAST', 'ANTI-BELIER', 'PRISON'], price_ht: 268.26 },
  { ref: '3922', designation: 'Ventouse électro-mag. 300 kg — 24-48 V DAS', grid_column: 'autres', slot: 'ventouse', performances: ['CR4', 'CR5', 'CR6', 'FB4', 'FB6', 'FB7', 'EI60', 'EI90', 'EI120', 'BLAST', 'ANTI-BELIER', 'PRISON'], price_ht: 367.2 },
  { ref: '4496', designation: 'Protection panneau Isorel — vantail ≤ L 1600 H 2300', grid_column: 'protection', slot: 'autres', performances: ['CR4', 'CR5', 'CR6', 'FB4', 'FB6', 'FB7', 'EI60', 'EI90', 'EI120', 'BLAST'], price_ht: 179.44 },
  { ref: '4497', designation: 'Protection panneau Isorel — vantail ≥ L 1600 H 2300', grid_column: 'protection', slot: 'autres', performances: ['CR4', 'CR5', 'CR6', 'FB4', 'FB6', 'FB7', 'EI60', 'EI90', 'EI120', 'BLAST'], price_ht: 358.87 },
  { ref: '4702', designation: 'Trappe technique CR3+CR4+CR5', grid_column: 'trappe', slot: 'autres', performances: ['CR3', 'CR4', 'CR5'], price_ht: 1361 },
  { ref: '4705', designation: 'Trappe technique CR3+CR4+CR5 (variante)', grid_column: 'trappe', slot: 'autres', performances: ['CR3', 'CR4', 'CR5'], price_ht: 575 },
  { ref: '4711', designation: 'Trappe passe-grenade 200×200 — BP non coupe-feu', grid_column: 'trappe', slot: 'autres', performances: ['CR3', 'CR4', 'CR5', 'PRISON'], price_ht: 929.92 },
  { ref: '4712', designation: 'Trappe passe-grenade 200×200 — BP coupe-feu EI30/E60', grid_column: 'trappe', slot: 'autres', performances: ['CR3', 'CR4', 'CR5', 'PRISON'], price_ht: 1233.67 },
  { ref: '3998VHB', designation: 'Double passe-câble invisible + gaine', grid_column: 'contact', slot: 'passeCable', performances: ['CR3', 'CR4', 'CR5', 'CR6', 'FB4', 'FB6', 'FB7', 'EI60', 'EI120', 'BLAST', 'ANTI-BELIER', 'PRISON'], price_ht: 308.04 },
  { ref: '4455', designation: 'Judas pare-balles FB6 (compatible EI 30/60)', grid_column: 'judas', slot: 'judas', performances: ['CR4', 'CR5', 'CR6', 'FB4', 'FB6', 'FB7'], price_ht: 499.38 },
  { ref: '4456', designation: 'Judas pare-balles FB7 (non compatible coupe-feu)', grid_column: 'judas', slot: 'judas', performances: ['CR4', 'CR5', 'CR6', 'FB4', 'FB6', 'FB7'], price_ht: 2607 },
  { ref: '4180', designation: 'Barre horizontale pour sortie libre pour serrure LSS', grid_column: 'garniture_int', slot: 'garniture', performances: ['CR4', 'CR5', 'CR6', 'FB4', 'FB6', 'FB7', 'BLAST'], price_ht: 720.29 },
  { ref: '4211', designation: 'Béquille int. + poignée palière ext. sur plaque blindée pour Bigsur Evo', grid_column: 'garniture_int', slot: 'garniture', performances: ['CR4', 'CR5', 'CR6', 'FB4', 'FB6', 'FB7'], price_ht: 557.16 },
  { ref: '4219', designation: 'Palette Exéa Control int. + poignée palière ext. sur plaque blindée', grid_column: 'garniture_int', slot: 'garniture', performances: ['CR4', 'CR5', 'CR6', 'FB4', 'FB6', 'FB7'], price_ht: 1840.84 },
  { ref: '4516', designation: 'Oculus L 600 H 600 — vitrage feuilleté isolant P6B - air - 44.2 (CR5)', grid_column: 'vitrage', slot: 'vitrage', performances: ['CR5'], price_ht: null },
  { ref: '4517', designation: 'Oculus L 600 H 600 — vitrage feuilleté isolant P6B - air - EI² 60 (CR5)', grid_column: 'vitrage', slot: 'vitrage', performances: ['CR5'], price_ht: null },
  { ref: '4518', designation: 'Oculus L 800 H 800 — vitrage feuilleté isolant P6B - air - 44.2 (CR5)', grid_column: 'vitrage', slot: 'vitrage', performances: ['CR5'], price_ht: null },
  { ref: '4521', designation: 'Oculus L 800 H 800 — vitrage feuilleté isolant P6B - air - EI² 60 (CR5)', grid_column: 'vitrage', slot: 'vitrage', performances: ['CR5'], price_ht: null },
  { ref: '4616', designation: 'Oculus plein vantail CR5 — vitrage P6B - air - 44.2', grid_column: 'vitrage', slot: 'vitrage', performances: ['CR5'], price_ht: null },
  { ref: '4617', designation: 'Oculus plein vantail CR5 — vitrage P6B - air - EI² 60', grid_column: 'vitrage', slot: 'vitrage', performances: ['CR5'], price_ht: null },
  { ref: '4621', designation: 'Oculus plein vantail CR5 — vitrage P6B - air - 44.2 (variante)', grid_column: 'vitrage', slot: 'vitrage', performances: ['CR5'], price_ht: null },
  { ref: '4666', designation: 'Oculus semi-vantail CR5 — vitrage P6B - air - 44.2', grid_column: 'vitrage', slot: 'vitrage', performances: ['CR5'], price_ht: null },
  { ref: '4667', designation: 'Oculus semi-vantail CR5 — vitrage P6B - air - EI² 60', grid_column: 'vitrage', slot: 'vitrage', performances: ['CR5'], price_ht: null },
  { ref: '4671', designation: 'Oculus L 200 H 2000 CR5 — vitrage P6B - air - EI² 60', grid_column: 'vitrage', slot: 'vitrage', performances: ['CR5'], price_ht: null },
  { ref: '4152', designation: 'Dény LSS méca — 5 pts + cyl. rond (variante CR5)', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: 2772.63 },
  { ref: '4156', designation: 'Dény LSS motorisée — 5 pts + cyl. rond', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: 4823.39 },
  { ref: '4158', designation: 'Dény LSS auto — 5 pts sortie libre + cyl. rond', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: 3143.26 },
  { ref: '4160', designation: 'Dény LSS méca — 5 pts + cyl. rond (sortie contrôlée)', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: 2772.63 },
  { ref: '4162', designation: 'Dény LSS auto — 5 pts sortie libre + cyl. rond (variante)', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: 3143.26 },
  { ref: '4166', designation: 'Dény LSS motorisée — 5 pts sortie libre + cyl. rond', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: 4823.39 },
  { ref: '4170', designation: 'Dény LSS motorisée — 5 pts sortie contrôlée DAS + cyl. rond', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: 5597.15 },
  { ref: '4190', designation: 'Dény LSS Duplex 40815 sans sortie libre — béquille int. inox', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: null },
  { ref: '4192', designation: 'Dény LSS Duplex 30811 avec sortie libre — béquille PMR int.', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: null },
  { ref: '4193', designation: 'Dény LSS Duplex 20815 sans sortie libre — béquille int. inox', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: null },
  { ref: '4194', designation: 'Dény LSS Duplex 20815 sans sortie libre — béquille double inox', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: null },
  { ref: '4195', designation: 'Dény LSS Duplex 20811 avec sortie libre — béquille PMR int.', grid_column: 'serrure', slot: 'serrure', performances: ['CR5'], price_ht: null },
  { ref: '4201', designation: 'Serrure motorisée Abloy Bigsur Evo 4 points', grid_column: 'serrure', slot: 'serrure', performances: ['CR5', 'CR4'], price_ht: null },
  { ref: '4203', designation: 'Serrure motorisée Abloy Bigsur Evo 4 points — 3 pênes 1/2 tour', grid_column: 'serrure', slot: 'serrure', performances: ['CR5', 'CR4'], price_ht: null },
]

const CR4_JUDAS = ['4450', '4452', '4455', '4456']
const CR5_JUDAS = ['4455', '4456']
const CR6_JUDAS = ['4450', '4452', '4455', '4456']

/** Garniture int refs that must also appear on garniture ext (Arthur 25/06/2026). */
export const GARN_INT_MIRROR_EXT_REFS = new Set([
  '4024', '4025', '4026', '4027', '4022', '4023',
  '4095', '4096', '4097', '4098', '4018', '4019', '4211', '4219',
])

const CR5_SERRURE_BASE = ['4150', '4152', '4156', '4158', '4160', '4162', '4166', '4170', '4190', '4192', '4193', '4194', '4195', '4201', '4203']
const CR5_SERRURE_TALL = []
/** CR4 oculus — must not appear on CR5 vitrage (Arthur 25/06). */
const CR4_VITRAGE = ['4511', '4513', '4611', '4661', '4601']
/** CR5 oculus — mail Arthur recette CR5. */
const CR5_VITRAGE = ['4516', '4517', '4518', '4521', '4616', '4617', '4621', '4666', '4667', '4671']
const FB_SERRURE_EXTRA = ['4201', '4203', '4140', '4142', '4146', '4148']
const FB_GARN_INT = ['4022', '4023', '4115', '4020', '4021', '4230', '4181']
const FB_FP = ['3667', '4926', '4927', '3697', '3699', '3696', '3680', '3681', '3682', '4920', '3622', '3623']
const BLAST_SERRURE = ['4132', '4136', '4138', '4142', '4146', '4148', '4201', '4203']
const BLAST_SERRURE_TALL = ['4190', '4191', '4192', '4193', '4194', '4195']

function set(...refs) {
  return new Set(refs.filter(Boolean))
}

function whitelistFor(gamme, gridColumn, heightHt) {
  const col = String(gridColumn || '')
  const tall = tallDoor(heightHt)

  if (gamme === 'CR6') {
    if (col === 'serrure') return set('4172', '4176')
    if (col === 'garniture_int') return set('4180', '4181', '4211', '4219')
    if (col === 'garniture_ext') return set() // série — bouclier anti-meuleuse inclus
    if (col === 'cremone') return set()
    if (col === 'judas') return set(...CR6_JUDAS)
    if (col === 'vitrage') return set(...CR4_VITRAGE) // matrix CR6 xlsx — oculus CR4
    if (col === 'divers' || col === 'autres') return set()
    if (col === 'passeCable' || col === 'passe_cable') return set('3998VHB')
    if (col === 'ventouse') return set('3921', '3922')
    if (col === 'protection') return set('4496', '4497')
    if (col === 'trappe') return set()
  }

  if (gamme === 'CR5') {
    if (col === 'serrure') return set(...CR5_SERRURE_BASE)
    if (col === 'garniture_int') return set('4180', '4181', '4211', '4219')
    if (col === 'garniture_ext') return set() // bouclier anti-meuleuse par défaut
    if (col === 'cremone') return set('4401', '4402', '4337')
    if (col === 'judas') return set(...CR5_JUDAS)
    if (col === 'vitrage') return set(...CR5_VITRAGE)
    if (col === 'divers' || col === 'autres') return set()
    if (col === 'passeCable' || col === 'passe_cable') return set('3998VHB')
    if (col === 'ventouse') return set('3921', '3922')
    if (col === 'protection') return set('4496', '4497')
    if (col === 'trappe') return set('4702', '4705', '4711', '4712')
  }

  if (gamme === 'CR4') {
    if (col === 'serrure') return set('4120', '4122', '4126', '4128', '4140', '4142', '4146', '4148', ...(tall ? ['4190', '4191', '4192', '4193', '4194', '4195', '4201', '4203'] : []))
    if (col === 'garniture_int') return set('4180', '4181', '4211', '4219')
    if (col === 'garniture_ext') return set('4032', '4211', '4219')
    if (col === 'cremone') return set('4401', '4402', '4337')
    if (col === 'judas') return set(...CR4_JUDAS)
    if (col === 'vitrage') return set(...CR4_VITRAGE)
    if (col === 'divers' || col === 'autres') return set()
    if (col === 'ventouse') return set('3921', '3922')
    if (col === 'protection') return set('4496', '4497')
    if (col === 'trappe') return set('4702', '4705', '4711', '4712')
  }

  if (gamme === 'CR3') {
    if (col === 'trappe') return set('4702', '4705', '4711', '4712')
    if (col === 'ventouse') return set('3921', '3922')
    if (col === 'protection') return set('4496', '4497')
    if (col === 'judas' || col === 'vitrage') return null // use full matrix
  }

  if (gamme === 'FB4' || gamme === 'FB6' || gamme === 'FB7') {
    if (col === 'serrure') return set('4070', '4072', '4074', '4076', ...FB_SERRURE_EXTRA)
    if (col === 'garniture_int') return set(...FB_GARN_INT)
    if (col === 'garniture_ext') return set(...FB_GARN_INT)
    if (col === 'fp') return set(...FB_FP)
    if (col === 'judas') return set('4455', '4456', '4458', '4459')
    if (col === 'vitrage') return set(...CR4_VITRAGE)
    if (col === 'ventouse') return set('3921', '3922')
    if (col === 'protection') return set('4496', '4497')
  }

  if (gamme === 'EI30' || gamme === 'EI60' || gamme === 'EI90' || gamme === 'EI120') {
    if (col === 'garniture_int' || col === 'garniture_ext') {
      const base = set('4024', '4025', '4026', '4027', '4022', '4023', '4095', '4096', '4097', '4098', '4018', '4019', '4211', '4219')
      if (tall) ['4192', '4193', '4194', '4195'].forEach((r) => base.add(r))
      return base
    }
    if (col === 'serrure' && tall) return set('4192', '4193', '4194', '4195')
    if (col === 'judas') return null
    if (col === 'vitrage') return set(...CR4_VITRAGE)
    if (col === 'ventouse') return set('3921', '3922')
    if (col === 'protection') return set('4496', '4497')
  }

  if (gamme === 'BLAST') {
    if (col === 'serrure') return set(...BLAST_SERRURE, ...(tall ? BLAST_SERRURE_TALL : []))
    if (col === 'garniture_int') return set('4181', '4032')
    if (col === 'garniture_ext') return set('4032')
    if (col === 'cremone') return set('4401', '4402') // 4405/4406 removed
    if (col === 'vitrage') return set(...CR4_VITRAGE)
    if (col === 'ventouse') return set('3921', '3922')
    if (col === 'protection') return set('4496', '4497')
  }

  if (gamme === 'ANTI-BELIER' || gamme === 'PRISON') {
    if (col === 'ventouse') return set('3921', '3922')
    if (col === 'trappe') return set('4702', '4705', '4711', '4712')
  }

  return null
}

/** Resolve tariff tab from row fields and grid _raw slots (Arthur grids often store CR5 in _raw[3]). */
export function resolveRowGamme(row = {}) {
  const direct = resolveGammePrimaryPerformance(row?.gamme || row?.gamme_label || row?.type || row?.designation || '')
  if (direct) return direct
  if (Array.isArray(row?._raw)) {
    for (const cell of row._raw) {
      const perf = resolveGammePrimaryPerformance(String(cell ?? ''))
      if (perf) return perf
    }
  }
  return null
}

const BLOCKED_REFS = new Set(['4405', '4406', '4185', '4091', '4092', '4093', '4094'])

export function injectStaticEquipmentOptions(options, row, gridColumn) {
  const gamme = resolveRowGamme(row)
  if (!gamme) return options
  const col = gridColumn || null
  const merged = [...options]
  const existing = new Set(options.map((o) => extractRef(o.ref || o.designation)))
  for (const entry of STATIC_EQUIPMENT_ENTRIES) {
    if (col && entry.grid_column !== col && entry.slot !== col) continue
    if (!entry.performances.includes(gamme)) continue
    if (existing.has(entry.ref)) continue
    merged.push({
      ref: entry.ref,
      designation: entry.designation,
      label: entry.designation,
      price_ht: entry.price_ht,
      grid_column: entry.grid_column,
      slot: entry.slot,
      performances: entry.performances,
      source: 'arthur_a1_static',
      active: true,
    })
  }
  return merged
}

/**
 * Filter equipment options per Arthur A1 rules.
 * @param {object[]} options
 * @param {object} row
 * @param {string|null} gridColumn
 */
export function filterEquipmentOptionsByArthurRules(options, row, gridColumn) {
  const gamme = resolveRowGamme(row)
  const heightHt = rowHeightHt(row)
  const col = gridColumn || null

  let filtered = options.filter((opt) => {
    const ref = extractRef(opt.ref || opt.designation || opt.label)
    const label = `${opt.label || ''} ${opt.designation || ''}`
    if (ref && BLOCKED_REFS.has(ref)) return false
    if (ref === '4450' && col && col !== 'judas') return false
    if (ref === '4452' && col && col !== 'judas') return false
    if (col === 'judas' && /oculus|vitrage|remplissage/i.test(label) && !/judas|oeilleton|œilleton/i.test(label)) return false
    if (col === 'vitrage' && /judas|oeilleton|œilleton/i.test(label) && !/oculus|vitrage|remplissage/i.test(label)) return false
    if (gamme === 'CR5' && col === 'vitrage' && ref && CR4_VITRAGE.includes(ref)) return false
    if (gamme === 'CR4' && col === 'vitrage' && ref && CR5_VITRAGE.includes(ref)) return false
    if (gamme === 'CR5' && col === 'judas' && ref && ['4450', '4452'].includes(ref)) return false
    return true
  })

  if (!gamme) return filtered

  const allowed = whitelistFor(gamme, col, heightHt)
  if (allowed === null) return filtered
  if (allowed.size === 0 && ['garniture_ext', 'cremone', 'divers', 'autres', 'vitrage'].includes(col)) return []

  return filtered.filter((opt) => {
    const ref = extractRef(opt.ref || opt.designation || opt.label)
    if (!ref) return true
    return allowed.has(ref)
  })
}

/** Judas and vitrage use separate whitelists (Arthur 25/06/2026). */
export function resolveEquipmentGridColumn(gridColumn) {
  if (gridColumn === 'trappes') return 'trappe'
  if (gridColumn === 'passeCable') return 'passeCable'
  if (gridColumn === 'plinthes') return 'plinthe'
  return gridColumn
}
