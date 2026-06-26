#!/usr/bin/env node
/**
 * Audit equipment-options per gamme × column (vitrage focus).
 * Usage: node scripts/audit-equipment-options.mjs
 */
import '../server/env.js'
import db from '../server/db/index.js'
import { loadDbEquipmentCatalog, dbRowsToCatalogEntries } from '../server/services/equipment-catalog.js'
import {
  injectStaticEquipmentOptions,
  filterEquipmentOptionsByArthurRules,
  resolveEquipmentGridColumn,
} from '../server/lib/equipment-gamme-rules.js'
import {
  EQUIPMENT_CATALOG_PRIORITY,
  EQUIPMENT_MATRIX_ALIASES,
  resolveEquipmentCatalogPerformance,
  resolveGammePrimaryPerformance,
} from '../server/lib/equipmentPerformance.js'
import { collectLinePerformances } from '../server/lib/performanceCompatibility.js'

const COLUMNS = [
  'serrure', 'garniture_int', 'garniture_ext', 'vitrage', 'judas',
  'fp', 'cremone', 'plinthe', 'passeCable', 'ventouse', 'protection', 'trappe', 'autres',
]

const SCENARIOS = [
  { label: 'CR5', row: { gamme: 'CR5', designation: 'BP 1V CR5', _raw: ['BP', '1V', 2300, 1150, 'CR5'] } },
  { label: 'CR6', row: { gamme: 'CR6', designation: 'BP 1V CR6', _raw: ['BP', '1V', 2300, 1150, 'CR6'] } },
  { label: 'CR4', row: { gamme: 'CR4', designation: 'BP 1V CR4', _raw: ['BP', '1V', 2300, 1150, 'CR4'] } },
  { label: 'CR4+EI60', row: { gamme: 'CR4', cf: 'EI60', designation: 'BP CR4 EI60', _raw: ['BP', '1V', 2300, 1150, 'CR4', 'EI60'] } },
  { label: 'EI90', row: { gamme: 'EI90', cf: 'EI90', designation: 'BP EI90', _raw: ['BP', '1V', 2300, 1150, 'EI90'] } },
  { label: 'EI60', row: { gamme: 'EI60', cf: 'EI60', designation: 'BP EI60', _raw: ['BP', '1V', 2300, 1150, 'EI60'] } },
  { label: 'FB4', row: { gamme: 'FB4', pb: 'FB4', designation: 'BP FB4', _raw: ['BP', '1V', 2300, 1150, '', 'FB4'] } },
  { label: 'BLAST', row: { gamme: 'BLAST', blast: 'BLAST', designation: 'BP BLAST', _raw: ['BP', '1V', 2300, 1150, '', '', 'BLAST'] } },
  { label: 'Châssis CR4', row: { type: 'Châssis', gamme: 'CR4', designation: 'Châssis fixe CR4', _raw: ['CH', '1V', 2300, 1150, 'CR4'] } },
]

async function listDbPerfs() {
  const [rows] = await db.query('SELECT DISTINCT performance FROM door_equipment_items WHERE active = 1')
  return rows.map((r) => String(r.performance).toUpperCase())
}

async function loadMatrixCatalog(row) {
  const rowPerfs = [...collectLinePerformances(row)]
  const available = await listDbPerfs()
  const availableSet = new Set(available)
  const gammeText = row.gamme || ''
  const candidates = []
  const push = (p) => {
    const key = String(p || '').toUpperCase().replace(/^RC/, 'CR')
    if (key && !candidates.includes(key)) candidates.push(key)
  }
  const primary = resolveGammePrimaryPerformance(gammeText)
  if (primary) push(primary)
  for (const perf of EQUIPMENT_CATALOG_PRIORITY) {
    if (rowPerfs.includes(perf)) push(perf)
  }
  for (const perf of rowPerfs) push(perf)

  for (const perf of candidates) {
    let matrixPerf = perf
    if (!availableSet.has(matrixPerf)) {
      const alias = EQUIPMENT_MATRIX_ALIASES[matrixPerf]
      if (alias && availableSet.has(alias)) matrixPerf = alias
      else continue
    }
    const entries = dbRowsToCatalogEntries(await loadDbEquipmentCatalog({ performance: matrixPerf }))
    if (entries.length) return { entries, matrixPerf, rowPerfs }
  }
  return { entries: [], matrixPerf: resolveEquipmentCatalogPerformance(rowPerfs, available, gammeText), rowPerfs }
}

async function optionsFor(row, gridColumn) {
  const { entries, matrixPerf } = await loadMatrixCatalog(row)
  const catalogColumn = resolveEquipmentGridColumn(gridColumn)
  let options = entries.map((e) => ({
    ref: e.ref,
    label: e.designation,
    designation: e.designation,
    slot: e.slot,
    grid_column: e.grid_column,
  }))
  if (catalogColumn) {
    options = options.filter((entry) => {
      if (catalogColumn === 'judas') {
        return entry.grid_column === 'judas' || entry.slot === 'judas'
          || /judas|oeilleton/i.test(`${entry.label || ''}`)
      }
      if (catalogColumn === 'vitrage') {
        return entry.grid_column === 'vitrage' || entry.slot === 'vitrage'
          || /vitrage|oculus|remplissage/i.test(`${entry.label || ''}`)
      }
      if (catalogColumn === 'passeCable') {
        return entry.slot === 'passeCable' || /passe[\s-]?câble/i.test(`${entry.label || ''}`)
      }
      return entry.grid_column === catalogColumn || entry.slot === catalogColumn || entry.slot === gridColumn
    })
  }
  options = injectStaticEquipmentOptions(options, row, gridColumn || catalogColumn)
  options = filterEquipmentOptionsByArthurRules(options, row, gridColumn || catalogColumn)
  return {
    matrixPerf,
    count: options.length,
    refs: [...new Set(options.map((o) => o.ref).filter(Boolean))],
  }
}

const issues = []
console.log('=== Audit équipements (vitrage + colonnes critiques) ===\n')
for (const scenario of SCENARIOS) {
  const vitrage = await optionsFor(scenario.row, 'vitrage')
  const serrure = await optionsFor(scenario.row, 'serrure')
  const judas = await optionsFor(scenario.row, 'judas')
  const fp = await optionsFor(scenario.row, 'fp')
  console.log(`${scenario.label} [${vitrage.matrixPerf}]`)
  console.log(`  vitrage: ${vitrage.count} (${vitrage.refs.join(', ') || '—'})`)
  console.log(`  serrure: ${serrure.count} | judas: ${judas.count} | fp: ${fp.count}`)
  if (!vitrage.count) issues.push(`${scenario.label}/vitrage`)
  if (!serrure.count) issues.push(`${scenario.label}/serrure`)
}

if (issues.length) {
  console.log(`\n⚠️  Colonnes vides: ${issues.join(', ')}`)
  process.exit(1)
}
console.log('\n✅ Tous les scénarios ont au moins 1 vitrage et 1 serrure.')
process.exit(0)
