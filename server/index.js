import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import skinsRoutes from './routes/skins.js'
import pluginsRoutes from './routes/plugins.js'
import projectsRoutes from './routes/projects.js'
import discussionsRoutes from './routes/discussions.js'
import messagesRoutes from './routes/messages.js'
import ttsRoutes from './routes/tts.js'
import { ensureDbSchema } from './db/ensureSchema.js'
import { warmupMemory } from './services/memory.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
// v2: API on 7608 so v1 can keep 7598. Set PORT in .env if needed.
const PORT = process.env.PORT || 7608

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Static uploads (default under app tmp when UPLOAD_DIR unset)
const uploadDir = process.env.UPLOAD_DIR || join(__dirname, '../tmp/uploads')
try {
  mkdirSync(uploadDir, { recursive: true })
} catch {
  /* ignore */
}
app.use('/uploads', express.static(uploadDir))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/skins', skinsRoutes)
app.use('/api/plugins', pluginsRoutes)
app.use('/api/projects', projectsRoutes)
app.use('/api/discussions', discussionsRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/tts', ttsRoutes)

// Health check (capabilities help verify deploy: admin Ollama UI needs GET/PUT /api/admin/ollama-settings)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
    capabilities: { adminOllamaSettings: true },
  })
})

ensureDbSchema()
  .then(() => {
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`🚀 Express API running on :${PORT}`)
      warmupMemory() // pré-charge le modèle d'embedding fastembed
    })
  })
  .catch((err) => {
    console.error('Failed to start API:', err)
    process.exit(1)
  })

export default app
