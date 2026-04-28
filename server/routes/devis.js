/**
 * /api/devis — Analyse Excel NEXUS + assistant Gemma + CRUD devis/lines
 *
 * POST /api/devis/conseils — session + résultats → conseils (expériences)
 * POST /api/devis/analyze   — upload .xlsx → exécute detect_nexus.py → retourne JSON
 * POST /api/devis/ask       — question Gemma avec contexte markdowns + lignes devis
 * CRUD /api/devis            — devis headers
 * CRUD /api/devis/:id/lines  — devis line items
 */
import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { chatCompletion } from '../services/ollama.js'
import { getGlobalOllamaModel } from '../services/appSettings.js'
import { searchExperiences } from '../services/memory.js'
import db from '../db/index.js'
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
    console.error("ERREUR lors de l'appel Python ou lecture:", err)
    const detail = err.stderr || err.stdout || err.message || 'Erreur inconnue'
    res.status(500).json({ error: 'Erreur lors du traitement Python', details: detail })
  } finally {
    unlink(inPath).catch(() => { })
    unlink(outPath).catch(() => { })
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
  const ALWAYS_LOAD = ['GUIDE-DEVIS.md', 'BASE.md', 'EQUIP-COMMUN.md', 'SERRURES-GARNITURES.md']
  // En mode "all", on prend toutes les lignes pour extraire les gammes/options ; sinon row[0]
  const contextRows = (scope === 'all' || rows.length > 1) ? rows : (rows[0] ? [rows[0]] : [])
  const row = contextRows[0] || {}

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
      `SELECT id, title, content, category FROM experiences WHERE status = 'approved' AND category = 'Règle métier' ORDER BY id ASC`
    )
    if (rulesRows.length) {
      mandatoryRulesBlock =
        `\n\n[RÈGLES MÉTIER APPROUVÉES — À APPLIQUER SYSTÉMATIQUEMENT SUR CHAQUE LIGNE :]\n` +
        `Ces règles s'appliquent à TOUTES les analyses, sans exception. Vérifie chacune d'elles pour chaque porte.\n` +
        rulesRows.map((r, i) => `${i + 1}. [${r.category}] ${r.title}\n${r.content}`).join('\n\n')
    }
  } catch { /* non-bloquant */ }

  // ── Expériences terrain : recherche sémantique (contexte-dépendant) ──
  const expKeywords = /expérience|commercial|précédent|collègue|équipe|terrain|cas vécu|autre(s)? commercial|ont traité|ont fait/i
  const expTopK = expKeywords.test(question) ? 8 : 5
  const expHitsRaw = await searchExperiences({ text: question, topK: expTopK }).catch(() => [])
  // Exclure les règles métier déjà injectées ci-dessus (éviter doublons)
  const expHits = expHitsRaw.filter(h => h.category !== 'Règle métier')
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

