/**
 * /api/documents
 *
 * Pipeline d'analyse documentaire :
 *   1. Upload fichier (PDF ou image)
 *   2. Enregistrement DB (status=pending)
 *   3. Parsing : PDF→text + PDF→images par page (document-parser)
 *   4. Analyse vision par page en parallèle (document-analyzer, max 3 simultanés)
 *   5. Synthèse globale
 *   6. Stockage DB + Qdrant
 *
 * Endpoints :
 *   POST   /api/documents/upload          Upload + déclenche pipeline (async)
 *   GET    /api/documents                 Liste (own / tous si admin)
 *   GET    /api/documents/:id             Détail avec pages
 *   DELETE /api/documents/:id            Supprimer doc + pages + Qdrant
 *   POST   /api/documents/search          Recherche sémantique
 */
import { Router } from 'express'
import multer from 'multer'
import path, { dirname, join } from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import db from '../db/index.js'
import { authenticate } from '../middleware/auth.js'
import { parseDocument } from '../services/document-parser.js'
import { analyzeDocument } from '../services/document-analyzer.js'
import { storeDocumentPage, deleteDocumentPages, searchDocuments } from '../services/memory.js'
import { getGlobalOllamaModel } from '../services/appSettings.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, '../../tmp/uploads')

// ── Multer : stockage disque (on a besoin du chemin pour pdftoppm) ──────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const ext = path.extname(file.originalname) || ''
    cb(null, `doc-${unique}${ext}`)
  },
})

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png',
  'image/webp', 'image/gif', 'image/tiff',
])

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) return cb(null, true)
    cb(new Error(`Type de fichier non supporté : ${file.mimetype}`))
  },
})

const router = Router()
router.use(authenticate)

// ── POST /api/documents/upload ─────────────────────────────────────────────
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
      return res.status(status).json({ error: err.message })
    }
    next()
  })
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' })

  const { originalname, mimetype, size, filename, path: filePath } = req.file

  // 1. Créer l'entrée DB (status=pending)
  const [ins] = await db.query(
    `INSERT INTO documents (user_id, filename, original_name, mime_type, file_size, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [req.user.id, filename, originalname, mimetype, size]
  )
  const documentId = ins.insertId

  // 2. Répondre immédiatement avec l'ID — le pipeline tourne en arrière-plan
  res.status(202).json({ id: documentId, status: 'pending', message: 'Analyse en cours…' })

  // 3. Pipeline async (non-bloquant pour le client)
  runPipeline(documentId, filePath, mimetype, originalname).catch((err) => {
    console.error(`[doc ${documentId}] pipeline fatal:`, err.message)
  })
})

// ── Pipeline principal (arrière-plan) ──────────────────────────────────────
async function runPipeline(documentId, filePath, mimeType, originalName) {
  try {
    // status → processing
    await db.query(`UPDATE documents SET status='processing' WHERE id=?`, [documentId])

    // Étape A : Parsing (texte + images par page)
    const { pageCount, pages } = await parseDocument(filePath, mimeType)
    await db.query(`UPDATE documents SET page_count=? WHERE id=?`, [pageCount, documentId])

    // Étape B : Récupérer le modèle configuré
    const model = await getGlobalOllamaModel().catch(() => null)
    if (!model) throw new Error('Aucun modèle vLLM configuré')

    // Étape C : Analyse vision parallèle + stockage DB au fil de l'eau
    const { pageResults, summary } = await analyzeDocument({
      pages,
      model,
      onPageDone: async (pageNumber, result) => {
        // Insérer la page dès qu'elle est analysée
        const pageText = pages.find((p) => p.pageNumber === pageNumber)?.text || ''
        const contentForQdrant = `${pageText}\n\n${result}`.trim()
        const [ins] = await db.query(
          `INSERT INTO document_pages (document_id, page_number, raw_text, vision_result)
           VALUES (?, ?, ?, ?)`,
          [documentId, pageNumber, pageText || null, result]
        )
        // Stocker dans Qdrant
        await storeDocumentPage({
          documentPageId: ins.insertId,
          documentId,
          pageNumber,
          text: contentForQdrant,
          originalName,
        })
      },
    })

    // Étape D : status → done + résumé global
    await db.query(
      `UPDATE documents SET status='done', summary=? WHERE id=?`,
      [summary, documentId]
    )

    console.log(`✅ [doc ${documentId}] analyse terminée (${pageCount} page(s))`)
  } catch (err) {
    console.error(`[doc ${documentId}] erreur pipeline:`, err.message)
    await db.query(
      `UPDATE documents SET status='error', error_msg=? WHERE id=?`,
      [err.message.slice(0, 499), documentId]
    ).catch(() => { })
  } finally {
    // Supprimer le fichier temporaire
    await fs.unlink(filePath).catch(() => { })
  }
}

// ── GET /api/documents ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin'
    const [rows] = isAdmin
      ? await db.query(
        `SELECT d.id, d.original_name, d.mime_type, d.file_size, d.page_count,
                  d.status, d.error_msg, d.created_at, u.name AS author_name
           FROM documents d LEFT JOIN users u ON u.id = d.user_id
           ORDER BY d.created_at DESC`
      )
      : await db.query(
        `SELECT d.id, d.original_name, d.mime_type, d.file_size, d.page_count,
                  d.status, d.error_msg, d.created_at, u.name AS author_name
           FROM documents d LEFT JOIN users u ON u.id = d.user_id
           WHERE d.user_id = ?
           ORDER BY d.created_at DESC`,
        [req.user.id]
      )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/documents/:id — détail avec pages ─────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[doc]] = await db.query(
      `SELECT d.*, u.name AS author_name
       FROM documents d LEFT JOIN users u ON u.id = d.user_id
       WHERE d.id = ?`,
      [req.params.id]
    )
    if (!doc) return res.status(404).json({ error: 'Document introuvable' })

    // Vérifier l'accès
    if (req.user.role !== 'admin' && doc.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' })
    }

    const [pages] = await db.query(
      `SELECT id, page_number, raw_text, vision_result
       FROM document_pages WHERE document_id = ? ORDER BY page_number ASC`,
      [req.params.id]
    )
    res.json({ ...doc, pages })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/documents/:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [[doc]] = await db.query(
      `SELECT id, user_id FROM documents WHERE id = ?`,
      [req.params.id]
    )
    if (!doc) return res.status(404).json({ error: 'Document introuvable' })
    if (req.user.role !== 'admin' && doc.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' })
    }

    // Récupérer les IDs de pages pour Qdrant
    const [pages] = await db.query(
      `SELECT id FROM document_pages WHERE document_id = ?`,
      [req.params.id]
    )
    if (pages.length > 0) {
      await deleteDocumentPages(pages.map((p) => p.id))
    }

    await db.query(`DELETE FROM documents WHERE id = ?`, [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/documents/search — recherche sémantique ─────────────────────
router.post('/search', async (req, res) => {
  const { query, topK = 5 } = req.body
  if (!query?.trim()) return res.status(400).json({ error: 'query requis' })

  try {
    const hits = await searchDocuments({ text: query, topK })
    // Enrichir avec info document depuis DB
    if (!hits.length) return res.json([])

    const docIds = [...new Set(hits.map((h) => h.document_id))]
    const [docs] = await db.query(
      `SELECT id, original_name, status FROM documents WHERE id IN (${docIds.map(() => '?').join(',')})`,
      docIds
    )
    const docMap = Object.fromEntries(docs.map((d) => [d.id, d]))

    const results = hits.map((h) => ({
      ...h,
      document: docMap[h.document_id] || null,
    }))

    res.json(results)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
