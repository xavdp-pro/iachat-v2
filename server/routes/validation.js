import { Router } from 'express'
import jwt from 'jsonwebtoken'
import db from '../db/index.js'
import {
  buildRoadmapPayload,
  VALID_ITEM_IDS,
  VALID_AG_STATUSES,
} from '../services/armandRoadmap.js'
import { DEV_FIX_NOTES } from '../services/armandValidationFixes.js'
import { VALIDATION_DEV_NAME } from '../lib/validationActivity.js'

const router = Router()

const ALLOWED_ROLES = new Set(['admin', 'user'])

/** Any active admin or user (JWT) may read and write validation feedback. */
async function attachAppUser(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Connexion requise — connectez-vous sur /login' })
  }
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET)
    const [rows] = await db.query(
      'SELECT id, email, role, name FROM users WHERE id = ? AND active = 1 LIMIT 1',
      [payload.id]
    )
    const user = rows[0]
    if (!user) {
      return res.status(401).json({ error: 'Compte inactif ou introuvable' })
    }
    if (!ALLOWED_ROLES.has(user.role)) {
      return res.status(403).json({ error: 'Rôle non autorisé pour la validation' })
    }
    req.validationActor = user.name || user.email
    req.validationUser = user
    next()
  } catch {
    return res.status(401).json({ error: 'Session expirée — reconnectez-vous' })
  }
}

async function loadFeedbackMap() {
  const [rows] = await db.query(
    `SELECT item_id, ag_status, ag_comment, ag_answer, ag_feedback_at,
            dev_response, dev_response_at, dev_response_by,
            updated_by, updated_at
       FROM armand_roadmap_feedback`
  )
  const map = {}
  for (const row of rows) {
    map[row.item_id] = row
  }
  return map
}

async function upsertFeedback(itemId, payload, actor) {
  const { ag_status, ag_comment, ag_answer } = payload
  await db.query(
    `INSERT INTO armand_roadmap_feedback (item_id, ag_status, ag_comment, ag_answer, ag_feedback_at, updated_by)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON DUPLICATE KEY UPDATE
       ag_status = VALUES(ag_status),
       ag_comment = VALUES(ag_comment),
       ag_answer = VALUES(ag_answer),
       ag_feedback_at = CURRENT_TIMESTAMP,
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    [
      itemId,
      ag_status,
      ag_comment ?? null,
      ag_answer ?? null,
      actor || 'Utilisateur',
    ]
  )
  const [rows] = await db.query(
    'SELECT * FROM armand_roadmap_feedback WHERE item_id = ? LIMIT 1',
    [itemId]
  )
  return rows[0]
}

async function upsertDevFix(itemId, dev_response, actor) {
  const text = String(dev_response || '').trim().slice(0, 4000)
  if (!text) throw new Error('dev_response requis')
  await db.query(
    `INSERT INTO armand_roadmap_feedback (item_id, ag_status, dev_response, dev_response_at, dev_response_by, updated_by)
     VALUES (?, 'recheck', ?, CURRENT_TIMESTAMP, ?, ?)
     ON DUPLICATE KEY UPDATE
       ag_status = 'recheck',
       dev_response = VALUES(dev_response),
       dev_response_at = CURRENT_TIMESTAMP,
       dev_response_by = VALUES(dev_response_by),
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    [itemId, text, actor || VALIDATION_DEV_NAME, actor || VALIDATION_DEV_NAME]
  )
  const [rows] = await db.query(
    'SELECT * FROM armand_roadmap_feedback WHERE item_id = ? LIMIT 1',
    [itemId]
  )
  return rows[0]
}

router.get('/roadmap', attachAppUser, async (_req, res) => {
  try {
    const feedbackMap = await loadFeedbackMap()
    res.json(buildRoadmapPayload(feedbackMap))
  } catch (err) {
    console.error('validation roadmap GET:', err)
    res.status(500).json({ error: err.message })
  }
})

