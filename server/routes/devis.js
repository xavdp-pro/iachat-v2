/**
 * /api/devis — Analyse Excel NEXUS + assistant Gemma
 *
 * POST /api/devis/conseils — session + résultats → conseils (expériences)
 * POST /api/devis/analyze   — upload .xlsx → exécute detect_nexus.py → retourne JSON
 * POST /api/devis/ask       — question Gemma avec contexte markdowns + lignes devis
 */
import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { chatCompletion } from '../services/ollama.js'
import { getGlobalOllamaModel } from '../services/appSettings.js'
import { searchExperiences } from '../services/memory.js'
import multer from 'multer'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, unlink } from 'fs/promises'
import { join, basename, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import os from 'os'
import crypto from 'crypto'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

// Répertoire des markdowns NEXUS
const XLSX_DIR = '/apps/zeruxcom-v1/app/ressources/XLSX'
const SCRIPT = join(XLSX_DIR, 'detect_nexus.py')

const router = Router()
router.use(authenticate)

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
      timeout: 60_000,
    })
    const raw = await readFile(outPath, 'utf-8')
    const results = JSON.parse(raw)
    res.json({ results })
  } catch (err) {
    const detail = err.stderr || err.stdout || err.message || 'Erreur inconnue'
    res.status(500).json({ error: 'Erreur lors du traitement Python', details: detail })
  } finally {
    unlink(inPath).catch(() => { })
    unlink(outPath).catch(() => { })
  }
})

// ── POST /api/devis/ask ─────────────────────────────────────────────────────
// body: { rows: [...], question: string, mdFiles: [string] }
router.post('/ask', async (req, res) => {
  const { rows = [], question, mdFiles = [] } = req.body
  if (!question?.trim()) return res.status(400).json({ error: 'Question requise' })

  // Chargement des markdowns référencés (protection path-traversal)
  const mdParts = []
  for (const name of mdFiles) {
    const safe = basename(name)                      // strip any path component
    const p = join(XLSX_DIR, safe)
    if (p.startsWith(XLSX_DIR) && existsSync(p)) {  // double-check prefix
      try {
        const content = await readFile(p, 'utf-8')
        mdParts.push(`### 📄 ${safe}\n\n${content}`)
      } catch { /* ignore unreadable files */ }
    }
  }

  const context = mdParts.join('\n\n---\n\n')

  // Inject approved commercial experiences from knowledge base
  const expHits = await searchExperiences({ text: question, topK: 3 }).catch(() => [])
  const expBlock = expHits.length
    ? `\n\n[Expériences terrain des commerciaux — à prendre en compte :]\n` +
    expHits.map((h, i) => `${i + 1}. [${h.category || 'Général'}] ${h.title} — ${h.excerpt || ''}`).join('\n')
    : ''

  const systemMsg = `Tu es un expert NEXUS en menuiserie sécurisée (portes blindées RC3-RC6, coupe-feu EI60/EI120, pare-balles FB4-FB7).
Tu analyses des demandes clients et génères des devis précis en t'appuyant sur le tarif NEXUS 2026-01.
Tu vérifies la cohérence des gammes, dimensions, options et équipements. Tu signales les alertes importantes.
${context ? `\n\nBase documentaire NEXUS 2026 mise à disposition :\n\n${context}` : ''}${expBlock}
Réponds en français de façon structurée et professionnelle. Si une information manque ou est incohérente, indique-le clairement.`

  const userContent = rows.length
    ? `Données de la ligne de devis analysée :\n\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\`\n\nQuestion : ${question}`
    : question

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
    res.status(500).json({ error: err.message })
  }
})

export default router
