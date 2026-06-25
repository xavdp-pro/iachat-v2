/**
 * Admin-managed PDF phrase dictionary (FR → EN / DE).
 */
import db from '../db/index.js'

let cache = { loadedAt: 0, entries: [] }
const CACHE_MS = 30_000

export async function loadPdfTranslationEntries({ force = false } = {}) {
  const now = Date.now()
  if (!force && cache.entries.length && now - cache.loadedAt < CACHE_MS) return cache.entries
  const [rows] = await db.query(
    `SELECT id, fr_text, en_text, de_text, category, sort_order, active
     FROM pdf_translation_entries
     WHERE active = 1
     ORDER BY sort_order ASC, fr_text ASC`
  )
  cache = { loadedAt: now, entries: rows }
  return rows
}

export function invalidatePdfTranslationCache() {
  cache = { loadedAt: 0, entries: [] }
}

export function getCachedPdfTranslationEntries() {
  return cache.entries
}

/**
 * Synchronous custom dictionary pass (uses in-memory cache).
 */
export function applyCachedCustomPdfTranslations(text, language) {
  const lang = String(language || 'fr').toLowerCase()
  if (!text || lang === 'fr') return text
  const field = lang === 'de' ? 'de_text' : 'en_text'
  let out = String(text)
  const sorted = [...cache.entries]
    .filter((row) => row.active !== 0 && String(row.fr_text || '').trim() && String(row[field] || '').trim())
    .sort((a, b) => String(b.fr_text).length - String(a.fr_text).length)
  for (const row of sorted) {
    const fr = String(row.fr_text)
    const repl = String(row[field])
    if (out.includes(fr)) out = out.split(fr).join(repl)
  }
  return out
}

/**
 * Apply longest-match custom dictionary replacements after rule-based translation.
 */
export async function applyCustomPdfTranslations(text, language) {
  const lang = String(language || 'fr').toLowerCase()
  if (!text || lang === 'fr') return text
  const field = lang === 'de' ? 'de_text' : 'en_text'
  const entries = await loadPdfTranslationEntries()
  let out = String(text)
  const sorted = [...entries]
    .filter((row) => String(row.fr_text || '').trim() && String(row[field] || '').trim())
    .sort((a, b) => String(b.fr_text).length - String(a.fr_text).length)
  for (const row of sorted) {
    const fr = String(row.fr_text)
    const repl = String(row[field])
    if (out.includes(fr)) out = out.split(fr).join(repl)
  }
  return out
}

export async function listPdfTranslationEntriesAdmin() {
  const [rows] = await db.query(
    `SELECT id, fr_text, en_text, de_text, category, sort_order, active, updated_at
     FROM pdf_translation_entries
     ORDER BY sort_order ASC, fr_text ASC`
  )
  return rows
}

export async function upsertPdfTranslationEntry(payload = {}) {
  const fr = String(payload.fr_text || '').trim()
  if (!fr) throw new Error('fr_text requis')
  const en = payload.en_text != null ? String(payload.en_text).trim() : null
  const de = payload.de_text != null ? String(payload.de_text).trim() : null
  const category = String(payload.category || 'general').trim() || 'general'
  const sortOrder = Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 0
  const active = payload.active === false || payload.active === 0 ? 0 : 1
  const id = Number(payload.id)

  if (id > 0) {
    await db.query(
      `UPDATE pdf_translation_entries
       SET fr_text = ?, en_text = ?, de_text = ?, category = ?, sort_order = ?, active = ?
       WHERE id = ?`,
      [fr, en, de, category, sortOrder, active, id]
    )
    invalidatePdfTranslationCache()
    const [[row]] = await db.query('SELECT * FROM pdf_translation_entries WHERE id = ?', [id])
    return row
  }

  const [result] = await db.query(
    `INSERT INTO pdf_translation_entries (fr_text, en_text, de_text, category, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       en_text = VALUES(en_text),
       de_text = VALUES(de_text),
       category = VALUES(category),
       sort_order = VALUES(sort_order),
       active = VALUES(active)`,
    [fr, en, de, category, sortOrder, active]
  )
  invalidatePdfTranslationCache()
  const insertId = result.insertId
  const [[row]] = await db.query('SELECT * FROM pdf_translation_entries WHERE id = ?', [insertId])
  return row
}

export async function deletePdfTranslationEntry(id) {
  await db.query('DELETE FROM pdf_translation_entries WHERE id = ?', [Number(id)])
  invalidatePdfTranslationCache()
}