router.put('/feedback/:itemId', attachAppUser, async (req, res) => {
  const itemId = String(req.params.itemId || '').toUpperCase()
  if (!VALID_ITEM_IDS.has(itemId)) {
    return res.status(400).json({ error: 'ID inconnu' })
  }
  const ag_status = String(req.body?.ag_status || 'pending')
  if (!VALID_AG_STATUSES.has(ag_status)) {
    return res.status(400).json({ error: 'Statut AG invalide' })
  }
  const ag_comment = req.body?.ag_comment != null ? String(req.body.ag_comment).trim().slice(0, 4000) : null
  const ag_answer = req.body?.ag_answer != null ? String(req.body.ag_answer).trim().slice(0, 4000) : null
  const respondent = String(req.body?.respondent_name || req.validationActor || 'Utilisateur').slice(0, 120)

  try {
    const row = await upsertFeedback(itemId, { ag_status, ag_comment, ag_answer }, respondent)
    res.json({ ok: true, feedback: row })
  } catch (err) {
    console.error('validation feedback PUT:', err)
    res.status(500).json({ error: err.message })
  }
})

router.put('/feedback/:itemId/dev-fix', attachAppUser, async (req, res) => {
  const itemId = String(req.params.itemId || '').toUpperCase()
  if (!VALID_ITEM_IDS.has(itemId)) {
    return res.status(400).json({ error: 'ID inconnu' })
  }
  const dev_response = req.body?.dev_response != null ? String(req.body.dev_response).trim() : ''
  if (!dev_response) return res.status(400).json({ error: 'dev_response requis' })
  const respondent = String(req.body?.respondent_name || req.validationActor || VALIDATION_DEV_NAME).slice(0, 120)
  try {
    const row = await upsertDevFix(itemId, dev_response, respondent)
    res.json({ ok: true, feedback: row })
  } catch (err) {
    console.error('validation dev-fix PUT:', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/feedback/bulk-dev-fix', attachAppUser, async (req, res) => {
  const respondent = String(req.body?.respondent_name || req.validationActor || VALIDATION_DEV_NAME).slice(0, 120)
  const itemIds = Array.isArray(req.body?.itemIds) && req.body.itemIds.length
    ? req.body.itemIds.map((id) => String(id).toUpperCase())
    : Object.keys(DEV_FIX_NOTES)
  try {
    const updated = []
    for (const itemId of itemIds) {
      if (!VALID_ITEM_IDS.has(itemId)) continue
      const note = DEV_FIX_NOTES[itemId]
      if (!note) continue
      updated.push(await upsertDevFix(itemId, note, respondent))
    }
    res.json({ ok: true, count: updated.length, updated })
  } catch (err) {
    console.error('validation bulk-dev-fix:', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/feedback/bulk', attachAppUser, async (req, res) => {
  const jalonId = String(req.body?.jalonId || '').toUpperCase()
  const ag_status = String(req.body?.ag_status || 'validated')
  const onlyDevDone = req.body?.onlyDevDone !== false
  if (!VALID_AG_STATUSES.has(ag_status)) {
    return res.status(400).json({ error: 'Statut AG invalide' })
  }

  try {
    const feedbackMap = await loadFeedbackMap()
    const payload = buildRoadmapPayload(feedbackMap)
    const jalon = payload.jalons.find((j) => j.id === jalonId)
    if (!jalon) return res.status(400).json({ error: 'Jalon inconnu' })

    const targets = jalon.items.filter((i) => {
      if (onlyDevDone && i.dev !== 'done') return false
      if (i.ag === 'validated' && ag_status === 'validated') return false
      return true
    })

    const respondent = String(req.body?.respondent_name || req.validationActor || 'Utilisateur').slice(0, 120)
    const updated = []
    for (const item of targets) {
      const existing = feedbackMap[item.id]
      const row = await upsertFeedback(
        item.id,
        {
          ag_status,
          ag_comment: existing?.ag_comment ?? item.agNote ?? null,
          ag_answer: existing?.ag_answer ?? item.agAnswer ?? null,
        },
        respondent
      )
      updated.push(row)
    }
    res.json({ ok: true, count: updated.length, updated })
  } catch (err) {
    console.error('validation feedback bulk:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
