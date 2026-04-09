import { Router } from 'express'
import { readdirSync, existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const router = Router()
const __dirname = dirname(fileURLToPath(import.meta.url))
// Default: iachat-v2/skins next to server/ (portable; override with SKINS_DIR)
const SKINS_DIR = process.env.SKINS_DIR || join(__dirname, '../../skins')

// GET /api/skins — list available skins
router.get('/', (req, res) => {
  try {
    if (!existsSync(SKINS_DIR)) return res.json([])
    const skins = readdirSync(SKINS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const manifestPath = join(SKINS_DIR, d.name, 'manifest.json')
        if (!existsSync(manifestPath)) return null
        try {
          return JSON.parse(readFileSync(manifestPath, 'utf8'))
        } catch {
          return null
        }
      })
      .filter(Boolean)
    res.json(skins)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/skins/:slug/theme.css — serve a skin CSS file
router.get('/:slug/theme.css', (req, res) => {
  const cssPath = join(SKINS_DIR, req.params.slug, 'theme.css')
  if (!existsSync(cssPath)) return res.status(404).json({ error: 'Skin not found' })
  res.setHeader('Content-Type', 'text/css')
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.sendFile(cssPath)
})

export default router
