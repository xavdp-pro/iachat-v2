/**
 * /api/devis — Analyse Excel NEXUS + assistant Gemma + CRUD devis/lines
 *
 * POST /api/devis/conseils     — session + résultats → conseils (expériences)
 * POST /api/devis/analyze      — upload .xlsx → exécute detect_nexus.py → retourne JSON
 * POST /api/devis/ask          — question Gemma avec contexte markdowns + lignes devis
 * GET  /api/devis/types-options — liste des types depuis knowledge_tables.json
 * POST /api/devis/recompute-row — recalcule une ligne via detect_nexus.py --recompute
 * POST /api/devis/parse-line   — parse texte libre → _raw[17] via Gemma 4 (vLLM)
 * CRUD /api/devis              — devis headers
 * CRUD /api/devis/:id/lines   — devis line items
 */
import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { chatCompletion } from '../services/ollama.js'
import { getGlobalOllamaModel } from '../services/appSettings.js'
import { searchDesignationExamples, searchExperiences } from '../services/memory.js'
import db from '../db/index.js'
import multer from 'multer'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, unlink } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import os from 'os'
import crypto from 'crypto'

const execFileAsync = promisify(execFile)
// Répertoire des markdowns NEXUS
const XLSX_DIR = '/apps/zeruxcom-v1/app/ressources/XLSX'
const SCRIPT = join(XLSX_DIR, 'detect_nexus.py')

const router = Router()
router.use(authenticate)

const VALID_LINE_SECTIONS = new Set(['products', 'calculations', 'transport'])
const normalizeLineSection = (value) => VALID_LINE_SECTIONS.has(value) ? value : 'products'
const RD_VALIDATION_CATEGORY = 'Validations individuelles R&D'

async function loadRdValidations() {
  const [rows] = await db.query(
    `SELECT id, title, content, category
       FROM experiences
      WHERE status = 'approved' AND category = ?
      ORDER BY id ASC`,
    [RD_VALIDATION_CATEGORY]
  )
  return rows
}

async function detectEnv() {
  const validations = await loadRdValidations().catch(() => [])
  return {
    ...process.env,
    NEXUS_RD_VALIDATIONS: JSON.stringify(validations),
  }
}

function isBlockingUnpricedLine(line = {}) {
  const hasBasePrice = line.prix_base_ht != null && Number(line.prix_base_ht) > 0
  if (hasBasePrice) return false
  const text = [
    line.designation,
    line.type,
    line.type_porte,
    ...(Array.isArray(line.alertes) ? line.alertes : []),
    ...(Array.isArray(line.options) ? line.options.map(option => `${option?.label || ''} ${option?.note || ''}`) : []),
  ].filter(Boolean).join(' ')
  return /hors catalogue|nous consulter|impossible|pas de prix de base|non chiffrable/i.test(text)
}

function parseMaybeJson(value, fallback = []) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string' || !value.trim()) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function jsonForDb(value, fallback = null) {
  if (value === undefined) return fallback == null ? null : JSON.stringify(fallback)
  return JSON.stringify(value)
}

const VERSION_STATUSES = new Set(['draft', 'editing', 'prepdf', 'checked', 'pdf_generated', 'sent_hubspot', 'archived'])
const LOCKED_VERSION_STATUSES = new Set(['pdf_generated', 'sent_hubspot', 'archived'])
const COMMENT_KINDS = new Set(['comment', 'checkpoint', 'check', 'pdf', 'hubspot'])

function normalizeVersionStatus(value) {
  return VERSION_STATUSES.has(value) ? value : 'draft'
}

function normalizeCommentKind(value) {
  return COMMENT_KINDS.has(value) ? value : 'comment'
}

function normalizeStepKey(value) {
  const s = String(value || '').trim().slice(0, 50)
  return s || null
}

function isLockedVersion(version) {
  return Boolean(version?.locked_at) || LOCKED_VERSION_STATUSES.has(version?.status)
}

function dbLineToGridSnapshot(line) {
  return {
    id: line.id,
    line_section: line.line_section || 'products',
    position: line.position ?? 0,
    designation: line.designation || '',
    type: line.type_porte || line.designation || '',
    type_porte: line.type_porte || null,
    gamme: line.gamme || '',
    vantail: line.vantail || '',
    haut_mm: line.hauteur_mm ?? null,
    larg_mm: line.largeur_mm ?? null,
    hauteur_mm: line.hauteur_mm ?? null,
    largeur_mm: line.largeur_mm ?? null,
    prix_base_ht: line.prix_base_ht != null ? Number(line.prix_base_ht) : null,
    ref_base: line.ref_base || null,
    options: parseMaybeJson(line.options_json, []),
    serrure_ref: line.serrure_ref || null,
    serrure_prix: line.serrure_prix != null ? Number(line.serrure_prix) : null,
    ferme_porte_ref: line.ferme_porte_ref || null,
    ferme_porte_prix: line.ferme_porte_prix != null ? Number(line.ferme_porte_prix) : null,
    equip_extra: parseMaybeJson(line.equipements_json, []),
    alertes: parseMaybeJson(line.alertes_json, []),
    docs: parseMaybeJson(line.docs_json, []),
    total_ligne_ht: line.total_ligne_ht != null ? Number(line.total_ligne_ht) : null,
  }
}

async function loadDevisForUser(devisId, user) {
  const [rows] = await db.query(
    `SELECT * FROM devis
      WHERE id = ? AND (created_by = ? OR ? = 'admin')`,
    [devisId, user.id, user.role]
  )
  return rows[0] || null
}

async function fetchDevisLines(devisId) {
  const [lines] = await db.query(
    'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY FIELD(line_section, "products", "calculations", "transport"), position ASC, id ASC',
    [devisId]
  )
  return lines
}

async function nextVersionLabel(devisId) {
  const [rows] = await db.query('SELECT version_label FROM devis_versions WHERE devis_id = ?', [devisId])
  let max = 0
  for (const row of rows) {
    const m = String(row.version_label || '').match(/^V(\d+)/i)
    if (m) max = Math.max(max, Number(m[1]) || 0)
  }
  return `V${max + 1}`
}

function buildVersionSnapshot({ devis, lines, source = 'current-lines' }) {
  return {
    source,
    devis: {
      id: devis.id,
      deal_id: devis.deal_id,
      company_id: devis.company_id,
      client_name: devis.client_name,
      name: devis.name,
      status: devis.status,
      source_file: devis.source_file,
      total_ht: devis.total_ht != null ? Number(devis.total_ht) : null,
    },
    lines: lines.map(dbLineToGridSnapshot),
    captured_at: new Date().toISOString(),
  }
}