// GET /api/devis/:id — single devis with lines
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM devis WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' })
    const devis = rows[0]
    const [lines] = await db.query(
      'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY position ASC, id ASC',
      [devis.id]
    )
    res.json({ ...devis, lines })
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
    res.status(201).json(rows[0])
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// PUT /api/devis/:id — update devis header
router.put('/:id', async (req, res) => {
  const allowed = ['deal_id', 'company_id', 'client_name', 'name', 'status', 'source_file', 'analysis_json', 'total_ht', 'pdf_path', 'hubspot_note_id']
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
    await db.query('DELETE FROM devis WHERE id = ? AND created_by = ?', [req.params.id, req.user.id])
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
    const [rows] = await db.query(
      'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY position ASC, id ASC',
      [req.params.id]
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
    // Auto position = max+1
    const [maxPos] = await db.query(
      'SELECT COALESCE(MAX(position), -1) AS mp FROM devis_lines WHERE devis_id = ?',
      [req.params.id]
    )
    const pos = d.position ?? (maxPos[0].mp + 1)
    const [result] = await db.query(
      `INSERT INTO devis_lines
       (devis_id, position, designation, type_porte, gamme, vantail,
        hauteur_mm, largeur_mm, prix_base_ht, options_json,
        serrure_ref, serrure_prix, ferme_porte_ref, ferme_porte_prix,
        equipements_json, total_ligne_ht, alertes_json, docs_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, pos,
        d.designation || null, d.type_porte || null, d.gamme || null, d.vantail || null,
        d.hauteur_mm || null, d.largeur_mm || null, d.prix_base_ht || null,
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
    // Clear existing lines first
    await db.query('DELETE FROM devis_lines WHERE devis_id = ?', [req.params.id])
    for (let i = 0; i < lines.length; i++) {
      const d = lines[i]
      const totalLigne = (d.prix_base_ht || 0) + (d.options?.reduce((s, o) => s + (o.prix || 0), 0) || 0) + (d.serrure_prix || 0) + (d.ferme_porte_prix || 0)
      await db.query(
        `INSERT INTO devis_lines
         (devis_id, position, designation, type_porte, gamme, vantail,
          hauteur_mm, largeur_mm, prix_base_ht, options_json,
          serrure_ref, serrure_prix, ferme_porte_ref, ferme_porte_prix,
          equipements_json, total_ligne_ht, alertes_json, docs_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id, i,
          d.designation || d.type || null, d.type || null, d.gamme || null, d.vantail || null,
          d.haut_mm || d.hauteur_mm || null, d.larg_mm || d.largeur_mm || null,
          d.prix_base_ht || null,
          d.options ? JSON.stringify(d.options) : null,
          d.serrure?.ref || null, null,
          d.ferme_porte?.ref || null, null,
          d.equip_extra ? JSON.stringify(d.equip_extra) : null,
          d.prix_total_min_ht || totalLigne || null,
          d.alertes ? JSON.stringify(d.alertes) : null,
          d.docs ? JSON.stringify(d.docs) : null,
        ]
      )
    }
    // Update devis total
    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_lines WHERE devis_id = ?',
      [req.params.id]
    )
    await db.query('UPDATE devis SET total_ht = ?, status = ? WHERE id = ?', [sumRows[0].total, 'editing', req.params.id])
    const [allLines] = await db.query('SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY position ASC', [req.params.id])
    res.json(allLines)
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// PUT /api/devis/:id/lines/:lineId — update a line
router.put('/:id/lines/:lineId', async (req, res) => {
  const allowed = ['position', 'designation', 'type_porte', 'gamme', 'vantail', 'hauteur_mm', 'largeur_mm', 'prix_base_ht', 'options_json', 'serrure_ref', 'serrure_prix', 'ferme_porte_ref', 'ferme_porte_prix', 'equipements_json', 'total_ligne_ht', 'alertes_json', 'docs_json']
  const sets = []
  const vals = []
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`)
      vals.push(key.endsWith('_json') ? JSON.stringify(req.body[key]) : req.body[key])
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  vals.push(req.params.lineId, req.params.id)
  try {
    await db.query(`UPDATE devis_lines SET ${sets.join(', ')} WHERE id = ? AND devis_id = ?`, vals)
    // Recalculate devis total
    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_lines WHERE devis_id = ?',
      [req.params.id]
    )
    await db.query('UPDATE devis SET total_ht = ? WHERE id = ?', [sumRows[0].total, req.params.id])
    const [rows] = await db.query('SELECT * FROM devis_lines WHERE id = ?', [req.params.lineId])
    res.json(rows[0])
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// DELETE /api/devis/:id/lines/:lineId
router.delete('/:id/lines/:lineId', async (req, res) => {
  try {
    await db.query('DELETE FROM devis_lines WHERE id = ? AND devis_id = ?', [req.params.lineId, req.params.id])
    // Recalculate devis total
    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_lines WHERE devis_id = ?',
      [req.params.id]
    )
    await db.query('UPDATE devis SET total_ht = ? WHERE id = ?', [sumRows[0].total, req.params.id])
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
    const [devisRows] = await db.query('SELECT * FROM devis WHERE id = ?', [id])
    if (!devisRows.length) return res.status(404).json({ error: 'Devis introuvable' })
    const devis = devisRows[0]

    const [lines] = await db.query(
      'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY position ASC',
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

// ── GET /api/devis/sample-pdf — preview PDF with demo data (no auth needed for dev) ──
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

export default router
