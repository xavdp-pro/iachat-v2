import express from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
})

const TTS_BASE = process.env.TTS_URL || 'http://127.0.0.1:8010'
const STT_BASE = process.env.STT_URL || 'http://127.0.0.1:8011'

/**
 * GET /api/tts/voices
 * Renvoie le catalogue de voix XTTS-v2 disponibles.
 */
router.get('/voices', authenticate, async (_req, res) => {
  try {
    const voicesRes = await fetch(`${TTS_BASE}/voices`)
    if (!voicesRes.ok) throw new Error('Impossible de récupérer les voix')
    const data = await voicesRes.json()

    // Formatter les voix pour le frontend
    const voices = (data.voices || []).map(name => ({
      id: name,
      name: name,
      lang: 'multi',
      label: 'Multilingue (XTTS-v2)'
    }))

    res.json({ voices })
  } catch (err) {
    // Fallback si le serveur est éteint
    res.json({
      voices: [
        { id: 'Ana Florence', name: 'Ana Florence', lang: 'multi', label: 'Multilingue (Offline)' },
        { id: 'Damien Black', name: 'Damien Black', lang: 'multi', label: 'Multilingue (Offline)' }
      ],
      error: `Serveur XTTS-v2 injoignable : ${err.message}`
    })
  }
})

/**
 * POST /api/tts/synthesize
 * Proxifie la synthèse vers XTTS-v2 et retourne le WAV.
 * Body JSON : { text, voice?, speed? }
 */
router.post('/synthesize', authenticate, async (req, res) => {
  const { text, voice = 'Ana Florence', speed = 0.92 } = req.body
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Le champ "text" est requis.' })
  }
  const safeSpeed = Math.min(2.0, Math.max(0.5, Number(speed) || 1.0))
  const safeVoice = voice // On passe le nom tel quel pour XTTS-v2

  try {
    const ttsRes = await fetch(`${TTS_BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.slice(0, 3000),
        voice: safeVoice,
        lang: 'fr', // Par défaut en français
        speed: safeSpeed
      }),
    })
    if (!ttsRes.ok) {
      const errText = await ttsRes.text()
      return res.status(ttsRes.status).json({ error: errText })
    }
    const buf = Buffer.from(await ttsRes.arrayBuffer())
    res.setHeader('Content-Type', 'audio/wav')
    res.setHeader('Content-Length', buf.length)
    res.setHeader('Cache-Control', 'no-store')
    res.send(buf)
  } catch (err) {
    res.status(502).json({ error: `Service TTS indisponible : ${err.message}` })
  }
})

/**
 * POST /api/tts/stt
 * Transcrit l'audio via Gemma 4 (vLLM local).
 * Corps : multipart/form-data avec le champ "audio" (blob audio WebM/WAV).
 */
router.post('/stt', authenticate, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier audio requis.' })
  try {
    const { transcribeWithGemma } = await import('../services/stt-gemma.js')
    const text = await transcribeWithGemma(req.file.buffer, req.file.mimetype || 'audio/webm')
    res.json({ text, language: 'fr', duration: null })
  } catch (err) {
    res.status(502).json({ error: `Service STT indisponible : ${err.message}` })
  }
})

export default router
