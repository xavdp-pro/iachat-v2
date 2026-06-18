#!/usr/bin/env node
/**
 * Recette matrices équipements — vérifie le catalogue DB par performance.
 * Usage:
 *   npm run test:equipment-matrix
 *   node scripts/test-equipment-matrix.mjs CR3 CR4
 */
import '../server/env.js'
import { loadDbEquipmentCatalog, dbRowsToCatalogEntries, GRID_COLUMNS, DEFAULT_EQUIPMENT_PERFORMANCES } from '../server/services/equipment-catalog.js'

const OPTIONAL_EMPTY_COLUMNS = {
  PRISON: new Set(['garniture_int']),
}

const performances = process.argv.includes('--all')
  ? DEFAULT_EQUIPMENT_PERFORMANCES
  : process.argv.slice(2).length
    ? process.argv.slice(2).map(p => String(p).toUpperCase().replace(/^RC/, 'CR'))
    : ['CR3', 'CR4']

const report = { ok: true, performances: {} }

for (const performance of performances) {
  const dbRows = await loadDbEquipmentCatalog({ performance })
  const entries = dbRowsToCatalogEntries(dbRows)
  const knownColumns = new Set(GRID_COLUMNS.map(col => col.id))
  const summary = {}
  const violations = []

  for (const column of GRID_COLUMNS) {
    const columnEntries = entries.filter(entry => entry.grid_column === column.id)
    summary[column.id] = {
      items: columnEntries.length,
      refs: columnEntries.filter(entry => entry.ref).length,
    }
    if (!columnEntries.length) {
      const optional = OPTIONAL_EMPTY_COLUMNS[performance]
      if (optional?.has(column.id)) continue
      violations.push({ column: column.id, type: 'empty_column' })
    }
  }

  for (const entry of entries) {
    if (!knownColumns.has(entry.grid_column)) {
      violations.push({ type: 'unknown_column', grid_column: entry.grid_column, ref: entry.ref })
    }
  }

  if (!entries.length) {
    report.performances[performance] = {
      ok: true,
      skipped: true,
      reason: 'catalog_empty',
      total_entries: 0,
      columns: summary,
      violations: [],
    }
    continue
  }

  report.performances[performance] = {
    ok: violations.length === 0 && entries.length > 0,
    total_entries: entries.length,
    columns: summary,
    violations,
  }
  if (!report.performances[performance].ok) report.ok = false
}

console.log(JSON.stringify(report, null, 2))
process.exit(report.ok ? 0 : 1)