async function insertVersionLines(conn, versionId, lines) {
  for (const line of lines) {
    const grid = dbLineToGridSnapshot(line)
    await conn.query(
      `INSERT INTO devis_version_lines
        (version_id, source_line_id, position, line_section, grid_json, designation_pdf, total_ligne_ht)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        versionId,
        line.id || null,
        line.position ?? 0,
        normalizeLineSection(line.line_section),
        JSON.stringify(grid),
        line.designation || null,
        line.total_ligne_ht ?? null,
      ]
    )
  }
}

async function createVersionSnapshot({ devis, parentVersionId = null, versionLabel = null, branchLabel = null, title = null, comment = null, stepKey = 'versions', kind = 'checkpoint', userId }) {
  const lines = await fetchDevisLines(devis.id)
  const label = String(versionLabel || await nextVersionLabel(devis.id)).trim().slice(0, 50)
  const total = lines.reduce((sum, line) => sum + (Number(line.total_ligne_ht) || 0), 0)
  const snapshot = buildVersionSnapshot({ devis, lines })
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [result] = await conn.query(
      `INSERT INTO devis_versions
        (devis_id, parent_version_id, version_label, branch_label, title, status, snapshot_json, total_ht, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [devis.id, parentVersionId || null, label, branchLabel || null, title || null, 'draft', JSON.stringify(snapshot), total, userId || null]
    )
    const versionId = result.insertId
    await insertVersionLines(conn, versionId, lines)
    if (comment?.trim()) {
      await conn.query(
        `INSERT INTO devis_version_comments (version_id, step_key, kind, content, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [versionId, normalizeStepKey(stepKey), normalizeCommentKind(kind), comment.trim(), userId || null]
      )
    }
    await conn.query('UPDATE devis SET current_version_id = ? WHERE id = ?', [versionId, devis.id])
    await conn.commit()
    const [rows] = await db.query('SELECT * FROM devis_versions WHERE id = ?', [versionId])
    return rows[0]
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

async function ensureInitialVersion(devis, userId) {
  if (devis.current_version_id) {
    const [rows] = await db.query('SELECT * FROM devis_versions WHERE id = ? AND devis_id = ?', [devis.current_version_id, devis.id])
    if (rows[0]) return rows[0]
  }
  const [existing] = await db.query('SELECT * FROM devis_versions WHERE devis_id = ? ORDER BY id ASC LIMIT 1', [devis.id])
  if (existing[0]) {
    await db.query('UPDATE devis SET current_version_id = ? WHERE id = ?', [existing[0].id, devis.id])
    return existing[0]
  }
  return createVersionSnapshot({
    devis,
    versionLabel: 'V1',
    title: 'Version initiale',
    comment: 'Version initiale créée automatiquement',
    stepKey: 'versions',
    kind: 'checkpoint',
    userId,
  })
}

async function loadVersionForDevis(devisId, versionId) {
  const [rows] = await db.query('SELECT * FROM devis_versions WHERE id = ? AND devis_id = ?', [versionId, devisId])
  return rows[0] || null
}

async function createVersionFromSource({ devis, sourceVersion, versionLabel = null, branchLabel = null, title = null, comment = null, stepKey = 'versions', userId }) {
  const [sourceLines] = await db.query(
    'SELECT * FROM devis_version_lines WHERE version_id = ? ORDER BY position ASC, id ASC',
    [sourceVersion.id]
  )
  const label = String(versionLabel || await nextVersionLabel(devis.id)).trim().slice(0, 50)
  const total = sourceLines.reduce((sum, line) => sum + (Number(line.total_ligne_ht) || 0), 0)
  const snapshot = {
    source: 'version-copy',
    source_version_id: sourceVersion.id,
    source_version_label: sourceVersion.version_label,
    copied_at: new Date().toISOString(),
  }
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [result] = await conn.query(
      `INSERT INTO devis_versions
        (devis_id, parent_version_id, version_label, branch_label, title, status, snapshot_json, total_ht, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [devis.id, sourceVersion.id, label, branchLabel || null, title || null, 'draft', JSON.stringify(snapshot), total, userId || null]
    )
    const versionId = result.insertId
    for (const line of sourceLines) {
      await conn.query(
        `INSERT INTO devis_version_lines
          (version_id, source_line_id, position, line_section, grid_json, designation_pdf, total_ligne_ht)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          versionId,
          line.source_line_id || null,
          line.position ?? 0,
          normalizeLineSection(line.line_section),
          typeof line.grid_json === 'string' ? line.grid_json : JSON.stringify(line.grid_json || {}),
          line.designation_pdf || null,
          line.total_ligne_ht ?? null,
        ]
      )
    }
    if (comment?.trim()) {
      await conn.query(
        `INSERT INTO devis_version_comments (version_id, step_key, kind, content, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [versionId, normalizeStepKey(stepKey), 'checkpoint', comment.trim(), userId || null]
      )
    }
    await conn.query('UPDATE devis SET current_version_id = ? WHERE id = ?', [versionId, devis.id])
    await conn.commit()
    const [rows] = await db.query('SELECT * FROM devis_versions WHERE id = ?', [versionId])
    return rows[0]
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

async function checkpointVersionFromCurrentLines({ devis, version, comment = null, stepKey = 'grid', kind = 'checkpoint', status = null, userId }) {
  if (isLockedVersion(version)) {
    const err = new Error('Version verrouillée : créez une nouvelle branche pour la modifier')
    err.status = 409
    throw err
  }
  const lines = await fetchDevisLines(devis.id)
  const total = lines.reduce((sum, line) => sum + (Number(line.total_ligne_ht) || 0), 0)
  const snapshot = buildVersionSnapshot({ devis, lines, source: 'checkpoint-current-lines' })
  const nextStatus = status ? normalizeVersionStatus(status) : version.status
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query('DELETE FROM devis_version_lines WHERE version_id = ?', [version.id])
    await insertVersionLines(conn, version.id, lines)
    await conn.query(
      'UPDATE devis_versions SET snapshot_json = ?, total_ht = ?, status = ? WHERE id = ?',
      [JSON.stringify(snapshot), total, nextStatus, version.id]
    )
    if (comment?.trim()) {
      await conn.query(
        `INSERT INTO devis_version_comments (version_id, step_key, kind, content, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [version.id, normalizeStepKey(stepKey), normalizeCommentKind(kind), comment.trim(), userId || null]
      )
    }
    await conn.commit()
    const [rows] = await db.query('SELECT * FROM devis_versions WHERE id = ?', [version.id])
    return rows[0]
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

function versionGridToDbLine(grid = {}, fallback = {}) {
  const options = grid.options ?? grid.options_json ?? []
  const equipments = grid.equip_extra ?? grid.equipements_json ?? []
  const alerts = grid.alertes ?? grid.alertes_json ?? []
  const docs = grid.docs ?? grid.docs_json ?? []
  return {
    position: fallback.position ?? grid.position ?? 0,
    line_section: normalizeLineSection(fallback.line_section || grid.line_section),
    designation: fallback.designation_pdf != null ? fallback.designation_pdf : (grid.designation || grid.type || grid.type_porte || null),
    type_porte: grid.type_porte || grid.type || grid.designation || null,
    gamme: grid.gamme || null,
    vantail: grid.vantail || null,
    hauteur_mm: grid.hauteur_mm ?? grid.haut_mm ?? null,
    largeur_mm: grid.largeur_mm ?? grid.larg_mm ?? null,
    prix_base_ht: grid.prix_base_ht ?? null,
    ref_base: grid.ref_base || null,
    options_json: Array.isArray(options) ? options : parseMaybeJson(options, []),
    serrure_ref: grid.serrure_ref || grid.serrure?.ref || null,
    serrure_prix: grid.serrure_prix ?? grid.serrure?.prix ?? null,
    ferme_porte_ref: grid.ferme_porte_ref || grid.ferme_porte?.ref || null,
    ferme_porte_prix: grid.ferme_porte_prix ?? grid.ferme_porte?.prix ?? null,
    equipements_json: Array.isArray(equipments) ? equipments : parseMaybeJson(equipments, []),
    total_ligne_ht: grid.total_ligne_ht ?? grid.prix_total_min_ht ?? null,
    alertes_json: Array.isArray(alerts) ? alerts : parseMaybeJson(alerts, []),
    docs_json: Array.isArray(docs) ? docs : parseMaybeJson(docs, []),
  }
}

async function materializeVersionToDevis({ devisId, versionId }) {
  const [versionLines] = await db.query(
    'SELECT * FROM devis_version_lines WHERE version_id = ? ORDER BY position ASC, id ASC',
    [versionId]
  )
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query('DELETE FROM devis_lines WHERE devis_id = ?', [devisId])
    for (const line of versionLines) {
      const grid = parseMaybeJson(line.grid_json, {})
      const d = versionGridToDbLine(grid, line)
      await conn.query(
        `INSERT INTO devis_lines
          (devis_id, position, line_section, designation, type_porte, gamme, vantail,
           hauteur_mm, largeur_mm, prix_base_ht, ref_base, options_json,
           serrure_ref, serrure_prix, ferme_porte_ref, ferme_porte_prix,
           equipements_json, total_ligne_ht, alertes_json, docs_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          devisId,
          d.position,
          d.line_section,
          d.designation,
          d.type_porte,
          d.gamme,
          d.vantail,
          d.hauteur_mm,
          d.largeur_mm,
          d.prix_base_ht,
          d.ref_base,
          JSON.stringify(d.options_json),
          d.serrure_ref,
          d.serrure_prix,
          d.ferme_porte_ref,
          d.ferme_porte_prix,
          JSON.stringify(d.equipements_json),
          d.total_ligne_ht,
          JSON.stringify(d.alertes_json),
          JSON.stringify(d.docs_json),
        ]
      )
    }
    const [sumRows] = await conn.query('SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_lines WHERE devis_id = ?', [devisId])
    await conn.query('UPDATE devis SET current_version_id = ?, total_ht = ? WHERE id = ?', [versionId, sumRows[0].total, devisId])
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

const VANTAIL_LABELS = { '1V': 'UN VANTAIL', '2V': 'DEUX VANTAUX', 'SFX': 'SEMI-FIXE', '1VSFX': 'UN VANTAIL + SEMI-FIXE', '2VSFX': 'DEUX VANTAUX + SEMI-FIXE' }
const VANTAIL_CODE_RE = /\b(1V|2V|SFX|1VSFX|2VSFX)\b/gi

function cleanCodedText(str) {
  if (!str) return null
  // Expand type abbreviations (BP→BLOC-PORTE, etc.) and strip vantail codes
  let s = String(str)
    .replace(/\bBP\b/g, 'BLOC-PORTE')
    .replace(/\bCH\b/g, 'CHASSIS FIXE')
    .replace(/\bGI\b/g, 'GUICHET')
    .replace(VANTAIL_CODE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return s || null
}

function designationSearchText(line = {}) {
  const options = parseMaybeJson(line.options ?? line.options_json, [])
  const equipments = parseMaybeJson(line.equip_extra ?? line.equipements_json, [])
  const alerts = parseMaybeJson(line.alertes ?? line.alertes_json, [])
  const vantailLabel = line.vantail ? (VANTAIL_LABELS[String(line.vantail).toUpperCase()] || line.vantail) : null
  const gammeClean = cleanCodedText(line.gamme)
  const typeClean = cleanCodedText(line.type)
  const typePorteClean = cleanCodedText(line.type_porte)
  const parts = [
    line.designation,
    typeClean,
    typePorteClean,
    gammeClean,
    vantailLabel,
    line.haut_mm || line.hauteur_mm ? `H ${line.haut_mm || line.hauteur_mm}` : null,
    line.larg_mm || line.largeur_mm ? `L ${line.larg_mm || line.largeur_mm}` : null,
    line.serrure?.from,
    line.serrure?.ref,
    line.serrure_ref,
    line.ferme_porte?.from,
    line.ferme_porte?.ref,
    line.ferme_porte_ref,
    line.autres,
    ...(Array.isArray(options) ? options.map((option) => String(option?.label || '').trim()).filter(Boolean) : []),
    ...(Array.isArray(equipments) ? equipments.map((item) => String(item?.label || '').trim()).filter(Boolean) : []),
    ...(Array.isArray(alerts) ? alerts : []),
    // docs intentionally excluded: they are internal .md knowledge base refs, not commercial info
  ]
  return parts.filter(Boolean).join(' | ').replace(/\s+/g, ' ').trim()
}

// ── Multer : stockage dans /tmp, fichiers .xlsx uniquement ──────────────────
const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => cb(null, `devis-${crypto.randomUUID()}.xlsx`),
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok =
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.mimetype.includes('spreadsheet') ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ok ? cb(null, true) : cb(Object.assign(new Error('Seuls les fichiers .xlsx sont acceptés'), { code: 'BAD_TYPE' }))
  },
})

// Erreur multer → JSON
function multerErrorHandler(err, req, res, next) {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fichier trop volumineux (max 20 Mo)' })
  if (err?.code === 'BAD_TYPE') return res.status(400).json({ error: err.message })
  if (err?.name === 'MulterError') return res.status(400).json({ error: err.message })
  next(err)
}

// ── POST /api/devis/analyze ─────────────────────────────────────────────────
router.post('/analyze', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return multerErrorHandler(err, req, res, next)
    next()
  })
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier Excel requis (.xlsx)' })

  const inPath = req.file.path
  const outPath = join(os.tmpdir(), `devis-out-${crypto.randomUUID()}.json`)

  try {
    await execFileAsync('python3', [SCRIPT, inPath, outPath], {
      cwd: XLSX_DIR,
      timeout: 60000,
      env: await detectEnv(),
    })
    const raw = await readFile(outPath, 'utf-8')
    const results = JSON.parse(raw)
    res.json({ results })
  } catch (err) {
    console.error("ERREUR lors de l'appel Python ou lecture:", err)
    const detail = err.stderr || err.stdout || err.message || 'Erreur inconnue'
    res.status(500).json({ error: 'Erreur lors du traitement Python', details: detail })
  } finally {
    unlink(inPath).catch(() => { })
    unlink(outPath).catch(() => { })
  }
})

// ── GET /api/devis/types-options ────────────────────────────────────────────
// Retourne la liste des "types" (combinaison VL + gamme) lus depuis knowledge_tables.json
router.get('/types-options', async (_req, res) => {
  try {
    const { readFile } = await import('node:fs/promises')
    const path = await import('node:path')
    const ktPath = path.join(XLSX_DIR, 'knowledge_tables.json')
    const raw = await readFile(ktPath, 'utf8')
    const data = JSON.parse(raw)
    const tables = data?.tables_prix || data?.tables || data || {}
    const opts = []
    for (const key of Object.keys(tables)) {
      // Format clés: "<gamme>|<vl>"  ex: "CR4|1V", "CR4|2V", "CR4|Chassis", "BLAST|Chassis"
      const [gamme, vl] = key.split('|')
      if (!gamme || !vl) continue
      const isChassis = /^chassis$/i.test(vl)
      const isGuichet = /^guichet/i.test(vl)
      let label
      if (isChassis) label = `Chassis ${gamme}`
      else if (isGuichet) label = `Guichet ${gamme}`
      else label = `BP ${vl} ${gamme}` // ex: BP 1V CR4
      opts.push({ value: label, label, gamme, vl })
    }
    // Tri stable: BP avant Chassis avant Guichet, par gamme
    const order = (o) => (o.label.startsWith('BP ') ? 0 : o.label.startsWith('Chassis') ? 1 : 2)
    opts.sort((a, b) => order(a) - order(b) || a.label.localeCompare(b.label, 'fr'))
    // Dédoublonnage par label
    const seen = new Set()
    const uniq = opts.filter(o => seen.has(o.label) ? false : (seen.add(o.label), true))
    res.json({ options: uniq })
  } catch (err) {
    res.status(500).json({ error: 'Erreur types-options', details: err.message })
  }
})

// ── POST /api/devis/recompute-row ───────────────────────────────────────────
// body: { row: [16 cols], qty?: number } — recalcule une ligne en passant par detect_nexus.py --recompute
router.post('/recompute-row', async (req, res) => {
  const rowArr = req.body?.row
  const qty = Math.max(1, parseInt(req.body?.qty) || 1)
  if (!Array.isArray(rowArr)) return res.status(400).json({ error: 'row (array) requis' })
  try {
    const { spawn } = await import('node:child_process')
    const child = spawn('python3', [SCRIPT, '--recompute'], { cwd: XLSX_DIR, env: await detectEnv() })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.stdin.write(JSON.stringify({ row: rowArr, qty }))
    child.stdin.end()
    const exitCode = await new Promise(resolve => child.on('close', resolve))
    if (exitCode !== 0) {
      return res.status(500).json({ error: 'detect_nexus.py a échoué', details: stderr || stdout })
    }
    // Le script écrit info + JSON sur stdout ; on prend la dernière ligne JSON
    const lines = stdout.trim().split('\n').filter(Boolean)
    const lastLine = lines[lines.length - 1] || '{}'
    const result = JSON.parse(lastLine)
    res.json({ result })
  } catch (err) {
    res.status(500).json({ error: 'Erreur recompute', details: err.message })
  }
})

// ── POST /api/devis/lookup-ref ───────────────────────────────────────────────
// body: { ref: "4402" } → { found, label, prix, source }
router.post('/lookup-ref', async (req, res) => {
  const ref = String(req.body?.ref || '').trim()
  if (!ref) return res.status(400).json({ error: 'ref requise' })
  try {
    const { spawn } = await import('node:child_process')
    const child = spawn('python3', [SCRIPT, '--lookup-ref', ref], { cwd: XLSX_DIR, env: await detectEnv() })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.stdin.end()
    const exitCode = await new Promise(resolve => child.on('close', resolve))
    if (exitCode !== 0) return res.status(500).json({ error: 'lookup-ref échoué', details: stderr })
    const lines = stdout.trim().split('\n').filter(l => l.trim().startsWith('{'))
    const result = JSON.parse(lines[lines.length - 1] || '{"found":false}')
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'Erreur lookup-ref', details: err.message })
  }
})

