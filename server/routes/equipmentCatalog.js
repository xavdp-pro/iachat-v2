import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import db from '../db/index.js'
import {
  GRID_COLUMNS,
  clearEquipmentDbCatalogCache,
  defaultImportPath,
  importEquipmentFromXlsx,
  loadDbEquipmentCatalog,
  seedDefaultEquipmentImports,
} from '../services/equipment-catalog.js'

const router = Router()

const editableFields = [
  'performance', 'grid_column', 'ref', 'label', 'section_label',
  'row_kind', 'sort_order', 'price_ht', 'active', 'notes',
]

function normalizePerformance(value = '') {
  return String(value || '').trim().toUpperCase().replace(/^RC/, 'CR')
}

function normalizePayload(body = {}) {
  const payload = {}
  for (const field of editableFields) {
    if (body[field] === undefined) continue
    if (field === 'price_ht') {
      if (body[field] === '' || body[field] == null) {
        payload[field] = null
        continue
      }
      const value = Number(String(body[field]).replace(',', '.'))
      payload[field] = Number.isFinite(value) ? value : null
    } else if (field === 'sort_order') {
      const value = Number.parseInt(body[field], 10)
      payload[field] = Number.isFinite(value) ? value : 0
    } else if (field === 'active') {
      payload[field] = body[field] ? 1 : 0
    } else if (field === 'performance') {
      payload[field] = normalizePerformance(body[field])
    } else if (field === 'row_kind') {
      payload[field] = body[field] === 'section' ? 'section' : 'item'
    } else if (field === 'grid_column') {
      payload[field] = String(body[field] || 'autres')
    } else {
      payload[field] = body[field] === '' ? null : body[field]
    }
  }
  return payload
}

router.use(authenticate)

router.get('/meta', (_req, res) => {
  res.json({ columns: GRID_COLUMNS })
})

router.get('/', async (req, res) => {
  try {
    const performance = req.query.performance ? normalizePerformance(req.query.performance) : null
    const gridColumn = req.query.grid_column ? String(req.query.grid_column) : null
    const rows = await loadDbEquipmentCatalog({ performance, activeOnly: false })
    const filtered = gridColumn ? rows.filter(row => row.grid_column === gridColumn) : rows
    res.json(filtered)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/performances', async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT performance, COUNT(*) AS count, SUM(active = 1) AS active_count
       FROM door_equipment_items
       GROUP BY performance
       ORDER BY performance ASC`
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/seed-defaults', requireAdmin, async (req, res) => {
  try {
    const force = req.body?.force === true || req.query?.force === 'true'
    const result = await seedDefaultEquipmentImports({ force })
    res.status(result.skipped ? 200 : 201).json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/reimport-all', requireAdmin, async (_req, res) => {
  try {
    const result = await seedDefaultEquipmentImports({ force: true })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/import', requireAdmin, async (req, res) => {
  const performance = normalizePerformance(req.body?.performance)
  if (!performance) return res.status(400).json({ error: 'performance requise (ex. CR4)' })
  const replace = req.body?.replace !== false
  const filePath = req.body?.file_path || defaultImportPath(performance)
  try {
    const result = await importEquipmentFromXlsx(performance, { filePath, replace })
    res.status(201).json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireAdmin, async (req, res) => {
  const payload = normalizePayload(req.body)
  if (!payload.performance) return res.status(400).json({ error: 'performance requise' })
  if (!payload.label) return res.status(400).json({ error: 'label requis' })
  if (!payload.grid_column) payload.grid_column = 'autres'
  try {
    const fields = Object.keys(payload)
    const placeholders = fields.map(() => '?').join(', ')
    const [result] = await db.query(
      `INSERT INTO door_equipment_items (${fields.join(', ')}) VALUES (${placeholders})`,
      fields.map(field => payload[field])
    )
    clearEquipmentDbCatalogCache()
    const [rows] = await db.query('SELECT * FROM door_equipment_items WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', requireAdmin, async (req, res) => {
  const payload = normalizePayload(req.body)
  const fields = Object.keys(payload)
  if (!fields.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  try {
    await db.query(
      `UPDATE door_equipment_items SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map(field => payload[field]), req.params.id]
    )
    clearEquipmentDbCatalogCache()
    const [rows] = await db.query('SELECT * FROM door_equipment_items WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Équipement introuvable' })
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM door_equipment_items WHERE id = ?', [req.params.id])
    clearEquipmentDbCatalogCache()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
