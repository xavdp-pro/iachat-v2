import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import db from '../db/index.js'

const router = Router()
router.use(authenticate)

const editableFields = [
  'label', 'zone', 'country', 'postal_prefix',
  'canton_codes', 'covered_countries',
  'min_weight_kg', 'max_weight_kg',
  'max_length_mm', 'max_width_mm', 'max_height_mm',
  'price_ht', 'currency', 'active', 'sort_order', 'notes',
]

function normalizePayload(body = {}) {
  const payload = {}
  for (const field of editableFields) {
    if (body[field] === undefined) continue
    if (['min_weight_kg', 'max_weight_kg', 'price_ht'].includes(field)) {
      if (body[field] === '' && field !== 'price_ht') {
        payload[field] = null
        continue
      }
      const value = Number(String(body[field]).replace(',', '.'))
      payload[field] = Number.isFinite(value) ? value : null
    } else if (['max_length_mm', 'max_width_mm', 'max_height_mm', 'sort_order'].includes(field)) {
      const value = Number.parseInt(body[field], 10)
      payload[field] = Number.isFinite(value) ? value : null
    } else if (field === 'active') {
      payload[field] = body[field] ? 1 : 0
    } else if (field === 'currency') {
      payload[field] = String(body[field] || 'EUR').slice(0, 3).toUpperCase()
    } else {
      payload[field] = body[field] === '' ? null : body[field]
    }
  }
  return payload
}

function transportTrancheCount(leafCount) {
  const value = Number.parseInt(leafCount, 10)
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.max(1, Math.ceil(value / 50))
}

router.get('/', async (_req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM transport_tariffs ORDER BY active DESC, sort_order ASC, zone ASC, max_weight_kg ASC, id ASC'
    )
    res.json(rows)
  } catch (err) {
    console.error('transport tariffs list error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  const payload = normalizePayload(req.body)
  if (!payload.label) return res.status(400).json({ error: 'label requis' })
  try {
    const fields = Object.keys(payload)
    const placeholders = fields.map(() => '?').join(', ')
    const [result] = await db.query(
      `INSERT INTO transport_tariffs (${fields.join(', ')}) VALUES (${placeholders})`,
      fields.map(field => payload[field])
    )
    const [rows] = await db.query('SELECT * FROM transport_tariffs WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) {
    console.error('transport tariffs create error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  const payload = normalizePayload(req.body)
  const fields = Object.keys(payload)
  if (!fields.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  try {
    await db.query(
      `UPDATE transport_tariffs SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map(field => payload[field]), req.params.id]
    )
    const [rows] = await db.query('SELECT * FROM transport_tariffs WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Tarif introuvable' })
    res.json(rows[0])
  } catch (err) {
    console.error('transport tariffs update error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM transport_tariffs WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error('transport tariffs delete error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/match', async (req, res) => {
  const weight = req.body?.weight_kg != null ? Number(String(req.body.weight_kg).replace(',', '.')) : null
  const country = req.body?.country ? String(req.body.country).toLowerCase() : null
  const canton = req.body?.canton ? String(req.body.canton).trim().toUpperCase() : null
  const destination = req.body?.destination ? String(req.body.destination).trim().toLowerCase() : null
  const leafCount = req.body?.leaf_count ?? req.body?.vantaux ?? req.body?.vantail_count ?? 1
  const trancheCount = transportTrancheCount(leafCount)
  const postalCode = req.body?.postal_code ? String(req.body.postal_code) : ''
  try {
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
      const destinationOk = !destination || countries.includes(destination) || String(row.zone || '').toLowerCase().includes(destination) || String(row.label || '').toLowerCase().includes(destination)
      const postalOk = !postalCode || !row.postal_prefix || postalCode.startsWith(String(row.postal_prefix))
      return cantonOk && countryOk && destinationOk && postalOk
    })
    const selected = filtered[0] || null
    res.json({
      tariff: selected ? {
        ...selected,
        unit_price_ht: Number(selected.price_ht) || 0,
        tranche_count: trancheCount,
        leaf_count: Number.parseInt(leafCount, 10) || null,
        total_price_ht: (Number(selected.price_ht) || 0) * trancheCount,
      } : null,
      candidates: filtered.map(row => ({
        ...row,
        unit_price_ht: Number(row.price_ht) || 0,
        tranche_count: trancheCount,
        leaf_count: Number.parseInt(leafCount, 10) || null,
        total_price_ht: (Number(row.price_ht) || 0) * trancheCount,
      })),
      tranche_count: trancheCount,
    })
  } catch (err) {
    console.error('transport tariffs match error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
