#!/usr/bin/env node
/**
 * Recette matrice équipements CR4 — vérifie que le catalogue DB est peuplé colonne par colonne.
 * Usage: npm run test:equipment-cr4
 */
import '../server/env.js'
import { loadDbEquipmentCatalog, dbRowsToCatalogEntries, GRID_COLUMNS } from '../server/services/equipment-catalog.js'

const PERFORMANCE = 'CR4'

const dbRows = await loadDbEquipmentCatalog({ performance: PERFORMANCE })
const entries = dbRowsToCatalogEntries(dbRows)
if (!entries.length) {
  console.error(JSON.stringify({ ok: false, error: `Aucun équipement CR4 en base — lancer l'import admin` }, null, 2))
  process.exit(1)
}

const knownColumns = new Set(GRID_COLUMNS.map(col => col.id))
const summary = {}
const violations = []

for (const column of GRID_COLUMNS) {
  const columnEntries = entries.filter(entry => entry.grid_column === column.id)
  const refs = columnEntries.map(entry => String(entry.ref || '').toUpperCase()).filter(Boolean)
  summary[column.id] = { items: columnEntries.length, refs: refs.length }
  if (!columnEntries.length) {
    violations.push({ column: column.id, type: 'empty_column' })
  }
}

for (const entry of entries) {
  if (!knownColumns.has(entry.grid_column)) {
    violations.push({ type: 'unknown_column', grid_column: entry.grid_column, ref: entry.ref })
  }
  if (!entry.ref && !entry.designation) {
    violations.push({ type: 'missing_ref_and_label', grid_column: entry.grid_column })
  }
}

const crossColumnDupes = new Map()
for (const entry of entries) {
  const ref = String(entry.ref || '').toUpperCase()
  if (!ref) continue
  const list = crossColumnDupes.get(ref) || []
  list.push(entry.grid_column)
  crossColumnDupes.set(ref, list)
}
const duplicateRefs = [...crossColumnDupes.entries()]
  .filter(([, columns]) => new Set(columns).size > 1)
  .slice(0, 10)
  .map(([ref, columns]) => ({ ref, columns: [...new Set(columns)] }))

const ok = violations.length === 0
console.log(JSON.stringify({
  ok,
  performance: PERFORMANCE,
  total_entries: entries.length,
  columns: summary,
  duplicate_refs_across_columns: duplicateRefs,
  note: duplicateRefs.length ? 'Certaines refs apparaissent dans plusieurs colonnes (ex. garnitures) — informatif seulement' : null,
  violations,
}, null, 2))
process.exit(ok ? 0 : 1)
