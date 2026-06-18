import { Router } from 'express'
import db from '../db/index.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()

function monthKey(dateValue) {
  const d = dateValue ? new Date(dateValue) : new Date()
  if (Number.isNaN(d.getTime())) return 'unknown'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function parseQuoteParts(quoteNumber) {
  const match = String(quoteNumber || '').trim().match(/^(\d{3})\.(\d{4})$/)
  if (!match) return null
  const seq = Number(match[2])
  if (!Number.isInteger(seq) || seq < 1) return null
  return { prefix: match[1], seq }
}

function findSequenceGaps(sequences = []) {
  const used = [...new Set(sequences.filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
  if (!used.length) return []
  const holes = []
  for (let value = used[0]; value < used[used.length - 1]; value += 1) {
    if (!used.includes(value)) holes.push(value)
  }
  return holes
}

router.get('/numbers', authenticate, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, quote_number, name, client_name, deal_id, created_at, updated_at
       FROM devis
       WHERE quote_number IS NOT NULL
       ORDER BY created_at DESC`
    )
    const byMonth = new Map()
    for (const row of rows) {
      const key = monthKey(row.created_at)
      const bucket = byMonth.get(key) || []
      bucket.push(row)
      byMonth.set(key, bucket)
    }
    const allSequences = []
    const months = [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, items]) => {
        const byPrefix = new Map()
        for (const item of items) {
          const parsed = parseQuoteParts(item.quote_number || item.name)
          if (!parsed) continue
          allSequences.push(parsed.seq)
          const bucket = byPrefix.get(parsed.prefix) || []
          bucket.push(parsed.seq)
          byPrefix.set(parsed.prefix, bucket)
        }
        const holes = [...byPrefix.entries()].map(([prefix, sequences]) => ({
          prefix,
          holes: findSequenceGaps(sequences),
        })).filter(entry => entry.holes.length)
        return { month, count: items.length, items, holes }
      })
    const [[seq]] = await db.query('SELECT next_value FROM quote_sequence WHERE id = 1')
    const nextValue = Number(seq?.next_value || 0)
    const globalHoles = findSequenceGaps(allSequences)
    res.json({
      months,
      next_value: nextValue,
      reserved_label: `605.${String(nextValue).padStart(4, '0')}`,
      global_holes: globalHoles.slice(0, 100),
      global_hole_count: globalHoles.length,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/sequence', authenticate, requireAdmin, async (req, res) => {
  try {
    const nextValue = Number(req.body?.next_value)
    if (!Number.isInteger(nextValue) || nextValue < 1 || nextValue > 9999) {
      return res.status(400).json({ error: 'next_value invalide (1-9999)' })
    }
    await db.query('UPDATE quote_sequence SET next_value = ? WHERE id = 1', [nextValue])
    res.json({ next_value: nextValue })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
