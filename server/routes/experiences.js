import { Router } from 'express'
import db from '../db/index.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { storeExperience, deleteExperience, searchExperiences } from '../services/memory.js'

const router = Router()
router.use(authenticate)

// ── GET /api/experiences
// - Admin: all experiences with author name
// - User: own experiences only
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin'
    const [rows] = isAdmin
      ? await db.query(
          `SELECT e.*, u.name AS author_name
           FROM experiences e
           LEFT JOIN users u ON u.id = e.user_id
           ORDER BY e.created_at DESC`
        )
      : await db.query(
          `SELECT e.*, u.name AS author_name
           FROM experiences e
           LEFT JOIN users u ON u.id = e.user_id
           WHERE e.user_id = ?
           ORDER BY e.created_at DESC`,
          [req.user.id]
        )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/experiences/approved — public list of approved entries (all users)
router.get('/approved', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.id, e.title, e.content, e.category, e.created_at, u.name AS author_name
       FROM experiences e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.status = 'approved'
       ORDER BY e.created_at DESC`
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/experiences — create (pending by default)
router.post('/', async (req, res) => {
  const { title, content, category } = req.body
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: 'title and content required' })
  }
  try {
    const [result] = await db.query(
      'INSERT INTO experiences (user_id, title, content, category, status) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, title.trim(), content.trim(), category?.trim() || null, 'pending']
    )
    const [rows] = await db.query('SELECT * FROM experiences WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── PUT /api/experiences/:id — update own experience (only if pending)
router.put('/:id', async (req, res) => {
  const { title, content, category } = req.body
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: 'title and content required' })
  }
  try {
    const [rows] = await db.query('SELECT * FROM experiences WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    const exp = rows[0]
    const isAdmin = req.user.role === 'admin'
    if (!isAdmin && exp.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
    if (!isAdmin && exp.status !== 'pending') {
      return res.status(400).json({ error: 'Seules les expériences en attente peuvent être modifiées' })
    }

    await db.query(
      'UPDATE experiences SET title = ?, content = ?, category = ?, status = ? WHERE id = ?',
      [title.trim(), content.trim(), category?.trim() || null, isAdmin ? exp.status : 'pending', req.params.id]
    )

    // If was approved in Qdrant, update it
    if (exp.status === 'approved') {
      await storeExperience({ experienceId: exp.id, title: title.trim(), content: content.trim(), category: category?.trim() || null })
    }

    const [updated] = await db.query('SELECT * FROM experiences WHERE id = ?', [req.params.id])
    res.json(updated[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/experiences/:id
router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM experiences WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    const exp = rows[0]
    if (req.user.role !== 'admin' && exp.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (exp.status === 'approved') await deleteExperience(exp.id)
    await db.query('DELETE FROM experiences WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/experiences/:id/approve — admin only
router.post('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM experiences WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    const exp = rows[0]
    await db.query("UPDATE experiences SET status = 'approved' WHERE id = ?", [exp.id])
    // Index in Qdrant
    await storeExperience({ experienceId: exp.id, title: exp.title, content: exp.content, category: exp.category })
    const [updated] = await db.query('SELECT * FROM experiences WHERE id = ?', [exp.id])
    res.json(updated[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/experiences/:id/reject — admin only
router.post('/:id/reject', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM experiences WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    const exp = rows[0]
    await db.query("UPDATE experiences SET status = 'rejected' WHERE id = ?", [exp.id])
    if (exp.status === 'approved') await deleteExperience(exp.id)
    const [updated] = await db.query('SELECT * FROM experiences WHERE id = ?', [exp.id])
    res.json(updated[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/experiences/search — semantic search (for AI quality control)
router.post('/search', async (req, res) => {
  const { text, topK = 5 } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'text required' })
  try {
    const hits = await searchExperiences({ text, topK })
    if (!hits.length) return res.json([])
    // Enrich with full content from DB
    const ids = hits.map((h) => h.experience_id)
    const [rows] = await db.query(
      `SELECT id, title, content, category FROM experiences WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'approved'`,
      ids
    )
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    const result = hits
      .filter((h) => byId[h.experience_id])
      .map((h) => ({ ...byId[h.experience_id], score: h.score }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
