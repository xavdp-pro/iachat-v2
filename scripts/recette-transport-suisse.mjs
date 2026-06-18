#!/usr/bin/env node
/**
 * Recette transport Suisse — 3 lignes produits + poids + zone tarifaire.
 * Usage: node scripts/recette-transport-suisse.mjs
 */
import '../server/env.js'
import db from '../server/db/index.js'
import { getSetting, KEY_WEIGHT_VITRAGE_KG_M2 } from '../server/services/appSettings.js'
import { calculateDevisWeight } from '../server/services/weight-calculator.js'

const SWISS_ADDRESS = 'AAV Contractors SA\nChemin du Tourbillon 6\n1228 Plan-les-Ouates\nSuisse'

const PRODUCT_LINES = [
  {
    line_section: 'products',
    designation: 'NEXUS CR4 — 1 VANTAIL',
    gamme: 'CR4',
    vantail: '1V',
    haut_mm: 2180,
    larg_mm: 960,
    qty: 1,
    localisation: 'Type 1',
  },
  {
    line_section: 'products',
    designation: 'NEXUS CR3 — 2 VANTAUX',
    gamme: 'CR3',
    vantail: '2V',
    haut_mm: 2779,
    larg_mm: 2024,
    qty: 1,
    localisation: 'Type 2',
  },
  {
    line_section: 'products',
    designation: 'NEXUS CR6 — 1 VANTAIL',
    gamme: 'CR6',
    vantail: '1V',
    haut_mm: 2300,
    larg_mm: 1150,
    qty: 1,
    localisation: 'Type 3',
  },
]

function transportTrancheCount(leafCount) {
  const value = Number.parseInt(leafCount, 10)
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.max(1, Math.ceil(value / 50))
}

function productLeafCount(rows = []) {
  return rows.filter(row => (row.line_section || 'products') === 'products').length
}

async function matchTransport({ weight_kg, country = 'ch', canton = 'GE', postal_code = '1228', leaf_count }) {
  const trancheCount = transportTrancheCount(leaf_count)
  const weight = weight_kg != null ? Number(weight_kg) : null
  const [rows] = await db.query(
    `SELECT * FROM transport_tariffs
     WHERE active = 1
       AND (? IS NULL OR min_weight_kg IS NULL OR min_weight_kg <= ?)
       AND (? IS NULL OR max_weight_kg IS NULL OR max_weight_kg >= ?)
     ORDER BY sort_order ASC, max_weight_kg ASC, price_ht ASC, id ASC`,
    [weight, weight, weight, weight]
  )
  const filtered = rows.filter(row => {
    const countries = String(row.covered_countries || '').toLowerCase()
    const cantons = String(row.canton_codes || '').toUpperCase().split(/[^A-Z]+/).filter(Boolean)
    const cantonOk = !canton || cantons.includes(canton)
    const countryOk = !country || !row.country || String(row.country).toLowerCase() === country || countries.includes(country)
    const postalOk = !postal_code || !row.postal_prefix || String(postal_code).startsWith(String(row.postal_prefix))
    return cantonOk && countryOk && postalOk
  })
  const selected = filtered[0] || null
  if (!selected) return { tariff: null, candidates: filtered, tranche_count: trancheCount }
  return {
    tariff: {
      ...selected,
      unit_price_ht: Number(selected.price_ht) || 0,
      tranche_count: trancheCount,
      leaf_count,
      total_price_ht: (Number(selected.price_ht) || 0) * trancheCount,
    },
    candidates: filtered,
    tranche_count: trancheCount,
  }
}

function pass(label, ok, detail = '') {
  const icon = ok ? '✓' : '✗'
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function main() {
  const [profiles] = await db.query(
    'SELECT * FROM door_weight_profiles WHERE active = 1 ORDER BY sort_order ASC, id ASC'
  )
  const vitrageRaw = await getSetting(KEY_WEIGHT_VITRAGE_KG_M2)
  const vitrageKgM2 = vitrageRaw != null && vitrageRaw !== '' ? Number(String(vitrageRaw).replace(',', '.')) : null

  const weightRows = PRODUCT_LINES.map(row => ({
    gamme: row.gamme,
    vantail: row.vantail,
    haut_mm: row.haut_mm,
    larg_mm: row.larg_mm,
    qty: row.qty,
    designation: row.designation,
    line_section: 'products',
  }))

  const weightResult = calculateDevisWeight(weightRows, profiles, { vitrage_kg_m2: vitrageKgM2 })
  const leafCount = productLeafCount(PRODUCT_LINES)
  const transport = await matchTransport({
    weight_kg: weightResult.total_kg,
    country: 'ch',
    canton: 'GE',
    postal_code: '1228',
    leaf_count: leafCount,
  })

  console.log('\n=== Recette transport Suisse ===\n')
  console.log(`Adresse : ${SWISS_ADDRESS.replace(/\n/g, ', ')}`)
  console.log(`Lignes produits : ${leafCount}`)
  console.log(`Poids total estimé : ${weightResult.total_kg ?? '—'} kg`)
  for (const line of weightResult.lines || []) {
    console.log(`  - ${line.gamme || '?'} ${line.vantail || ''} : ${line.weight_kg ?? '—'} kg`)
  }

  if (transport.tariff) {
    console.log(`\nTarif retenu : ${transport.tariff.label || transport.tariff.zone}`)
    console.log(`Zone : ${transport.tariff.zone || '—'}`)
    console.log(`PU HT : ${transport.tariff.unit_price_ht} ${transport.tariff.currency || 'EUR'}`)
    console.log(`Tranches (${transport.tranche_count}) : total ${transport.tariff.total_price_ht} HT`)
  } else {
    console.log('\nAucun tarif transport trouvé pour cette adresse/poids.')
    console.log(`Candidats après filtre poids : ${transport.candidates.length}`)
  }

  console.log('\n--- Contrôles ---')
  let ok = true
  ok = pass('3 lignes produits', PRODUCT_LINES.length === 3, `${PRODUCT_LINES.length} lignes`) && ok
  ok = pass('Profils poids chargés', profiles.length > 0, `${profiles.length} profils`) && ok
  ok = pass('Poids total > 0', Number(weightResult.total_kg) > 0, `${weightResult.total_kg} kg`) && ok
  ok = pass('Tarif Suisse trouvé', Boolean(transport.tariff), transport.tariff?.zone || 'aucun') && ok
  if (transport.tariff) {
    ok = pass('Prix transport > 0', Number(transport.tariff.total_price_ht) > 0, `${transport.tariff.total_price_ht} HT`) && ok
  }

  console.log(ok ? '\nRecette OK\n' : '\nRecette ÉCHEC — vérifier tarifs transport / profils poids\n')
  process.exit(ok ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
