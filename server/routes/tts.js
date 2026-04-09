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

/** Catalogue Kokoro-82M (pas d'endpoint /voices sur ce serveur) */
const KOKORO_VOICES = [
  { id: 'ff_siwis',    name: 'Siwis',    lang: 'fr',    label: 'Français · Femme'     },
  { id: 'af_heart',    name: 'Heart',    lang: 'en',    label: 'Anglais · Femme'      },
  { id: 'af_bella',    name: 'Bella',    lang: 'en',    label: 'Anglais · Femme'      },
  { id: 'af_nicole',   name: 'Nicole',   lang: 'en',    label: 'Anglais · Femme'      },
  { id: 'af_sarah',    name: 'Sarah',    lang: 'en',    label: 'Anglais · Femme'      },
  { id: 'af_sky',      name: 'Sky',      lang: 'en',    label: 'Anglais · Femme'      },
  { id: 'am_adam',     name: 'Adam',     lang: 'en',    label: 'Anglais · Homme'      },
  { id: 'am_michael',  name: 'Michael',  lang: 'en',    label: 'Anglais · Homme'      },
  { id: 'bf_emma',     name: 'Emma',     lang: 'en-gb', label: 'Britannique · Femme'  },
  { id: 'bf_isabella', name: 'Isabella', lang: 'en-gb', label: 'Britannique · Femme'  },
  { id: 'bm_george',   name: 'George',   lang: 'en-gb', label: 'Britannique · Homme'  },
  { id: 'bm_lewis',    name: 'Lewis',    lang: 'en-gb', label: 'Britannique · Homme'  },
]

/**
 * GET /api/tts/voices
 * Renvoie le catalogue de voix Kokoro disponibles.
 */
router.get('/voices', authenticate, (_req, res) => {
  res.json({ voices: KOKORO_VOICES })
})

/**
 * POST /api/tts/synthesize
 * Proxifie la synthèse vers Kokoro et retourne le WAV.
 * Body JSON : { text, voice?, speed? }
 */
router.post('/synthesize', authenticate, async (req, res) => {
  const { text, voice = 'ff_siwis', speed = 0.92 } = req.body
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Le champ "text" est requis.' })
  }
  const safeSpeed = Math.min(2.0, Math.max(0.5, Number(speed) || 0.92))
  const safeVoice = KOKORO_VOICES.some((v) => v.id === voice) ? voice : 'ff_siwis'

  try {
    const ttsRes = await fetch(`${TTS_BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 3000), voice: safeVoice, speed: safeSpeed }),
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
 * Proxifie l'audio vers faster-whisper et retourne la transcription.
 * Corps : multipart/form-data avec le champ "audio" (blob audio WebM/WAV).
 */
router.post('/stt', authenticate, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier audio requis.' })

  try {
    const formData = new FormData()
    formData.append(
      'file',
      new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' }),
      req.file.originalname || 'audio.webm',
    )

    const sttRes = await fetch(`${STT_BASE}/stt`, { method: 'POST', body: formData })
    if (!sttRes.ok) {
      const errText = await sttRes.text()
      return res.status(sttRes.status).json({ error: errText })
    }
    const data = await sttRes.json()
    res.json({
      text:     data.text     || '',
      language: data.language || null,
      duration: data.duration || null,
    })
  } catch (err) {
    res.status(502).json({ error: `Service STT indisponible : ${err.message}` })
  }
})

export default router
