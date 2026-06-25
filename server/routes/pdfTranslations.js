/**
 * PDF translation dictionary + FR HTML template export (Armand lot).
 */
import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { buildDevisNexusHtml } from '../devis-pdf.js'
import {
  deletePdfTranslationEntry,
  listPdfTranslationEntriesAdmin,
  upsertPdfTranslationEntry,
} from '../services/pdf-translation-dictionary.js'
import { translatePdfDesignationMultiline } from '../lib/pdf-designation-i18n.js'
import { normalizePdfLanguage } from '../lib/pdf-labels.js'

const router = Router()

const SAMPLE_LINES = [
  {
    position: 1,
    line_section: 'products',
    designation: `BLOC-PORTE "NEXUS" DEUX VANTAUX
Performances coupe-feu EI² 60 minutes recto/verso
Classement anti-effraction niveau CR4 selon normes EN 1627 - 1630
Vantail en tôle épaisseur 20/10° double face
Dimensions sur mesure : L 900 H 2100 Passage libre à 90°
Dimensions hors-tout : L 1000 H 2200
Réservation gros-oeuvre prévoir : L 1010 H 2210
Equipement fourni-posé :
- Serrure — 3 points mécanique
Localisation : Hall entrée`,
    gamme: 'CR4',
    vantail: '2V',
    hauteur_mm: 2200,
    largeur_mm: 1000,
    total_ligne_ht: 15304,
    localisation: 'Hall entrée',
    options_json: '[]',
  },
]

// GET /api/pdf-translations/template-html — FR HTML template for external translators
router.get('/template-html', authenticate, async (req, res) => {
  try {
    const html = buildDevisNexusHtml({
      pdfLanguage: 'fr',
      devis: {
        id: 0,
        name: 'MODELE-TRADUCTION',
        deal_id: 'AFFAIRE-DEMO',
        client_name: 'CLIENT MODÈLE — The Hive',
        total_ht: 15304,
        currency: 'EUR',
        created_at: new Date().toISOString(),
        requester_contact_name: 'Armand Guilhot',
      },
      lines: SAMPLE_LINES,
      offerNumber: 'MODELE-TRADUCTION',
      offerDateLabel: new Date().toLocaleDateString('fr-FR'),
      referenceLabel: 'AFFAIRE-DEMO',
      contactName: 'Armand Guilhot',
    })
    const filename = 'zerux-devis-template-fr.html'
    if (req.query.download === '1') {
      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      })
    } else {
      res.set({ 'Content-Type': 'text/html; charset=utf-8' })
    }
    res.send(html)
  } catch (err) {
    console.error('pdf template-html error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/pdf-translations/translate — batch designation translation
router.post('/translate', authenticate, async (req, res) => {
  const language = normalizePdfLanguage(req.body?.language)
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  if (language === 'fr') {
    return res.json({
      items: items.map((item) => ({
        line_id: item.line_id ?? item.id ?? null,
        designation: String(item.designation || ''),
      })),
    })
  }
  try {
    const translated = await Promise.all(items.map(async (item) => {
      const designation = String(item.designation || '')
      return {
        line_id: item.line_id ?? item.id ?? null,
        designation: await translatePdfDesignationMultiline(designation, language),
      }
    }))
    res.json({ language, items: translated })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.use(authenticate, requireAdmin)

router.get('/', async (req, res) => {
  try {
    const entries = await listPdfTranslationEntriesAdmin()
    res.json({ entries })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const row = await upsertPdfTranslationEntry(req.body || {})
    res.status(201).json(row)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const row = await upsertPdfTranslationEntry({ ...req.body, id: req.params.id })
    res.json(row)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await deletePdfTranslationEntry(req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