// ── POST /api/devis/parse-line ───────────────────────────────────────────────
// body: { text: string }
// Retourne: { raw: [17 valeurs], parsed: { type, larg_mm, haut_mm, rc, pb, cf, ... } }
// Gemma 4 (vLLM) parse le texte libre → JSON _raw
router.post('/parse-line', async (req, res) => {
  const text = req.body?.text?.trim()
  if (!text) return res.status(400).json({ error: 'text requis' })
  const model = process.env.OLLAMA_MODEL || 'google/gemma-4-E2B-it'
  const systemPrompt = `Tu es un assistant spécialisé dans les portes coupe-feu/anti-effraction NEXUS.
Tu dois extraire depuis une description libre les champs d'une ligne de devis et retourner UNIQUEMENT un objet JSON valide, sans texte autour.

Format JSON attendu (toutes les clés présentes, null si absent):
{
  "type": "<ex: BP 1V, BP 2V, Chassis CR4, Guichet CR4>",
  "larg_mm": <largeur en mm entier ou null>,
  "haut_mm": <hauteur en mm entier ou null>,
  "rc": "<CR3|CR4|CR5|CR6 ou null>",
  "pb": "<FB4|FB5|FB6|FB7 ou null>",
  "cf": "<EI30|EI60|EI120 ou null>",
  "blast": "<2t/m²|4t/m²|5t/m² ou null>",
  "belier": "<Bélier ou null>",
  "prison": "<Prison ou null>",
  "tornade": null,
  "seisme": null,
  "aev": null,
  "serrure": "<libellé serrure ou null>",
  "garn_int": "<libellé garniture intérieure ou null>",
  "garn_ext": "<libellé garniture extérieure ou null>",
  "fp": "<description du ferme-porte demandé ex: TS-5000 bras glissière, TS-4000 bras compas, ou null si aucun>",
  "autres": "<autres équipements, thermolaquage/RAL si peinture spécifique, ou null>"
}

Règles:
- Les dimensions peuvent être données comme "1300x2100", "H=2100 L=1300", "1300 2100" → larg=1300, haut=2100
- "CR4", "FB4", "EI60" peuvent être dans la description principale
- Si la gamme est dans le type (ex "BP 1V CR4"), ne la duplique pas dans rc
- "thermolaquage", "TL", "RAL XXXX" → mettre dans autres
- La performance acoustique (30 dB, 35 dB, 40 dB, 45 dB) → mettre dans autres (ex: "acoustique 40 dB")
- Le ferme-porte est dans fp ; si la description dit "avec FP", "ferme-porte bras glissière", etc. → mettre dans fp
- tornade, seisme, aev = toujours null (gérés séparément)
- Réponds UNIQUEMENT avec le JSON, aucun commentaire, aucun markdown`

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30000)
    const raw = await chatCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      maxTokens: 512,
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer))

    // Extrait le JSON (parfois Gemma entoure avec ```)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(422).json({ error: 'Gemma n\'a pas retourné de JSON', raw })
    const parsed = JSON.parse(jsonMatch[0])

    // Construit le _raw[17] dans l'ordre attendu par detect_nexus.py
    const rowArr = [
      parsed.type || null,   // 0
      parsed.larg_mm != null ? Number(parsed.larg_mm) : null, // 1
      parsed.haut_mm != null ? Number(parsed.haut_mm) : null, // 2
      parsed.rc || null,  // 3
      parsed.pb || null,  // 4
      parsed.cf || null,  // 5
      parsed.blast || null,  // 6
      parsed.belier || null,  // 7
      parsed.prison || null,  // 8
      parsed.tornade || null,  // 9
      parsed.seisme || null,  // 10
      parsed.aev || null,  // 11
      parsed.serrure || null,  // 12
      parsed.garn_int || null,  // 13
      parsed.garn_ext || null,  // 14
      parsed.fp || null,  // 15
      parsed.autres || null,  // 16
    ]

    res.json({ parsed, row: rowArr })
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Timeout vLLM (30s)' })
    res.status(500).json({ error: 'Erreur parse-line', details: err.message })
  }
})

