import { Router } from 'express'
import db from '../db/index.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { deleteDevisRule, searchDevisRules, storeDevisRule } from '../services/memory.js'

const router = Router()
router.use(authenticate)

const STATUSES = new Set(['draft', 'active', 'obsolete'])
const SEVERITIES = new Set(['info', 'warning', 'blocking'])
const SOURCE_TYPES = new Set(['markdown', 'human', 'experience', 'pdf', 'xlsx'])

function normalizeStatus(value, fallback = 'draft') {
  return STATUSES.has(value) ? value : fallback
}

function normalizeSeverity(value) {
  return SEVERITIES.has(value) ? value : 'warning'
}

function normalizeSourceType(value) {
  return SOURCE_TYPES.has(value) ? value : 'human'
}

function normalizeRuleCode(value) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return null
  const digitsOnly = raw.match(/^\d+$/)
  if (digitsOnly) return `R${raw.padStart(3, '0')}`
  const match = raw.match(/^R\s*-?\s*(\d+)$/)
  if (match) return `R${match[1].padStart(3, '0')}`
  return raw.replace(/\s+/g, '')
}

async function nextRuleCode() {
  const [rows] = await db.query("SELECT rule_code FROM devis_rules WHERE rule_code REGEXP '^R[0-9]+$'")
  let max = 0
  for (const row of rows) {
    const n = Number(String(row.rule_code || '').replace(/^R/i, ''))
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  return `R${String(max + 1).padStart(3, '0')}`
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map(tag => String(tag).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map(tag => tag.trim()).filter(Boolean)
  return []
}

function parseMaybeJson(value, fallback = null) {
  if (value == null) return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function canEditRule(rule, user) {
  if (user.role === 'admin') return true
  return rule.created_by === user.id && rule.status === 'draft'
}

function publicRule(row) {
  return {
    ...row,
    tags_json: parseMaybeJson(row.tags_json, []),
  }
}

async function indexRule(row) {
  const qdrantId = await storeDevisRule({
    ruleId: row.id,
    ruleCode: row.rule_code,
    title: row.title,
    content: row.content,
    category: row.category,
    severity: row.severity,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    tags: parseMaybeJson(row.tags_json, []),
  })
  if (qdrantId) await db.query('UPDATE devis_rules SET qdrant_id = ? WHERE id = ?', [qdrantId, row.id])
  return qdrantId
}

router.get('/', async (req, res) => {
  const { status, category, severity, q } = req.query
  const where = []
  const params = []
  if (status && status !== 'all') { where.push('r.status = ?'); params.push(normalizeStatus(status)) }
  if (category && category !== 'all') { where.push('r.category = ?'); params.push(category) }
  if (severity && severity !== 'all') { where.push('r.severity = ?'); params.push(normalizeSeverity(severity)) }
  if (q?.trim()) {
    where.push('(r.rule_code LIKE ? OR r.title LIKE ? OR r.content LIKE ? OR r.source_ref LIKE ?)')
    const like = `%${q.trim()}%`
    params.push(like, like, like, like)
  }
  try {
    const [rows] = await db.query(
      `SELECT r.*, creator.name AS creator_name, approver.name AS approver_name
         FROM devis_rules r
         LEFT JOIN users creator ON creator.id = r.created_by
         LEFT JOIN users approver ON approver.id = r.approved_by
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY FIELD(r.status, 'active', 'draft', 'obsolete'), r.updated_at DESC, r.id DESC`,
      params
    )
    res.json(rows.map(publicRule))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/search', async (req, res) => {
  const { text, topK = 8, minScore = 0.35 } = req.body || {}
  if (!text?.trim()) return res.status(400).json({ error: 'text required' })
  try {
    const hits = await searchDevisRules({ text, topK, minScore })
    res.json(hits)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/reindex', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM devis_rules WHERE status = 'active' ORDER BY id ASC")
    let indexed = 0
    for (const row of rows) {
      const qdrantId = await indexRule(row)
      if (qdrantId) indexed += 1
    }
    res.json({ success: true, indexed, total: rows.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  const { rule_code, title, content, category, severity, source_type, source_ref, tags } = req.body || {}
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'title and content required' })
  try {
    const code = normalizeRuleCode(rule_code) || await nextRuleCode()
    const [result] = await db.query(
      `INSERT INTO devis_rules
        (rule_code, title, content, category, severity, source_type, source_ref, tags_json, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        title.trim(),
        content.trim(),
        category?.trim() || null,
        normalizeSeverity(severity),
        normalizeSourceType(source_type),
        source_ref?.trim() || null,
        JSON.stringify(parseTags(tags)),
        req.user.role === 'admin' && req.body?.status === 'active' ? 'active' : 'draft',
        req.user.id,
      ]
    )
    if (req.user.role === 'admin' && req.body?.status === 'active') {
      await db.query('UPDATE devis_rules SET approved_by = ? WHERE id = ?', [req.user.id, result.insertId])
    }
    const [rows] = await db.query('SELECT * FROM devis_rules WHERE id = ?', [result.insertId])
    if (rows[0]?.status === 'active') await indexRule(rows[0])
    res.status(201).json(publicRule(rows[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  const { rule_code, title, content, category, severity, source_type, source_ref, tags } = req.body || {}
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'title and content required' })
  try {
    const [rows] = await db.query('SELECT * FROM devis_rules WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Rule not found' })
    const rule = rows[0]
    if (!canEditRule(rule, req.user)) return res.status(403).json({ error: 'Forbidden' })
    await db.query(
      `UPDATE devis_rules
          SET rule_code = ?, title = ?, content = ?, category = ?, severity = ?, source_type = ?, source_ref = ?, tags_json = ?
        WHERE id = ?`,
      [
        normalizeRuleCode(rule_code) || rule.rule_code || await nextRuleCode(),
        title.trim(),
        content.trim(),
        category?.trim() || null,
        normalizeSeverity(severity),
        normalizeSourceType(source_type),
        source_ref?.trim() || null,
        JSON.stringify(parseTags(tags)),
        rule.id,
      ]
    )
    const [updated] = await db.query('SELECT * FROM devis_rules WHERE id = ?', [rule.id])
    if (updated[0]?.status === 'active') await indexRule(updated[0])
    res.json(publicRule(updated[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM devis_rules WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Rule not found' })
    const rule = rows[0]
    if (!canEditRule(rule, req.user)) return res.status(403).json({ error: 'Forbidden' })
    if (rule.status === 'active') await deleteDevisRule(rule.id)
    await db.query('DELETE FROM devis_rules WHERE id = ?', [rule.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/activate', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM devis_rules WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Rule not found' })
    await db.query("UPDATE devis_rules SET status = 'active', approved_by = ? WHERE id = ?", [req.user.id, req.params.id])
    const [updated] = await db.query('SELECT * FROM devis_rules WHERE id = ?', [req.params.id])
    await indexRule(updated[0])
    res.json(publicRule(updated[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/obsolete', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM devis_rules WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Rule not found' })
    await deleteDevisRule(req.params.id)
    await db.query("UPDATE devis_rules SET status = 'obsolete' WHERE id = ?", [req.params.id])
    const [updated] = await db.query('SELECT * FROM devis_rules WHERE id = ?', [req.params.id])
    res.json(publicRule(updated[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
