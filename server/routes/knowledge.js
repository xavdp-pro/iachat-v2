/**
 * /api/knowledge — Base de connaissances NEXUS consultable par les humains
 *
 * GET  /api/knowledge          → inventaire (docs + tables + stats)
 * GET  /api/knowledge/docs/:name → contenu markdown
 * GET  /api/knowledge/tables   → toutes les tables de prix + options + serrures + FP
 */
import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { readFile, readdir, stat } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'

const XLSX_DIR = '/apps/zeruxcom-v1/app/ressources/XLSX'
const TABLES_JSON = join(XLSX_DIR, 'knowledge_tables.json')

const router = Router()
router.use(authenticate)

// Ordre d'affichage des markdowns dans l'UI
const DOC_ORDER = [
  'GUIDE-DEVIS.md',
  'BASE.md',
  'CR3.md', 'CR4.md', 'CR5.md', 'CR6.md',
  'FB6-7.md',
  'EI60.md', 'EI120.md',
  'EQUIP-COMMUN.md', 'EQUIP-EI.md', 'EQUIP-FB.md',
  'BLAST.md', 'ANTI-BELIER.md', 'PRISON.md', 'EF2.md', 'SEISME-AEV.md',
  'SERRURES-GARNITURES.md',
]

const DOC_META = {
  'GUIDE-DEVIS.md': { label: 'Méthodologie devis', category: 'process' },
  'BASE.md': { label: 'Gamme BASE', category: 'gamme' },
  'CR3.md': { label: 'Gamme CR3 (RC3)', category: 'gamme' },
  'CR4.md': { label: 'Gamme CR4 (RC4)', category: 'gamme' },
  'CR5.md': { label: 'Gamme CR5 (RC5)', category: 'gamme' },
  'CR6.md': { label: 'Gamme CR6 (RC6)', category: 'gamme' },
  'FB6-7.md': { label: 'Gamme FB6-7 (pare-balles)', category: 'gamme' },
  'EI60.md': { label: 'Gamme EI60 (coupe-feu)', category: 'gamme' },
  'EI120.md': { label: 'Gamme EI120 (coupe-feu)', category: 'gamme' },
  'EQUIP-COMMUN.md': { label: 'Équipements communs', category: 'equip' },
  'EQUIP-EI.md': { label: 'Équipements coupe-feu', category: 'equip' },
  'EQUIP-FB.md': { label: 'Équipements pare-balles', category: 'equip' },
  'BLAST.md': { label: 'Porte Blast', category: 'spec' },
  'ANTI-BELIER.md': { label: 'Porte Anti-bélier', category: 'spec' },
  'PRISON.md': { label: 'Porte Prison', category: 'spec' },
  'EF2.md': { label: 'Porte EF2', category: 'spec' },
  'SEISME-AEV.md': { label: 'Anti-séisme / AEV', category: 'spec' },
  'SERRURES-GARNITURES.md': { label: 'Serrures & garnitures par défaut', category: 'equip' },
}

// ── GET /api/knowledge — inventaire global ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const files = await readdir(XLSX_DIR)
    const mdFiles = files.filter(f => f.endsWith('.md'))

    const docs = []
    for (const name of DOC_ORDER) {
      if (!mdFiles.includes(name)) continue
      const p = join(XLSX_DIR, name)
      const st = await stat(p)
      const content = await readFile(p, 'utf-8')
      const lines = content.split('\n').length
      const titleMatch = content.match(/^#\s+(.+)$/m)
      docs.push({
        name,
        label: DOC_META[name]?.label ?? name.replace('.md', ''),
        category: DOC_META[name]?.category ?? 'autre',
        size: st.size,
        lines,
        title: titleMatch?.[1] ?? name,
      })
    }

    // Docs non référencés dans DOC_ORDER (sécurité : on les remonte quand même)
    for (const name of mdFiles) {
      if (!DOC_ORDER.includes(name)) {
        const p = join(XLSX_DIR, name)
        const st = await stat(p)
        const content = await readFile(p, 'utf-8')
        docs.push({
          name,
          label: name.replace('.md', ''),
          category: 'autre',
          size: st.size,
          lines: content.split('\n').length,
          title: name,
        })
      }
    }

    let tablesMeta = null
    if (existsSync(TABLES_JSON)) {
      const raw = await readFile(TABLES_JSON, 'utf-8')
      const parsed = JSON.parse(raw)
      // Nouveau format : tableau [{id,gamme,vantaux,grid}]
      const isArray = Array.isArray(parsed)
      tablesMeta = {
        nbTables: isArray ? parsed.length : Object.keys(parsed.tables_prix || {}).length,
        nbOptions: isArray ? 0 : Object.keys(parsed.options_ht || {}).length,
        nbSerrures: isArray ? 0 : (parsed.serrures || []).length,
        nbFermePortes: isArray ? 0 : (parsed.ferme_portes || []).length,
        generatedAt: (await stat(TABLES_JSON)).mtime,
      }
    }

    res.json({
      docs,
      totalDocs: docs.length,
      totalBytes: docs.reduce((s, d) => s + d.size, 0),
      totalLines: docs.reduce((s, d) => s + d.lines, 0),
      tables: tablesMeta,
      howItWorks: {
        injection: "Les markdowns sont injectés dans le prompt Gemma à chaque requête /api/devis/ask : méthodologie (GUIDE-DEVIS), catalogue de base (BASE), gamme détectée (CRx/FBx/EIx/...), équipements (EQUIP-*) et expériences approuvées.",
        tables: "Les tableaux de prix servent à positionner une dimension (H × L) dans la bonne fourchette : on prend la plus petite valeur du tableau >= à la dimension demandée (arrondi au plafond).",
        control: "Chaque expérience validée par un admin est indexée dans Qdrant et remontée automatiquement si elle est pertinente pour la question posée (top 3 à 8 selon la requête).",
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/knowledge/docs/:name — contenu markdown brut ──────────────────
router.get('/docs/:name', async (req, res) => {
  const safe = basename(req.params.name)
  if (!safe.endsWith('.md')) return res.status(400).json({ error: 'Fichier markdown attendu' })
  const p = join(XLSX_DIR, safe)
  if (!p.startsWith(XLSX_DIR) || !existsSync(p)) {
    return res.status(404).json({ error: 'Document introuvable' })
  }
  try {
    const content = await readFile(p, 'utf-8')
    res.json({ name: safe, content })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/knowledge/tables — tableaux de prix + options ─────────────────
router.get('/tables', async (req, res) => {
  if (!existsSync(TABLES_JSON)) {
    return res.status(404).json({
      error: 'knowledge_tables.json absent — lancer python3 dump_knowledge.py',
    })
  }
  try {
    const raw = await readFile(TABLES_JSON, 'utf-8')
    res.json(JSON.parse(raw))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