// ── POST /api/devis/suggest-designation ────────────────────────────────────
// Gemma propose une désignation PDF en s'appuyant sur les devis historiques vectorisés
router.post('/suggest-designation', async (req, res) => {
  const line = req.body?.line || req.body || {}
  const contextLines = Array.isArray(req.body?.context_lines) ? req.body.context_lines : []
  // Exclude existing designation from query: we're regenerating it from scratch
  const query = designationSearchText({ ...line, designation: '' })
  if (!query) return res.status(400).json({ error: 'line requis' })

  try {
    const examples = await searchDesignationExamples({ text: query, topK: 4, minScore: 0.30 })
    if (!examples.length) {
      return res.status(404).json({ error: 'Aucun exemple historique proche trouvé', query })
    }

    const model = await getGlobalOllamaModel()
    const examplesText = examples.map((example, index) => `EXEMPLE ${index + 1} - score ${Number(example.score || 0).toFixed(3)} - ${example.source_pdf} rep. ${example.repere || '?'}\n${example.designation}`).join('\n\n---\n\n')
    const systemPrompt = `Tu es rédacteur de devis NEXUS.
Tu dois générer le libellé commercial complet d'une ligne de devis PDF en reprenant exactement le style et la structure des anciens devis DOORTAL/ZERUX fournis en exemples.

Structure obligatoire (dans cet ordre, en sautant les informations absentes) :
1. TITRE EN MAJUSCULES (ex: BLOC-PORTE "NEXUS" DEUX VANTAUX)
2. Coefficient de transmission thermique Uw = … W/m².K (si applicable)
3. Classement résistance au feu (ou "Sans classement de résistance au feu")
4. Classement anti-effraction (ex: niveau CR4 selon normes EN 1627 - 1630)
5. Description vantaux (matériau, épaisseur tôle)
6. Affaiblissement acoustique Xdb sur attestation (si applicable)
7. Dimensions sur mesure : L … H … Passage libre à 90° (ou 180°)
8. Décomposition vantaux si deux vantaux (largeurs individuelles, hors-bati)
9. Soit dimensions hors-tout : L … H …
10. Réservation gros oeuvre prévoir : L … H …
11. Poids approximatif (vantaux + bâti)
12. Finition : acier galvanisé + thermolaquage …
13. Equipement fourni-posé : (puis liste avec "- " en début de chaque item)
14. Localisation (si mentionnée)

Contraintes absolues :
- Réponds UNIQUEMENT avec le libellé final brut, une information par ligne, sans markdown ni commentaire.
- Ne mets jamais de prix, quantité, délai, montant HT ou total.
- Utilise uniquement les informations présentes dans la ligne cible. Les exemples servent au style et aux formulations, pas à inventer des équipements.
- Si une information est absente dans la ligne cible, omet cette ligne.
- Le titre (ligne 1) doit toujours être en MAJUSCULES.
- N'utilise JAMAIS les codes internes bruts comme "1V", "2V", "BP", "CH", "SFX" dans le libellé. Ils sont déjà traduits : 1V=UN VANTAIL, 2V=DEUX VANTAUX, BP=BLOC-PORTE, CH=CHASSIS FIXE.
- Pour "Vantail en tôle épaisseur X" : utilise uniquement l'épaisseur si elle est explicitement disponible dans la ligne cible (ex: 20/10°, 25/10°). Si absente, écris uniquement "Vantail en tôle double face" sans épaisseur. NE JAMAIS inventer ni utiliser "1V" ou "2V" comme épaisseur.
- Ne mentionne jamais les noms de fichiers internes (ex: BASE.md, CR3.md, SERRURES-GARNITURES.md). Ces références sont strictement internes.`

    const contextText = contextLines
      .slice(0, 6)
      .map((ctx, idx) => `CONTEXTE ${idx + 1}: ${designationSearchText(ctx)}`)
      .filter(Boolean)
      .join('\n')
    const userPrompt = `EXEMPLES HISTORIQUES A IMITER:\n\n${examplesText}\n\nLIGNE CIBLE:\n${query}${contextText ? `\n\nCONTEXTE DU DEVIS (lignes voisines):\n${contextText}` : ''}\n\nLIBELLE A PRODUIRE:`
    const designation = await chatCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 900,
    })

    // Post-process: remove rogue internal codes that Gemma may still slip in
    let cleanDesignation = String(designation || '').trim()
    // "épaisseur 1V" / "épaisseur 2V" → "épaisseur 20/10°" (standard NEXUS tôle)
    cleanDesignation = cleanDesignation.replace(/épaisseur\s+[12]V\b/gi, 'épaisseur 20/10°')
    // "épaisseur 20/10°/10°" (duplicate suffix from bad XLSX data) → "épaisseur 20/10°"
    cleanDesignation = cleanDesignation.replace(/épaisseur\s+20\/10°\/10°/gi, 'épaisseur 20/10°')
    // Standalone "1V" or "2V" not preceded by a digit/ref (e.g. "CR3 — 1V" at end of line)
    cleanDesignation = cleanDesignation.replace(/(?<![A-Z\d])([12]V)\b(?!\s*[-–—])/g, (m, p1) =>
      p1 === '1V' ? 'UN VANTAIL' : 'DEUX VANTAUX'
    )
    // Fix malformed Uw lines:
    // Case 1: "Uw = None/null/undefined" → remove entire line
    cleanDesignation = cleanDesignation.replace(
      /Coefficient de transmission thermique Uw\s*=\s*(None|null|undefined)\s*\n?/gi,
      ''
    )
    // Case 2: "Uw = " at end of line (empty value) → remove
    cleanDesignation = cleanDesignation.replace(
      /Coefficient de transmission thermique Uw\s*=\s*\n/gi,
      ''
    )
    // Case 3: "Uw = Sans classement..." (Gemma merged Uw + feu line) → strip Uw prefix
    cleanDesignation = cleanDesignation.replace(
      /Coefficient de transmission thermique Uw\s*=\s*(?=Sans\s)/gi,
      ''
    )
    cleanDesignation = cleanDesignation.replace(/  +/g, ' ').trim()
    // Remove lines that contain only .md internal filenames (e.g. "Localisation : BASE.md")
    cleanDesignation = cleanDesignation.split('\n')
      .filter(l => !/\b\w[\w-]*\.md\b/.test(l))
      // Remove lines with prices or XLSX internal markers (whole or decimal amounts)
      .filter(l => !/\d+([,.]\d+)?\s*€/.test(l) && !/(xlsx|défaut gamme|× \d+\s*@)/i.test(l))
      // Remove empty "Localisation :" lines
      .filter(l => !/^Localisation\s*:\s*$/i.test(l.trim()))
      // Remove lines with Python "None" artifacts (null data from XLSX)
      .filter(l => !/\bNone\b/.test(l))
      // Remove alert/emoji items from KB alerts bleeding into equipment list
      .filter(l => !/^(?:-?\s*)?(?:ℹ|❌|⚠️|⚠|🔴|🟡|🟢)/u.test(l.trim()))
      // Remove template placeholder lines Gemma outputs verbatim from system prompt
      .filter(l => !/\bXdb\s+sur\s+attestation\b/i.test(l))
      .filter(l => !/\(si applicable\)/i.test(l))
      // Remove "Localisation :" lines containing internal product codes (not real room codes)
      .filter(l => !/^Localisation\s*:\s*(BP|CH|SFX|BLOC-PORTE|CHASSIS|GUICHET|GI|PT)\b/i.test(l.trim()))
      // Remove orphaned "W/m².K" or "… W/m².K" lines (Uw prefix was stripped, unit remains)
      .filter(l => !/^[…\s]*W\/m²\.K\s*$/.test(l.trim()))
      // Remove blank lines produced by cleanup
      .filter(l => l.trim())
      .join('\n')
      .trim()

    res.json({
      designation: cleanDesignation,
      query,
      context_count: contextLines.length,
      examples: examples.map((example) => ({
        score: example.score,
        source_pdf: example.source_pdf,
        page: example.page,
        repere: example.repere,
        title: example.title,
        designation: example.designation,
      })),
    })
  } catch (err) {
    console.error('suggest-designation error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/devis/ask ─────────────────────────────────────────────────────
// body: { rows: [...], question: string, mdFiles: [string], scope: 'line'|'all' }
router.post('/ask', async (req, res) => {
  const { rows = [], question, mdFiles = [], scope = 'line' } = req.body
  if (!question?.trim()) return res.status(400).json({ error: 'Question requise' })

  // ── Enrichissement automatique des markdowns selon les caractéristiques de la ligne ──
  // Objectif : garantir que Gemma a toujours accès aux bons référentiels croisés,
  // même si detect_nexus.py ne les a pas listés explicitement.
  const ALWAYS_LOAD = ['GUIDE-DEVIS.md', 'BASE.md', 'EQUIP-COMMUN.md', 'SERRURES-GARNITURES.md', 'TABLEAUX-ADDITIONNELS.md']
  // En mode "all", on prend toutes les lignes pour extraire les gammes/options ; sinon row[0]
  const contextRows = (scope === 'all' || rows.length > 1) ? rows : (rows[0] ? [rows[0]] : [])
  const crossRefs = new Set()
  for (const r of contextRows) {
    const gamme = String(r.gamme || '').toUpperCase()
    const options = Array.isArray(r.options) ? r.options : []
    const optionsText = options.map(o => String(o.label || '').toUpperCase()).join(' ')
    const extraText = String(r.type || '') + ' ' + optionsText + ' ' + JSON.stringify(r.alertes || [])
    const extraUpper = extraText.toUpperCase()

    if (gamme.includes('CR3')) crossRefs.add('CR3.md')
    if (gamme.includes('CR4')) crossRefs.add('CR4.md')
    if (gamme.includes('CR5')) crossRefs.add('CR5.md')
    if (gamme.includes('CR6')) crossRefs.add('CR6.md')
    if (gamme.includes('FB6') || gamme.includes('FB7')) crossRefs.add('FB6-7.md')
    if (gamme.includes('EI60')) crossRefs.add('EI60.md')
    if (gamme.includes('EI120')) crossRefs.add('EI120.md')
    if (gamme.includes('PRISON')) crossRefs.add('PRISON.md')
    if (gamme.includes('ANTI-BÉLIER') || gamme.includes('BELIER')) crossRefs.add('ANTI-BELIER.md')
    if (gamme.includes('BLAST')) crossRefs.add('BLAST.md')
    if (gamme.includes('EF2')) crossRefs.add('EF2.md')
    if (/EI\s?(30|60|120)/.test(extraUpper)) {
      crossRefs.add('EQUIP-EI.md')
      if (extraUpper.includes('EI60')) crossRefs.add('EI60.md')
      if (extraUpper.includes('EI120')) crossRefs.add('EI120.md')
    }
    if (/FB[4-7]/.test(extraUpper)) crossRefs.add('EQUIP-FB.md')
    if (extraUpper.includes('SÉISME') || extraUpper.includes('SEISME') || extraUpper.includes('AEV')) {
      crossRefs.add('SEISME-AEV.md')
    }
    if (extraUpper.includes('BLAST')) crossRefs.add('BLAST.md')
    if (extraUpper.includes('RAL') || extraUpper.includes('THERMOLAQUAGE') || extraUpper.includes('LAQUAGE')) {
      crossRefs.add('THERMOLAQUAGE.md')
    }
  }

  // Consolider : docs détectés + cross-refs + fichiers transverses systématiques
  const allDocs = [...new Set([
    ...mdFiles,
    ...Array.from(crossRefs),
    ...ALWAYS_LOAD,
  ])]

  // Chargement des markdowns référencés (protection path-traversal)
  const mdParts = []
  const loadedDocs = []
  for (const name of allDocs) {
    const safe = basename(name)                      // strip any path component
    const p = join(XLSX_DIR, safe)
    if (p.startsWith(XLSX_DIR) && existsSync(p)) {  // double-check prefix
      try {
        const content = await readFile(p, 'utf-8')
        mdParts.push(`### 📄 ${safe}\n\n${content}`)
        loadedDocs.push(safe)
      } catch { /* ignore unreadable files */ }
    }
  }

  const context = mdParts.join('\n\n---\n\n')

  // ── Règles métier : chargement SYSTÉMATIQUE (toujours injectées, indépendamment de la question) ──
  // Les règles métier approuvées s'appliquent à CHAQUE analyse — ne pas les filtrer par similarité.
  let mandatoryRulesBlock = ''
  try {
    const [rulesRows] = await db.query(
      `SELECT id, title, content, category FROM experiences WHERE status = 'approved' AND category IN ('Règle métier', 'Chiffrage', 'Validations individuelles R&D') ORDER BY id ASC`
    )
    if (rulesRows.length) {
      mandatoryRulesBlock =
        `\n\n[RÈGLES MÉTIER ET CHIFFRAGE APPROUVÉES — À APPLIQUER SYSTÉMATIQUEMENT SUR CHAQUE LIGNE :]\n` +
        `Ces règles s'appliquent à TOUTES les analyses, sans exception. Vérifie chacune d'elles pour chaque porte.\n` +
        rulesRows.map((r, i) => `${i + 1}. [${r.category}] ${r.title}\n${r.content}`).join('\n\n')
    }
  } catch { /* non-bloquant */ }

  // ── Expériences terrain : recherche sémantique (contexte-dépendant) ──
  const expKeywords = /expérience|commercial|précédent|collègue|équipe|terrain|cas vécu|autre(s)? commercial|ont traité|ont fait/i
  const expTopK = expKeywords.test(question) ? 8 : 5
  const expHitsRaw = await searchExperiences({ text: question, topK: expTopK }).catch(() => [])
  // Exclure les règles métier déjà injectées ci-dessus (éviter doublons)
  const expHits = expHitsRaw.filter(h => !['Règle métier', 'Chiffrage', 'Validations individuelles R&D'].includes(h.category))
  const expBlock = expHits.length
    ? `\n\n[EXPÉRIENCES TERRAIN — PRIORITÉ ABSOLUE SUR LA DOCUMENTATION :]\nSi une expérience terrain contredit ou précise le tarif standard, la règle terrain prime. Mentionne explicitement que tu appliques une règle métier ("D'après nos expériences commerciales...").\n` +
    expHits.map((h, i) => `${i + 1}. [${h.category || 'Général'}] ${h.title} — ${h.excerpt || ''}`).join('\n')
    : ''

  const systemMsg = `Tu es un expert NEXUS en menuiserie sécurisée (portes blindées RC3-RC6, coupe-feu EI60/EI120, pare-balles FB4-FB7).
Tu es avant tout un assistant conversationnel et naturel. Si l'utilisateur te salue, te demande comment tu vas ou te dit "tu es là ?", réponds naturellement, brièvement et poliment, sans générer d'analyse de devis si cela n'est pas explicitement demandé ou pertinent.
Quand il s'agit d'analyser des demandes clients ou de générer des devis (en t'appuyant sur le tarif NEXUS 2026-01), tu deviens précis et tu vérifies la cohérence des gammes, dimensions, options et équipements. Tu signales les alertes importantes.

CONVENTION DE LECTURE DES TABLEAUX DE PRIX (IMPORTANT) :
Les tableaux de prix fonctionnent par fourchettes de dimensions (hauteur HT en lignes, largeur HT en colonnes).
Convention PLANCHER (floor) : sélectionner le plus grand seuil ≤ à la dimension demandée.
Pour trouver le bon prix :
1. Prendre la PLUS GRANDE hauteur du tableau qui est <= à la hauteur demandée.
2. Prendre la PLUS GRANDE largeur du tableau qui est <= à la largeur demandée.
3. Lire le prix à l'intersection de cette ligne et cette colonne.
4. Si la dimension est inférieure à toutes les valeurs du tableau → hors catalogue.
5. Si la dimension dépasse toutes les valeurs du tableau → hors catalogue.
6. Si aucune entrée n'existe à cette intersection (—), signaler "hors catalogue, nous consulter".

Exemple : Pour un CR4 1V avec H=2100 mm et L=980 mm :
- Hauteurs du tableau : 2060, 2180, 2300, 2600 → plus grande <= 2100 = 2060
- Largeurs du tableau : 800, 960, 1415 → plus grande <= 980 = 960
- Prix = intersection (2060, 960) = 4 882 € HT

RÈGLE DE CROISEMENT DES RÉFÉRENTIELS (IMPORTANT) :
Pour chiffrer une porte correctement, tu dois TOUJOURS croiser plusieurs markdowns :
- GUIDE-DEVIS.md : la méthodologie globale de chiffrage (règles d'arrondi, logique de gamme, etc.)
- BASE.md : le catalogue de base (dimensions standards, serrures, ferme-portes communs)
- Le markdown de la GAMME détectée (CR3/CR4/CR5/CR6/FB6-7/EI60/EI120/PRISON/BLAST/ANTI-BELIER/EF2)
- EQUIP-COMMUN.md : les équipements communs (judas, œilletons, plinthes, poignées)
- EQUIP-EI.md : si option coupe-feu (EI30/EI60/EI120)
- EQUIP-FB.md : si option pare-balles (FB4/FB6/FB7)
- SEISME-AEV.md : si option anti-séisme ou AEV
- TABLEAUX-ADDITIONNELS.md : règles courtes issues des onglets additionnels du XLSX (séisme, AEV, Blast 0,5 t/m², bornes mini/maxi, pièces détachées)
- SERRURES-GARNITURES.md : TOUJOURS consulter pour connaître la serrure et les garnitures livrées par défaut avec chaque gamme. Ne jamais laisser serrure_ref vide sans avoir vérifié ce fichier.

CAS HORS CATALOGUE — traitement manuel obligatoire (ne jamais générer de prix automatique) :
- "Chassis vitré" ou toute porte avec H < 1500 mm (1V) / H < 1890 mm (2V) : hors plage catalogue, dimensions incompatibles avec les tableaux standard. Indiquer clairement "nous consulter — devis sur mesure" et ne pas chiffrer de prix de base.
- L > max de la gamme + H < minimum : impossible à fabriquer en standard.
- Toute configuration signalée "hors catalogue" dans GUIDE-DEVIS.md section "Cas hors catalogue" doit déclencher une alerte explicite sans estimation de prix.

CONVENTION DE LECTURE DES TABLEAUX DE PRIX (CRITIQUE) :
- Utiliser TOUJOURS la convention PLANCHER (floor) : sélectionner le plus grand seuil ≤ à la dimension demandée.
  Ex : H=2100 dans [1890, 2180, 2300, 2600] → utiliser H=1890.
  Ex : L=980 dans [800, 960, 1150] → utiliser L=960.
- Si dimension < minimum du tableau → hors catalogue.
- Si dimension > maximum du tableau → hors catalogue (sauf avis de chantier).
- Pour CR4+EI60 ou CR3+EI60 : la table de base est la table de la GAMME ANTI-EFFRACTION (CR4, CR3…), l'EI60 est une option en plus-value.
- Pour CR5+EI30 ou CR5+EI60 : utiliser la table CR5EI60 (pas de table CR5EI30 séparée).
- CR6 2 vantaux : non disponible au catalogue standard — hors catalogue.

Si deux markdowns se contredisent, privilégie le markdown de la gamme principale. Signale la contradiction.
Les fichiers transverses (GUIDE-DEVIS, BASE, EQUIP-COMMUN) sont TOUJOURS chargés pour toi — consulte-les systématiquement.
${context ? `\n\nBase documentaire NEXUS 2026 mise à disposition (${loadedDocs.length} fichiers : ${loadedDocs.join(', ')}) :\n\n${context}` : ''}${mandatoryRulesBlock}${expBlock}
Réponds en français de façon structurée et professionnelle. Si une information manque ou est incohérente, indique-le clairement.`

  const userContent = (() => {
    if (!rows.length) return question

    if (scope === 'all' || rows.length > 1) {
      // Résumé synthétique du devis complet
      const summary = rows.map((r, i) => {
        const opts = (r.options || []).map(o => o.label).join(', ') || '—'
        const alts = (r.alertes || []).join(' | ') || '—'
        return `Ligne ${i + 1}: ${r.gamme || '?'} ${r.vantail || ''} — H${r.dim_standard?.h ?? '?'}×L${r.dim_standard?.l ?? '?'} — Base: ${r.prix_base_ht != null ? r.prix_base_ht + ' €' : '?'} HT — Total: ${r.prix_total_min_ht != null ? r.prix_total_min_ht + ' €' : '?'} HT — Options: ${opts} — Alertes: ${alts}`
      }).join('\n')
      return `Ensemble du devis (${rows.length} ligne${rows.length > 1 ? 's' : ''}) :\n\`\`\`\n${summary}\n\`\`\`\n\nQuestion / Message : ${question}`
    }

    // Scope ligne unique
    return `Données de la ligne de devis en cours :\n\`\`\`json\n${JSON.stringify(rows[0], null, 2)}\n\`\`\`\n\nQuestion / Message : ${question}`
  })()

  try {
    const model = await getGlobalOllamaModel()
    const answer = await chatCompletion({
      model,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userContent },
      ],
    })
    res.json({ answer })
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ── CRUD DEVIS (headers) ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/devis — list all devis for current user
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM devis WHERE created_by = ? ORDER BY updated_at DESC`,
      [req.user.id]
    )
    res.json(rows)
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// GET /api/devis/:id/versions — version tree for a devis
router.get('/:id/versions', async (req, res) => {
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    const current = await ensureInitialVersion(devis, req.user.id)
    const [versions] = await db.query(
      'SELECT * FROM devis_versions WHERE devis_id = ? ORDER BY created_at ASC, id ASC',
      [devis.id]
    )
    const versionIds = versions.map(version => version.id)
    let comments = []
    let checks = []
    if (versionIds.length) {
      const [commentRows] = await db.query(
        'SELECT * FROM devis_version_comments WHERE version_id IN (?) ORDER BY created_at ASC, id ASC',
        [versionIds]
      )
      comments = commentRows
      const [checkRows] = await db.query(
        'SELECT * FROM devis_rule_checks WHERE version_id IN (?) ORDER BY created_at DESC, id DESC',
        [versionIds]
      )
      checks = checkRows
    }
    const commentsByVersion = new Map()
    for (const comment of comments) {
      const list = commentsByVersion.get(comment.version_id) || []
      list.push({
        ...comment,
        meta_json: parseMaybeJson(comment.meta_json, null),
      })
      commentsByVersion.set(comment.version_id, list)
    }
    const latestCheckByVersion = new Map()
    for (const check of checks) {
      if (!latestCheckByVersion.has(check.version_id)) {
        latestCheckByVersion.set(check.version_id, {
          ...check,
          report_json: parseMaybeJson(check.report_json, null),
          summary_json: parseMaybeJson(check.summary_json, null),
        })
      }
    }
    res.json({
      devis_id: devis.id,
      current_version_id: current.id,
      versions: versions.map(version => ({
        ...version,
        snapshot_json: parseMaybeJson(version.snapshot_json, null),
        comments: commentsByVersion.get(version.id) || [],
        latest_check: latestCheckByVersion.get(version.id) || null,
        locked: isLockedVersion(version),
      })),
    })
  } catch (err) {
    console.error('versions list error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/devis/:id/versions/:versionId — full version detail
router.get('/:id/versions/:versionId', async (req, res) => {
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    const version = await loadVersionForDevis(devis.id, req.params.versionId)
    if (!version) return res.status(404).json({ error: 'Version introuvable' })
    const [lines] = await db.query(
      'SELECT * FROM devis_version_lines WHERE version_id = ? ORDER BY position ASC, id ASC',
      [version.id]
    )
    const [comments] = await db.query(
      'SELECT * FROM devis_version_comments WHERE version_id = ? ORDER BY created_at ASC, id ASC',
      [version.id]
    )
    const [checks] = await db.query(
      'SELECT * FROM devis_rule_checks WHERE version_id = ? ORDER BY created_at DESC, id DESC',
      [version.id]
    )
    res.json({
      ...version,
      snapshot_json: parseMaybeJson(version.snapshot_json, null),
      locked: isLockedVersion(version),
      lines: lines.map(line => ({
        ...line,
        grid_json: parseMaybeJson(line.grid_json, {}),
      })),
      comments: comments.map(comment => ({
        ...comment,
        meta_json: parseMaybeJson(comment.meta_json, null),
      })),
      checks: checks.map(check => ({
        ...check,
        report_json: parseMaybeJson(check.report_json, null),
        summary_json: parseMaybeJson(check.summary_json, null),
      })),
    })
  } catch (err) {
    console.error('version detail error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/versions — create a child version/branch
router.post('/:id/versions', async (req, res) => {
  const { source_version_id, parent_version_id, version_label, branch_label, title, comment, step_key } = req.body || {}
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    const current = await ensureInitialVersion(devis, req.user.id)
    const explicitSourceVersionId = source_version_id || parent_version_id || null
    const sourceVersionId = explicitSourceVersionId || current.id
    const sourceVersion = sourceVersionId ? await loadVersionForDevis(devis.id, sourceVersionId) : null
    if (sourceVersionId && !sourceVersion) return res.status(404).json({ error: 'Version source introuvable' })
    const version = sourceVersion
      ? await createVersionFromSource({
        devis,
        sourceVersion,
        versionLabel: version_label,
        branchLabel: branch_label,
        title,
        comment,
        stepKey: step_key || 'versions',
        userId: req.user.id,
      })
      : await createVersionSnapshot({
        devis,
        parentVersionId: parent_version_id || null,
        versionLabel: version_label,
        branchLabel: branch_label,
        title,
        comment,
        stepKey: step_key || 'versions',
        userId: req.user.id,
      })
    await materializeVersionToDevis({ devisId: devis.id, versionId: version.id })
    res.status(201).json(version)
  } catch (err) {
    console.error('version create error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/versions/:versionId/activate — set active version
router.post('/:id/versions/:versionId/activate', async (req, res) => {
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    const version = await loadVersionForDevis(devis.id, req.params.versionId)
    if (!version) return res.status(404).json({ error: 'Version introuvable' })
    await materializeVersionToDevis({ devisId: devis.id, versionId: version.id })
    res.json({ success: true, current_version_id: version.id })
  } catch (err) {
    console.error('version activate error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/versions/:versionId/comments — add an internal comment
router.post('/:id/versions/:versionId/comments', async (req, res) => {
  const { content, step_key, kind = 'comment', meta } = req.body || {}
  if (!content?.trim()) return res.status(400).json({ error: 'content requis' })
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    const version = await loadVersionForDevis(devis.id, req.params.versionId)
    if (!version) return res.status(404).json({ error: 'Version introuvable' })
    const [result] = await db.query(
      `INSERT INTO devis_version_comments (version_id, step_key, kind, content, meta_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [version.id, normalizeStepKey(step_key), normalizeCommentKind(kind), content.trim(), jsonForDb(meta), req.user.id]
    )
    const [rows] = await db.query('SELECT * FROM devis_version_comments WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) {
    console.error('version comment error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/versions/:versionId/checkpoint — snapshot current lines into version
router.post('/:id/versions/:versionId/checkpoint', async (req, res) => {
  const { comment, step_key, kind = 'checkpoint', status } = req.body || {}
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    const version = await loadVersionForDevis(devis.id, req.params.versionId)
    if (!version) return res.status(404).json({ error: 'Version introuvable' })
    const updated = await checkpointVersionFromCurrentLines({
      devis,
      version,
      comment,
      stepKey: step_key || 'grid',
      kind,
      status,
      userId: req.user.id,
    })
    res.json(updated)
  } catch (err) {
    console.error('version checkpoint error:', err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

// PUT /api/devis/:id/versions/:versionId/pdf-labels — persist commercial PDF labels in the active version
router.put('/:id/versions/:versionId/pdf-labels', async (req, res) => {
  const labels = Array.isArray(req.body?.labels) ? req.body.labels : []
  if (!labels.length) return res.status(400).json({ error: 'labels requis' })
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    const version = await loadVersionForDevis(devis.id, req.params.versionId)
    if (!version) return res.status(404).json({ error: 'Version introuvable' })
    if (isLockedVersion(version)) return res.status(409).json({ error: 'Version verrouillée : créez une nouvelle branche pour modifier les libellés PDF' })

    const conn = await db.getConnection()
    let updated = 0
    try {
      await conn.beginTransaction()
      for (const item of labels) {
        const rawDesignationPdf = item.designation_pdf ?? item.designation
        const designationPdf = rawDesignationPdf == null ? null : String(rawDesignationPdf).trim()
        const lineId = Number(item.line_id || item.id || 0)
        const position = Number.isFinite(Number(item.position)) ? Number(item.position) : null
        const lineSection = normalizeLineSection(item.line_section)

        if (lineId > 0) {
          await conn.query('UPDATE devis_lines SET designation = ? WHERE devis_id = ? AND id = ?', [designationPdf, devis.id, lineId])
        }

        let versionRows = []
        if (lineId > 0) {
          const [rows] = await conn.query(
            'SELECT * FROM devis_version_lines WHERE version_id = ? AND source_line_id = ? LIMIT 1',
            [version.id, lineId]
          )
          versionRows = rows
        }
        if (!versionRows.length && position != null) {
          const [rows] = await conn.query(
            'SELECT * FROM devis_version_lines WHERE version_id = ? AND position = ? AND line_section = ? LIMIT 1',
            [version.id, position, lineSection]
          )
          versionRows = rows
        }
        const versionLine = versionRows[0]
        if (versionLine) {
          const grid = parseMaybeJson(versionLine.grid_json, {}) || {}
          grid.designation = designationPdf || ''
          await conn.query(
            'UPDATE devis_version_lines SET designation_pdf = ?, grid_json = ? WHERE id = ?',
            [designationPdf, JSON.stringify(grid), versionLine.id]
          )
          updated += 1
        }
      }
      await conn.query('UPDATE devis_versions SET status = ? WHERE id = ?', ['prepdf', version.id])
      if (req.body?.comment?.trim()) {
        await conn.query(
          `INSERT INTO devis_version_comments (version_id, step_key, kind, content, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [version.id, 'prepdf', 'checkpoint', req.body.comment.trim(), req.user.id]
        )
      }
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    const lines = await fetchDevisLines(devis.id)
    res.json({ success: true, updated, version_id: version.id, lines })
  } catch (err) {
    console.error('version pdf-labels error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/versions/:versionId/lock — lock a version after final PDF/HubSpot
router.post('/:id/versions/:versionId/lock', async (req, res) => {
  const { status = 'pdf_generated', comment = null, step_key = 'pdf' } = req.body || {}
  const nextStatus = normalizeVersionStatus(status)
  if (!LOCKED_VERSION_STATUSES.has(nextStatus)) return res.status(400).json({ error: 'status de verrouillage invalide' })
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    const version = await loadVersionForDevis(devis.id, req.params.versionId)
    if (!version) return res.status(404).json({ error: 'Version introuvable' })
    await db.query('UPDATE devis_versions SET status = ?, locked_at = COALESCE(locked_at, NOW()) WHERE id = ?', [nextStatus, version.id])
    if (comment?.trim()) {
      await db.query(
        `INSERT INTO devis_version_comments (version_id, step_key, kind, content, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [version.id, normalizeStepKey(step_key), nextStatus === 'sent_hubspot' ? 'hubspot' : 'pdf', comment.trim(), req.user.id]
      )
    }
    const [rows] = await db.query('SELECT * FROM devis_versions WHERE id = ?', [version.id])
    res.json(rows[0])
  } catch (err) {
    console.error('version lock error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/devis/sample-pdf — preview PDF with demo data ────────────────
router.get('/sample-pdf', async (req, res) => {
  try {
    const { buildDevisNexusPdf } = await import('../devis-pdf.js')
    const devis = {
      id: 0,
      name: 'DEMO-2026-00',
      deal_id: 'P26-DEMO-1B',
      client_name: 'CLIENT DÉMO — DEMO LOGISTICS SAS',
      total_ht: null,
      created_at: new Date().toISOString(),
    }
    const lines = [
      {
        position: 1,
        designation: 'NEXUS CR4 — 1 VANTAIL — H 2180 × L 960 MM',
        gamme: 'CR4',
        vantail: '1V',
        hauteur_mm: 2180,
        largeur_mm: 960,
        total_ligne_ht: 5962,
        options_json: JSON.stringify([]),
        serrure_ref: 'À définir — voir GUIDE-DEVIS.md',
      },
      {
        position: 2,
        designation: 'NEXUS CR6 — 1 VANTAIL — H 2300 × L 1150 MM',
        gamme: 'CR6',
        vantail: '1V',
        hauteur_mm: 2300,
        largeur_mm: 1150,
        total_ligne_ht: 25412,
        options_json: JSON.stringify([{ label: 'FB7', prix: 8000 }]),
        serrure_ref: 'À définir — voir CR6.md',
      },
    ]
    const { buffer, filename } = await buildDevisNexusPdf({ devis, lines })
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': buffer.length,
    })
    res.end(buffer)
  } catch (err) {
    console.error('sample pdf error:', err)
    res.status(500).json({ error: 'Erreur génération PDF démo', details: err.message })
  }
})

// GET /api/devis/:id — single devis with lines
router.get('/:id', async (req, res) => {
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    const currentVersion = await ensureInitialVersion(devis, req.user.id)
    const [lines] = await db.query(
      'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY FIELD(line_section, "products", "calculations", "transport"), position ASC, id ASC',
      [devis.id]
    )
    res.json({ ...devis, current_version_id: currentVersion.id, current_version: currentVersion, lines })
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// POST /api/devis — create a new devis
router.post('/', async (req, res) => {
  const { deal_id, company_id, client_name, name, source_file } = req.body
  try {
    const [result] = await db.query(
      `INSERT INTO devis (deal_id, company_id, client_name, name, source_file, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [deal_id || null, company_id || null, client_name || null, name || 'Nouveau devis', source_file || null, req.user.id]
    )
    const [rows] = await db.query('SELECT * FROM devis WHERE id = ?', [result.insertId])
    const version = await ensureInitialVersion(rows[0], req.user.id)
    res.status(201).json({ ...rows[0], current_version_id: version.id, current_version: version })
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// PUT /api/devis/:id — update devis header
router.put('/:id', async (req, res) => {
  const allowed = ['deal_id', 'company_id', 'client_name', 'name', 'status', 'source_file', 'analysis_json', 'validation_json', 'total_ht', 'pdf_path', 'hubspot_note_id']
  const sets = []
  const vals = []
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`)
      vals.push(key.endsWith('_json') ? JSON.stringify(req.body[key]) : req.body[key])
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  vals.push(req.params.id)
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    await db.query(`UPDATE devis SET ${sets.join(', ')} WHERE id = ?`, vals)
    const [rows] = await db.query('SELECT * FROM devis WHERE id = ?', [req.params.id])
    res.json(rows[0])
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// DELETE /api/devis/:id
router.delete('/:id', async (req, res) => {
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    await db.query('DELETE FROM devis WHERE id = ?', [devis.id])
    res.json({ success: true })
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ── CRUD DEVIS LINES ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/devis/:id/lines
router.get('/:id/lines', async (req, res) => {
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    const [rows] = await db.query(
      'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY FIELD(line_section, "products", "calculations", "transport"), position ASC, id ASC',
      [devis.id]
    )
    res.json(rows)
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/lines — add a line
router.post('/:id/lines', async (req, res) => {
  const d = req.body
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    // Auto position = max+1
    const [maxPos] = await db.query(
      'SELECT COALESCE(MAX(position), -1) AS mp FROM devis_lines WHERE devis_id = ?',
      [devis.id]
    )
    const pos = d.position ?? (maxPos[0].mp + 1)
    const [result] = await db.query(
      `INSERT INTO devis_lines
       (devis_id, position, line_section, designation, type_porte, gamme, vantail,
        hauteur_mm, largeur_mm, prix_base_ht, ref_base, options_json,
        serrure_ref, serrure_prix, ferme_porte_ref, ferme_porte_prix,
        equipements_json, total_ligne_ht, alertes_json, docs_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        devis.id, pos, normalizeLineSection(d.line_section),
        d.designation || null, d.type_porte || null, d.gamme || null, d.vantail || null,
        d.hauteur_mm || null, d.largeur_mm || null, d.prix_base_ht || null,
        d.ref_base || null,
        d.options_json ? JSON.stringify(d.options_json) : null,
        d.serrure_ref || null, d.serrure_prix || null,
        d.ferme_porte_ref || null, d.ferme_porte_prix || null,
        d.equipements_json ? JSON.stringify(d.equipements_json) : null,
        d.total_ligne_ht || null,
        d.alertes_json ? JSON.stringify(d.alertes_json) : null,
        d.docs_json ? JSON.stringify(d.docs_json) : null,
      ]
    )
    const [rows] = await db.query('SELECT * FROM devis_lines WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/lines/bulk — import multiple lines from analysis
router.post('/:id/lines/bulk', async (req, res) => {
  const { lines } = req.body
  if (!Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'lines array required' })
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    // Clear existing lines first
    await db.query('DELETE FROM devis_lines WHERE devis_id = ?', [devis.id])
    for (let i = 0; i < lines.length; i++) {
      const d = lines[i]
      const totalLigne = (d.prix_base_ht || 0) + (d.options?.reduce((s, o) => s + (o.prix || 0), 0) || 0) + (d.serrure_prix || 0) + (d.ferme_porte_prix || 0)
      const pricedTotal = d.total_ligne_ht ?? d.prix_total_min_ht ?? totalLigne
      const storedTotal = isBlockingUnpricedLine(d) ? null : (pricedTotal || null)
      await db.query(
        `INSERT INTO devis_lines
          (devis_id, position, line_section, designation, type_porte, gamme, vantail,
          hauteur_mm, largeur_mm, prix_base_ht, ref_base, options_json,
          serrure_ref, serrure_prix, ferme_porte_ref, ferme_porte_prix,
          equipements_json, total_ligne_ht, alertes_json, docs_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          devis.id, i, normalizeLineSection(d.line_section),
          d.designation || d.type || null, d.type || null, d.gamme || null, d.vantail || null,
          d.haut_mm || d.hauteur_mm || null, d.larg_mm || d.largeur_mm || null,
          d.prix_base_ht || null,
          d.ref_base || null,
          d.options ? JSON.stringify(d.options) : null,
          d.serrure?.ref || null, null,
          d.ferme_porte?.ref || null, null,
          d.equip_extra ? JSON.stringify(d.equip_extra) : null,
          storedTotal,
          d.alertes ? JSON.stringify(d.alertes) : null,
          d.docs ? JSON.stringify(d.docs) : null,
        ]
      )
    }
    // Update devis total
    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_lines WHERE devis_id = ?',
      [devis.id]
    )
    await db.query('UPDATE devis SET total_ht = ?, status = ? WHERE id = ?', [sumRows[0].total, 'editing', devis.id])
    const [allLines] = await db.query('SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY FIELD(line_section, "products", "calculations", "transport"), position ASC, id ASC', [devis.id])
    res.json(allLines)
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// PUT /api/devis/:id/lines/:lineId — update a line
router.put('/:id/lines/:lineId', async (req, res) => {
  const allowed = ['position', 'line_section', 'designation', 'type_porte', 'gamme', 'vantail', 'hauteur_mm', 'largeur_mm', 'prix_base_ht', 'ref_base', 'options_json', 'serrure_ref', 'serrure_prix', 'ferme_porte_ref', 'ferme_porte_prix', 'equipements_json', 'total_ligne_ht', 'alertes_json', 'docs_json']
  const sets = []
  const vals = []
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`)
      vals.push(key === 'line_section' ? normalizeLineSection(req.body[key]) : (key.endsWith('_json') ? JSON.stringify(req.body[key]) : req.body[key]))
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  vals.push(req.params.lineId, req.params.id)
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    await db.query(`UPDATE devis_lines SET ${sets.join(', ')} WHERE id = ? AND devis_id = ?`, vals)
    // Recalculate devis total
    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_lines WHERE devis_id = ?',
      [devis.id]
    )
    await db.query('UPDATE devis SET total_ht = ? WHERE id = ?', [sumRows[0].total, devis.id])
    const [rows] = await db.query('SELECT * FROM devis_lines WHERE id = ?', [req.params.lineId])
    res.json(rows[0])
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// DELETE /api/devis/:id/lines/:lineId
router.delete('/:id/lines/:lineId', async (req, res) => {
  try {
    const devis = await loadDevisForUser(req.params.id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    await db.query('DELETE FROM devis_lines WHERE id = ? AND devis_id = ?', [req.params.lineId, devis.id])
    // Recalculate devis total
    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_lines WHERE devis_id = ?',
      [devis.id]
    )
    await db.query('UPDATE devis SET total_ht = ? WHERE id = ?', [sumRows[0].total, devis.id])
    res.json({ success: true })
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// ── GET /api/devis/:id/pdf — generate Playwright PDF for a devis ───────────
router.get('/:id/pdf', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID invalide' })
  try {
    const devis = await loadDevisForUser(id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })

    const [lines] = await db.query(
      'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY FIELD(line_section, "products", "calculations", "transport"), position ASC, id ASC',
      [id]
    )

    // Lazy-load PDF builder to avoid Playwright startup on every server boot
    const { buildDevisNexusPdf } = await import('../devis-pdf.js')
    const { buffer, filename } = await buildDevisNexusPdf({ devis, lines })

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    })
    res.end(buffer)
  } catch (err) {
    console.error('devis pdf generation error:', err)
    res.status(500).json({ error: 'Erreur génération PDF', details: err.message })
  }
})

// ── POST /api/devis/:id/validate-rules ──────────────────────────────────────
// Audite chaque ligne du devis contre TOUTES les règles métier approuvées.
// Pour chaque (ligne, règle) → verdict { status, reason, fix } via Gemma 4.
router.post('/:id/validate-rules', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID invalide' })
  try {
    const devis = await loadDevisForUser(id, req.user)
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' })
    const version = req.body?.version_id
      ? await loadVersionForDevis(devis.id, req.body.version_id)
      : await ensureInitialVersion(devis, req.user.id)
    if (!version) return res.status(404).json({ error: 'Version introuvable' })

    const { validateDevis } = await import('../services/rules-validator.js')
    const report = await validateDevis({ devisId: id })

    // Persister le rapport dans devis.validation_json (si la colonne existe)
    try {
      await db.query('UPDATE devis SET validation_json = ? WHERE id = ?', [JSON.stringify(report), id])
    } catch { /* colonne absente → ignorer, on retourne quand même le rapport */ }

    await db.query(
      `INSERT INTO devis_rule_checks (version_id, report_json, summary_json, created_by)
       VALUES (?, ?, ?, ?)`,
      [version.id, JSON.stringify(report), JSON.stringify(report.summary || {}), req.user.id]
    )
    await db.query(
      `INSERT INTO devis_version_comments (version_id, step_key, kind, content, meta_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        version.id,
        'check',
        'check',
        `Check règles : ${report.summary?.violation || 0} violation(s), ${report.summary?.warning || 0} avertissement(s)`,
        JSON.stringify({ rules_count: report.rules_count, summary: report.summary }),
        req.user.id,
      ]
    )
    if (!isLockedVersion(version)) {
      await db.query('UPDATE devis_versions SET status = ? WHERE id = ?', ['checked', version.id])
    }

    res.json({ ...report, version_id: version.id })
  } catch (err) {
    console.error('validate-rules error:', err)
    res.status(500).json({ error: 'Erreur validation des règles', details: err.message })
  }
})

// ── POST /api/devis/validate-lines ──────────────────────────────────────────
// Variante stateless : audit d'un tableau de lignes fourni dans le body
// (pratique juste après /analyze, avant persistance en DB).
// Body : { lines: [...] }
router.post('/validate-lines', async (req, res) => {
  const { lines } = req.body
  if (!Array.isArray(lines) || !lines.length) {
    return res.status(400).json({ error: 'lines array required' })
  }
  try {
    const { loadApprovedRules, validateLine } = await import('../services/rules-validator.js')
    const rules = await loadApprovedRules()
    if (!rules.length) {
      return res.json({ rules_count: 0, lines: [], summary: { ok: 0, warning: 0, violation: 0, na: 0 } })
    }
    const model = await getGlobalOllamaModel()
    const summary = { ok: 0, warning: 0, violation: 0, na: 0 }
    const results = []
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      // Adapter le format /analyze → format DB attendu par validateLine
      const lineLike = {
        id: l.id ?? null,
        position: l.position ?? i,
        designation: l.designation || l.type || null,
        type_porte: l.type || null,
        gamme: l.gamme || null,
        vantail: l.vantail || null,
        hauteur_mm: l.haut_mm || l.hauteur_mm || null,
        largeur_mm: l.larg_mm || l.largeur_mm || null,
        prix_base_ht: l.prix_base_ht ?? null,
        options_json: l.options ?? null,
        serrure_ref: l.serrure?.ref ?? null,
        ferme_porte_ref: l.ferme_porte?.ref ?? null,
        equipements_json: l.equip_extra ?? null,
        alertes_json: l.alertes ?? null,
        total_ligne_ht: l.prix_total_min_ht ?? null,
      }
      const verdicts = await validateLine({ line: lineLike, rules, model }).catch(() => [])
      for (const v of verdicts) summary[v.status] = (summary[v.status] || 0) + 1
      results.push({
        position: lineLike.position,
        designation: lineLike.designation,
        gamme: lineLike.gamme,
        vantail: lineLike.vantail,
        verdicts,
      })
    }
    res.json({
      generated_at: new Date().toISOString(),
      rules_count: rules.length,
      lines: results,
      summary,
    })
  } catch (err) {
    console.error('validate-lines error:', err)
    res.status(500).json({ error: 'Erreur validation', details: err.message })
  }
})

// ── POST /api/devis/save-as-rule ──────────────────────────────────────────
// Crée une expérience "Validations individuelles R&D" pré-remplie depuis une ligne de grille.
// Body: { title, content, category? }
// Tout utilisateur authentifié peut soumettre (status=pending, un admin valide ensuite).
router.post('/save-as-rule', async (req, res) => {
  const { title, content, category } = req.body
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: 'title et content requis' })
  }
  const cat = category?.trim() || 'Validations individuelles R&D'
  try {
    const [result] = await db.query(
      `INSERT INTO experiences (user_id, title, content, category, status, created_at) VALUES (?, ?, ?, ?, 'pending', NOW())`,
      [req.user.id, title.trim(), content.trim(), cat]
    )
    const [rows] = await db.query('SELECT * FROM experiences WHERE id = ?', [result.insertId])
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
