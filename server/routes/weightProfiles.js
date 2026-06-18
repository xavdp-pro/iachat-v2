import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import db from '../db/index.js'
import { getSetting, setSetting, KEY_WEIGHT_VITRAGE_KG_M2 } from '../services/appSettings.js'
import {
  DEFAULT_WEIGHT_PROFILES,
  calculateDevisWeight,
  calculateLineWeightKg,
  resolveWeightProfile,
  buildWeightTypeCandidates,
} from '../services/weight-calculator.js'

const router = Router()

const editableFields = [
  'type_label', 'product_family', 'leaf_kg_m2', 'frame_kg_m',
  'leaf_formula', 'sort_order', 'active', 'notes',
]

function normalizePayload(body = {}) {
  const payload = {}
  for (const field of editableFields) {
    if (body[field] === undefined) continue
    if (field === 'leaf_kg_m2' || field === 'frame_kg_m') {
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
    } else if (field === 'product_family') {
      const fam = String(body[field] || 'BP').toUpperCase()
      payload[field] = fam === 'CF' ? 'CF' : 'BP'
    } else {
      payload[field] = body[field] === '' ? null : body[field]
    }
  }
  return payload
}

async function loadActiveProfiles() {
  const [rows] = await db.query(
    'SELECT * FROM door_weight_profiles WHERE active = 1 ORDER BY sort_order ASC, id ASC'
  )
  return rows
}

async function loadAllProfiles() {
  const [rows] = await db.query(
    'SELECT * FROM door_weight_profiles ORDER BY sort_order ASC, id ASC'
  )
  return rows
}

router.use(authenticate)

router.get('/settings', async (_req, res) => {
  try {
    const raw = await getSetting(KEY_WEIGHT_VITRAGE_KG_M2)
    const value = raw != null && raw !== '' ? Number(String(raw).replace(',', '.')) : null
    res.json({ vitrage_kg_m2: Number.isFinite(value) ? value : null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/settings', requireAdmin, async (req, res) => {
  try {
    const value = req.body?.vitrage_kg_m2
    if (value === '' || value == null) {
      await setSetting(KEY_WEIGHT_VITRAGE_KG_M2, '')
      return res.json({ vitrage_kg_m2: null })
    }
    const parsed = Number(String(value).replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed < 0) {
      return res.status(400).json({ error: 'vitrage_kg_m2 invalide' })
    }
    await setSetting(KEY_WEIGHT_VITRAGE_KG_M2, String(parsed))
    res.json({ vitrage_kg_m2: parsed })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', async (_req, res) => {
  try {
    res.json(await loadAllProfiles())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/calculate', async (req, res) => {
  try {
    const profiles = await loadActiveProfiles()
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
    let vitrageKgM2 = req.body?.vitrage_kg_m2 ?? null
    if (vitrageKgM2 == null) {
      const stored = await getSetting(KEY_WEIGHT_VITRAGE_KG_M2)
      if (stored != null && stored !== '') {
        const parsed = Number(String(stored).replace(',', '.'))
        if (Number.isFinite(parsed)) vitrageKgM2 = parsed
      }
    }
    const result = calculateDevisWeight(rows, profiles, { vitrage_kg_m2: vitrageKgM2 })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/preview-line', async (req, res) => {
  try {
    const profiles = await loadActiveProfiles()
    const row = req.body?.row || {}
    const profile = resolveWeightProfile(row, profiles)
    const candidates = buildWeightTypeCandidates(row)
    const weight_kg = calculateLineWeightKg(profile, {
      height_mm: row.haut_mm ?? row.hauteur_mm,
      width_mm: row.larg_mm ?? row.largeur_mm,
      qty: row.qty ?? row.quantite ?? 1,
      vitrage_kg_m2: req.body?.vitrage_kg_m2 ?? null,
    })
    res.json({ profile, candidates, weight_kg })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/seed-defaults', requireAdmin, async (_req, res) => {
  try {
    const [countRows] = await db.query('SELECT COUNT(*) AS count FROM door_weight_profiles')
    if (Number(countRows[0]?.count || 0) > 0) {
      return res.status(409).json({ error: 'La table contient déjà des profils. Supprimez-les ou modifiez-les manuellement.' })
    }
    for (const profile of DEFAULT_WEIGHT_PROFILES) {
      await db.query(
        `INSERT INTO door_weight_profiles
         (type_label, product_family, leaf_kg_m2, frame_kg_m, leaf_formula, sort_order, active, notes)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          profile.type_label,
          profile.product_family,
          profile.leaf_kg_m2,
          profile.frame_kg_m,
          profile.leaf_formula,
          profile.sort_order,
          'Import initial depuis Calcul poids.xlsx',
        ]
      )
    }
    res.status(201).json({ ok: true, count: DEFAULT_WEIGHT_PROFILES.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireAdmin, async (req, res) => {
  const payload = normalizePayload(req.body)
  if (!payload.type_label) return res.status(400).json({ error: 'type_label requis' })
  try {
    const fields = Object.keys(payload)
    const placeholders = fields.map(() => '?').join(', ')
    const [result] = await db.query(
      `INSERT INTO door_weight_profiles (${fields.join(', ')}) VALUES (${placeholders})`,
      fields.map(field => payload[field])
    )
    const [rows] = await db.query('SELECT * FROM door_weight_profiles WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ce type existe déjà' })
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', requireAdmin, async (req, res) => {
  const payload = normalizePayload(req.body)
  const fields = Object.keys(payload)
  if (!fields.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  try {
    await db.query(
      `UPDATE door_weight_profiles SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map(field => payload[field]), req.params.id]
    )
    const [rows] = await db.query('SELECT * FROM door_weight_profiles WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Profil introuvable' })
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM door_weight_profiles WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
