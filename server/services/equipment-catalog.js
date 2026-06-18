/**
 * Performance equipment catalog — DB + XLSX import (Equipements de portes - CR*.xlsx).
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import db from '../db/index.js'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const NEW_XLSX_DIR = join(__dirname, '../../../ressources/XLSX/2606/NEW')

export const GRID_COLUMNS = [
  { id: 'serrure', label: 'Serrure' },
  { id: 'garniture_int', label: 'Garniture int.' },
  { id: 'garniture_ext', label: 'Garniture ext.' },
  { id: 'cremone', label: 'Crémones' },
  { id: 'fp', label: 'Ferme-porte' },
  { id: 'contact', label: 'Contact' },
  { id: 'plinthe', label: 'Plinthe' },
  { id: 'vitrage', label: 'Vitrage' },
  { id: 'protection', label: 'Protection' },
  { id: 'options_serrure', label: 'Options serrure' },
  { id: 'autres', label: 'Autre équipement' },
]

export function slotFromGridColumn(gridColumn = '') {
  const col = String(gridColumn || '')
  if (col === 'garniture_int' || col === 'garniture_ext') return 'garniture'
  if (col === 'plinthe') return 'plinthes'
  if (col === 'protection' || col === 'options_serrure' || col === 'autres') return 'autres'
  return col
}

const PARSE_XLSX_PY = `
import json, re, sys
from pathlib import Path
import openpyxl

path = Path(sys.argv[1])
performance = sys.argv[2]

def norm_header(value):
    import unicodedata
    text = unicodedata.normalize('NFD', str(value or ''))
    text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
    return re.sub(r'\\s+', ' ', text).strip().lower()

COLUMN_MAP = {
    'serrure': 'serrure',
    'garniture int.': 'garniture_int',
    'garniture ext.': 'garniture_ext',
    'garniture ext': 'garniture_ext',
    'cremones': 'cremone',
    'crémones': 'cremone',
    'ferme-porte': 'fp',
    'contact': 'contact',
    'plinthe': 'plinthe',
    'vitrage': 'vitrage',
    'protection': 'protection',
    'options serrure': 'options_serrure',
    'autre equipement': 'autres',
    'autre équipement': 'autres',
}

def clean_ref(value):
    text = str(value or '').strip()
    if not text or text in ('_', '—'):
        return None
    m = re.search(r'\\b([A-Z]?\\d{3,4}[A-Z]?)\\b', text, re.I)
    return m.group(1).upper() if m else None

def clean_label(value):
    text = str(value or '').strip()
    if not text or text in ('_', '—'):
        return ''
    return text

wb = openpyxl.load_workbook(path, data_only=True)
ws = wb.active
pairs = []
for c in range(1, ws.max_column):
    h1 = ws.cell(1, c).value
    h2 = ws.cell(1, c + 1).value if c + 1 <= ws.max_column else None
    if norm_header(h1) != 'ref.':
        continue
    col_name = COLUMN_MAP.get(norm_header(h2 or ''))
    if not col_name:
        continue
    pairs.append((c, c + 1, col_name))

items = []
sort_order = 0
for r in range(2, ws.max_row + 1):
    for ref_col, label_col, grid_column in pairs:
        ref = clean_ref(ws.cell(r, ref_col).value)
        label = clean_label(ws.cell(r, label_col).value)
        if not label and not ref:
            continue
        if not ref and label:
            items.append({
                'performance': performance,
                'grid_column': grid_column,
                'ref': None,
                'label': label,
                'row_kind': 'section',
                'sort_order': sort_order,
            })
            sort_order += 1
            continue
        if not label:
            continue
        items.append({
            'performance': performance,
            'grid_column': grid_column,
            'ref': ref,
            'label': label,
            'row_kind': 'item',
            'sort_order': sort_order,
        })
        sort_order += 1

print(json.dumps(items, ensure_ascii=False))
`

export async function parseEquipmentXlsx(filePath, performance) {
  const { stdout } = await execFileAsync('python3', ['-c', PARSE_XLSX_PY, filePath, performance], {
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30000,
  })
  const rows = JSON.parse(stdout || '[]')
  return Array.isArray(rows) ? rows : []
}

export function defaultImportPath(performance) {
  const perf = String(performance || '').toUpperCase().replace(/^RC/, 'CR')
  return join(NEW_XLSX_DIR, `Equipements de portes - ${perf}.xlsx`)
}

let dbCatalogCache = { value: null, expiresAt: 0 }

export function clearEquipmentDbCatalogCache() {
  dbCatalogCache = { value: null, expiresAt: 0 }
}

export async function loadDbEquipmentCatalog({ performance = null, activeOnly = true } = {}) {
  const now = Date.now()
  if (!performance && dbCatalogCache.value && dbCatalogCache.expiresAt > now) {
    return dbCatalogCache.value
  }
  const clauses = []
  const params = []
  if (activeOnly) clauses.push('active = 1')
  if (performance) {
    clauses.push('performance = ?')
    params.push(String(performance).toUpperCase().replace(/^RC/, 'CR'))
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const [rows] = await db.query(
    `SELECT * FROM door_equipment_items ${where} ORDER BY performance ASC, grid_column ASC, sort_order ASC, id ASC`,
    params
  )
  if (!performance) {
    dbCatalogCache = { value: rows, expiresAt: now + 30000 }
  }
  return rows
}

export function dbRowsToCatalogEntries(rows = []) {
  return rows
    .filter(row => row.row_kind !== 'section' && row.active !== 0)
    .map(row => ({
      designation: row.label,
      ref: row.ref || '',
      price_ht: row.price_ht != null ? Number(row.price_ht) : null,
      price_label: row.price_ht != null ? `${Number(row.price_ht).toLocaleString('fr-FR')} € HT` : 'prix tarif',
      family: `Matrice ${row.performance}`,
      source: row.source_file || `door_equipment_items#${row.id}`,
      slot: slotFromGridColumn(row.grid_column),
      grid_column: row.grid_column,
      performances: [String(row.performance).toUpperCase().replace(/^RC/, 'CR')],
      section_label: row.section_label || null,
      active: row.active !== 0,
      sort_order: row.sort_order || 0,
    }))
    .filter(entry => entry.ref || entry.designation)
}

export async function importEquipmentFromXlsx(performance, { filePath = null, replace = true } = {}) {
  const perf = String(performance || '').toUpperCase().replace(/^RC/, 'CR')
  const path = filePath || defaultImportPath(perf)
  const parsed = await parseEquipmentXlsx(path, perf)
  if (!parsed.length) {
    throw new Error(`Aucune ligne importée depuis ${path}`)
  }

  let sectionByColumn = {}
  const normalized = parsed.map((row, index) => {
    if (row.row_kind === 'section') {
      sectionByColumn[row.grid_column] = row.label
      return { ...row, section_label: row.label, sort_order: row.sort_order ?? index }
    }
    return {
      ...row,
      section_label: sectionByColumn[row.grid_column] || null,
      sort_order: row.sort_order ?? index,
    }
  })

  if (replace) {
    await db.query('DELETE FROM door_equipment_items WHERE performance = ?', [perf])
  }

  for (const row of normalized) {
    await db.query(
      `INSERT INTO door_equipment_items
       (performance, grid_column, ref, label, section_label, row_kind, sort_order, active, source_file, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        perf,
        row.grid_column,
        row.ref || null,
        row.label,
        row.section_label || null,
        row.row_kind === 'section' ? 'section' : 'item',
        row.sort_order ?? 0,
        path,
        replace ? 'Import XLSX admin' : null,
      ]
    )
  }

  clearEquipmentDbCatalogCache()
  return { performance: perf, count: normalized.length, file: path }
}

export async function seedDefaultEquipmentImports({ force = false } = {}) {
  const [countRows] = await db.query('SELECT COUNT(*) AS count FROM door_equipment_items')
  if (!force && Number(countRows[0]?.count || 0) > 0) return { skipped: true }
  const results = []
  for (const perf of DEFAULT_EQUIPMENT_PERFORMANCES) {
    try {
      results.push(await importEquipmentFromXlsx(perf, { replace: force || Number(countRows[0]?.count || 0) === 0 }))
    } catch (err) {
      results.push({ performance: perf, error: err.message })
    }
  }
  return { skipped: false, results }
}

export const DEFAULT_EQUIPMENT_PERFORMANCES = ['CR3', 'CR4', 'CR5', 'CR6', 'EI30', 'EI60', 'EI120', 'FB4', 'FB6', 'FB7', 'BLAST', 'PRISON', 'ANTI-BELIER', 'EF2']

export const BOOTSTRAP_EQUIPMENT_PERFORMANCES = ['CR5', 'CR6', 'EI30', 'EI60', 'EI120', 'FB4', 'FB6', 'FB7', 'BLAST', 'PRISON', 'ANTI-BELIER', 'EF2']
