import { Router } from 'express'
import bcrypt from 'bcryptjs'
import db from '../db/index.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import {
  listModels,
  defaultModel,
  fallbackChatModels,
  mergeDefaultIntoModelList,
  isOllamaEnabled,
  explainListModelsError,
  ollamaBaseUrl,
  chatCompletion,
} from '../services/ollama.js'
import {
  getGlobalOllamaModel,
  resolvedIsOllamaEnabled,
  getOllamaEnabledMode,
  persistOllamaAdminSettings,
  getDbModelOverride,
  getCachedOllamaModels,
  replaceCachedOllamaModels,
  getOllamaModelsCacheUpdatedAt,
} from '../services/appSettings.js'

const router = Router()
router.use(authenticate, requireAdmin)

function filterChatModels(models) {
  return models.filter((m) => {
    const n = String(m.name || '').toLowerCase()
    if (n.includes('minilm') || n.includes('embed')) return false
    return true
  })
}

// GET /api/admin/ollama-settings — global Ollama config + model list (admin only)
router.get('/ollama-settings', async (req, res) => {
  let effectiveModel = defaultModel()
  let dbModelOverride = null
  let effectiveEnabled = isOllamaEnabled()
  let enabledMode = 'inherit'
  try {
    effectiveModel = await getGlobalOllamaModel()
    dbModelOverride = await getDbModelOverride()
    effectiveEnabled = await resolvedIsOllamaEnabled()
    enabledMode = await getOllamaEnabledMode()
  } catch (dbErr) {
    console.error('[admin] ollama-settings DB read:', dbErr.message)
  }

  let models = []
  let modelsWarning = null
  let modelsSource = 'cache'
  let modelsCacheUpdatedAt = null
  try {
    models = await getCachedOllamaModels()
    modelsCacheUpdatedAt = await getOllamaModelsCacheUpdatedAt()
    if (!models.length) {
      models = fallbackChatModels()
      modelsWarning = 'No cached model list yet. Click "Refresh model list" to fetch from Ollama.'
      modelsSource = 'fallback'
    }
  } catch (err) {
    console.error('[admin] cached models read:', err?.message || err, err?.cause || '')
    models = fallbackChatModels()
    modelsWarning = 'Could not read cached model list; using fallback from OLLAMA_MODEL / OLLAMA_FALLBACK_MODELS.'
    modelsSource = 'fallback'
  }
  const names = new Set(models.map((m) => m.name))
  if (effectiveModel && !names.has(effectiveModel)) {
    models = [{ name: effectiveModel }, ...models]
  }
  res.json({
    defaultModel: effectiveModel,
    dbModelOverride,
    enabledMode,
    effectiveEnabled,
    envDefaultModel: defaultModel(),
    envOllamaEnabled: isOllamaEnabled(),
    ollamaBaseUrl: ollamaBaseUrl(),
    models,
    modelsWarning,
    modelsSource,
    modelsCacheUpdatedAt,
  })
})

// POST /api/admin/ollama-models/refresh — clear and rebuild DB model list from Ollama
router.post('/ollama-models/refresh', async (req, res) => {
  try {
    const raw = await listModels()
    const models = mergeDefaultIntoModelList(filterChatModels(raw))
    if (!models.length) {
      return res.status(502).json({
        error: 'Ollama returned no chat models.',
      })
    }
    await replaceCachedOllamaModels(models)
    const updatedAt = await getOllamaModelsCacheUpdatedAt()
    res.json({
      ok: true,
      count: models.length,
      updatedAt,
      modelsSource: 'live',
    })
  } catch (err) {
    const detail = explainListModelsError(err)
    res.status(502).json({ error: detail })
  }
})

// POST /api/admin/ollama-test — run a simple prompt to verify response path
router.post('/ollama-test', async (req, res) => {
  try {
    const model = await getGlobalOllamaModel()
    const startedAt = Date.now()
    const text = await chatCompletion({
      model,
      messages: [
        { role: 'system', content: 'Reply with a very short plain text health check.' },
        { role: 'user', content: 'ping' },
      ],
    })
    const latencyMs = Date.now() - startedAt
    res.json({
      ok: true,
      model,
      latencyMs,
      reply: String(text || '').slice(0, 200),
    })
  } catch (err) {
    const detail = err?.message || 'Ollama test failed'
    res.status(502).json({ error: detail })
  }
})

// PUT /api/admin/ollama-settings — body: { defaultModel: string, enabledMode: 'inherit'|'on'|'off' }
router.put('/ollama-settings', async (req, res) => {
  const { defaultModel: dm, enabledMode } = req.body || {}
  const modes = ['inherit', 'on', 'off']
  if (!modes.includes(enabledMode)) {
    return res.status(400).json({ error: 'enabledMode must be inherit, on, or off' })
  }
  if (typeof dm !== 'string') {
    return res.status(400).json({ error: 'defaultModel must be a string' })
  }
  try {
    await persistOllamaAdminSettings({ defaultModel: dm, enabledMode })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/admin/users — list all users
router.get('/users', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, email, role, name, avatar, active, created_at FROM users ORDER BY created_at DESC'
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/users — create user
router.post('/users', async (req, res) => {
  const { email, password, name, role = 'user' } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  try {
    const hash = await bcrypt.hash(password, 12)
    const [result] = await db.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
      [email.toLowerCase().trim(), hash, name || '', role]
    )
    res.status(201).json({ id: result.insertId, email, name, role })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already exists' })
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/users/:id — update user
router.put('/users/:id', async (req, res) => {
  const { name, role, active, password } = req.body
  const { id } = req.params
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12)
      await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id])
    }
    await db.query(
      'UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?',
      [name, role, active ? 1 : 0, id]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/admin/users/:id — delete user
router.delete('/users/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
