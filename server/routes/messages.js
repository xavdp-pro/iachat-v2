import { Router } from 'express'
import db from '../db/index.js'
import { authenticate } from '../middleware/auth.js'
import {
  systemPrompt,
  chatCompletion,
  chatCompletionStream,
} from '../services/ollama.js'
import {
  getGlobalOllamaModel,
  resolvedIsOllamaEnabled,
} from '../services/appSettings.js'
import { storeMemory, searchMemory, searchExperiences } from '../services/memory.js'

const router = Router()
router.use(authenticate)

async function fetchDiscussionTranscriptForOllama(discussionId) {
  const [messages] = await db.query(
    `SELECT m.id, m.role, m.content FROM messages m
     WHERE m.discussion_id = ? ORDER BY m.created_at ASC`,
    [discussionId]
  )
  const ids = messages.map((m) => m.id)
  const attMap = {}
  if (ids.length > 0) {
    const [atts] = await db.query(
      `SELECT message_id, filename AS name, type AS attach_type, mime_type, path AS data_url
       FROM message_attachments WHERE message_id IN (${ids.map(() => '?').join(',')})`,
      ids
    )
    for (const a of atts) {
      if (!attMap[a.message_id]) attMap[a.message_id] = []
      attMap[a.message_id].push(a)
    }
  }
  // ── Long-term memory: inject relevant past context before current conversation
  const lastUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || ''
  const memories = await searchMemory({
    text: lastUserMsg,
    projectId: null,
    topK: 5,
  }).catch(() => [])
  const memBlock = memories.length
    ? `\n\n[Mémoire long-terme — échanges pertinents passés :]\n` +
    memories.map((m, i) => `${i + 1}. [${m.role}] ${m.text}`).join('\n')
    : ''

  // ── Knowledge base: inject approved commercial experiences
  const expHits = await searchExperiences({ text: lastUserMsg, topK: 3 }).catch(() => [])
  const expBlock = expHits.length
    ? `\n\n[Base de connaissances commerciale — expériences terrain pertinentes :]\n` +
      expHits.map((h, i) => `${i + 1}. [${h.category || 'Général'}] ${h.title} — ${h.excerpt || ''}`).join('\n')
    : ''

  const out = [{ role: 'system', content: systemPrompt() + memBlock + expBlock }]
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const ollamaRole = m.role === 'user' ? 'user' : 'assistant'
    const atts = attMap[m.id] || []
    const images = atts.filter((a) => a.attach_type === 'image' && a.data_url)

    // Build multimodal content array if there are images (OpenAI vision format)
    if (ollamaRole === 'user' && images.length > 0) {
      const parts = []
      if (m.content) parts.push({ type: 'text', text: m.content })
      for (const img of images) {
        parts.push({ type: 'image_url', image_url: { url: img.data_url } })
      }
      // Mention non-image attachments as text
      const docs = atts.filter((a) => a.attach_type !== 'image')
      if (docs.length) {
        const docList = docs.map((d) => d.name).join(', ')
        parts.push({ type: 'text', text: `[Fichiers joints : ${docList}]` })
      }
      out.push({ role: ollamaRole, content: parts })
    } else {
      let text = m.content || ''
      const docs = atts.filter((a) => a.attach_type !== 'image')
      if (docs.length) text += `\n\n[Fichiers joints : ${docs.map((d) => d.name).join(', ')}]`
      out.push({ role: ollamaRole, content: text })
    }
  }
  return out
}

// GET /api/messages?discussion_id=X
router.get('/', async (req, res) => {
  const { discussion_id } = req.query
  if (!discussion_id) return res.status(400).json({ error: 'discussion_id required' })
  try {
    const [messages] = await db.query(
      `SELECT m.*, u.name as user_name, u.avatar as user_avatar
       FROM messages m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.discussion_id = ?
       ORDER BY m.created_at ASC`,
      [discussion_id]
    )
    // Load attachments for each message
    const ids = messages.map(m => m.id)
    let attachments = []
    if (ids.length > 0) {
      ;[attachments] = await db.query(
        `SELECT id, message_id, type AS attach_type, filename AS name, mime_type, path AS data, size_bytes AS size, created_at FROM message_attachments WHERE message_id IN (${ids.map(() => '?').join(',')})`,
        ids
      )
    }
    const attMap = attachments.reduce((acc, a) => {
      if (!acc[a.message_id]) acc[a.message_id] = []
      acc[a.message_id].push(a)
      return acc
    }, {})
    const result = messages.map(m => ({ ...m, attachments: attMap[m.id] || [] }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/messages — persists user message; when role is user and Ollama is enabled, appends assistant reply
router.post('/', async (req, res) => {
  const {
    discussion_id,
    content,
    role = 'user',
    agent_slug,
    attachments = [],
  } = req.body
  if (!discussion_id || !content) return res.status(400).json({ error: 'discussion_id and content required' })
  try {
    const [result] = await db.query(
      'INSERT INTO messages (discussion_id, user_id, role, content, agent_slug) VALUES (?, ?, ?, ?, ?)',
      [discussion_id, role === 'user' ? req.user.id : null, role, content, agent_slug || null]
    )
    const messageId = result.insertId

    // Persist attachments if any
    const savedAttachments = []
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        const [attResult] = await db.query(
          'INSERT INTO message_attachments (message_id, type, filename, mime_type, path, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
          [messageId, att.attach_type || 'document', att.name, att.mime_type || null, att.data || null, att.size || null]
        )
        savedAttachments.push({ id: attResult.insertId, message_id: messageId, ...att })
      }
    }

    const userPayload = {
      id: messageId,
      discussion_id,
      content,
      role,
      agent_slug,
      attachments: savedAttachments,
      created_at: new Date().toISOString(),
    }

    // Store user message in vector memory (non-blocking)
    storeMemory({ messageId, discussionId: discussion_id, projectId: null, role: 'user', text: content }).catch(() => { })

    let assistantPayload = null
    let ollama_error = null

    if (role === 'user' && (await resolvedIsOllamaEnabled())) {
      const model = await getGlobalOllamaModel()
      const ollamaMessages = await fetchDiscussionTranscriptForOllama(discussion_id)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 9 * 60 * 1000)
      try {
        const reply = await chatCompletion({
          model,
          messages: ollamaMessages,
          signal: controller.signal,
        })
        const [aiResult] = await db.query(
          'INSERT INTO messages (discussion_id, user_id, role, content, agent_slug) VALUES (?, NULL, ?, ?, ?)',
          [discussion_id, 'assistant', reply, model]
        )
        assistantPayload = {
          id: aiResult.insertId,
          discussion_id,
          content: reply,
          role: 'assistant',
          agent_slug: model,
          attachments: [],
          created_at: new Date().toISOString(),
        }
        // Store assistant reply in vector memory (non-blocking)
        storeMemory({ messageId: aiResult.insertId, discussionId: discussion_id, projectId: null, role: 'assistant', text: reply }).catch(() => { })
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'Ollama request timed out' : (e.message || 'Ollama error')
        console.error('Ollama chat:', msg)
        ollama_error = msg
      } finally {
        clearTimeout(timer)
      }
    }

    res.status(201).json({
      message: userPayload,
      assistant: assistantPayload,
      ollama_error,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/messages/stream — SSE: saves user msg, streams assistant reply token by token
router.post('/stream', async (req, res) => {
  const { discussion_id, content, attachments = [] } = req.body
  if (!discussion_id || !content) return res.status(400).json({ error: 'discussion_id and content required' })

  try {
    // 1. Persist user message
    const [result] = await db.query(
      'INSERT INTO messages (discussion_id, user_id, role, content) VALUES (?, ?, ?, ?)',
      [discussion_id, req.user.id, 'user', content]
    )
    const messageId = result.insertId

    // 1b. Persist attachments if any
    const savedAttachments = []
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        const [attResult] = await db.query(
          'INSERT INTO message_attachments (message_id, type, filename, mime_type, path, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
          [messageId, att.attach_type || 'document', att.name, att.mime_type || null, att.data || null, att.size || null]
        )
        savedAttachments.push({ id: attResult.insertId, message_id: messageId, ...att })
      }
    }

    const userPayload = {
      id: messageId, discussion_id, content, role: 'user',
      attachments: savedAttachments, created_at: new Date().toISOString(),
    }

    // Store user message in vector memory (non-blocking)
    storeMemory({ messageId, discussionId: discussion_id, projectId: null, role: 'user', text: content }).catch(() => { })

    // 2. SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    // 3. Send persisted user message to client
    res.write(`data: ${JSON.stringify({ type: 'user', message: userPayload })}\n\n`)

    const enabled = await resolvedIsOllamaEnabled()
    if (!enabled) {
      res.write(`data: ${JSON.stringify({ type: 'done', assistant: null })}\n\n`)
      return res.end()
    }

    const model = await getGlobalOllamaModel()
    const ollamaMessages = await fetchDiscussionTranscriptForOllama(discussion_id)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 9 * 60 * 1000)
    let fullText = ''

    try {
      fullText = await chatCompletionStream({
        model,
        messages: ollamaMessages,
        signal: controller.signal,
        onChunk: (delta) => {
          res.write(`data: ${JSON.stringify({ type: 'chunk', delta })}\n\n`)
        },
      })
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Ollama request timed out' : (e.message || 'Ollama error')
      console.error('Ollama stream error:', msg)
      try { res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`) } catch { }
      return res.end()
    } finally {
      clearTimeout(timer)
    }

    // 4. Persist assistant reply
    const [aiResult] = await db.query(
      'INSERT INTO messages (discussion_id, user_id, role, content, agent_slug) VALUES (?, NULL, ?, ?, ?)',
      [discussion_id, 'assistant', fullText, model]
    )
    const assistantPayload = {
      id: aiResult.insertId, discussion_id, content: fullText,
      role: 'assistant', agent_slug: model,
      attachments: [], created_at: new Date().toISOString(),
    }

    // Store assistant reply in vector memory (non-blocking)
    storeMemory({ messageId: aiResult.insertId, discussionId: discussion_id, projectId: null, role: 'assistant', text: fullText }).catch(() => { })

    res.write(`data: ${JSON.stringify({ type: 'done', assistant: assistantPayload })}\n\n`)
    res.end()
  } catch (err) {
    try { res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`) } catch { }
    try { res.end() } catch { }
  }
})

// PUT /api/messages/:id  — owner only
router.put('/:id', async (req, res) => {
  const { content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'content required' })
  try {
    const [rows] = await db.query('SELECT * FROM messages WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    const msg = rows[0]
    if (Number(msg.user_id) !== Number(req.user.id))
      return res.status(403).json({ error: 'Forbidden' })
    await db.query(
      'UPDATE messages SET content = ?, edited_at = NOW() WHERE id = ?',
      [content.trim(), req.params.id]
    )
    res.json({ ...msg, content: content.trim(), edited_at: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/messages/:id  — owner only
router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM messages WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    if (Number(rows[0].user_id) !== Number(req.user.id))
      return res.status(403).json({ error: 'Forbidden' })
    await db.query('DELETE FROM messages WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/messages/from/:id — supprime ce message ET tous les suivants dans la discussion
// Le message cible doit appartenir à l'utilisateur courant
router.delete('/from/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM messages WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    const msg = rows[0]
    if (Number(msg.user_id) !== Number(req.user.id))
      return res.status(403).json({ error: 'Forbidden' })
    await db.query(
      'DELETE FROM messages WHERE discussion_id = ? AND id >= ?',
      [msg.discussion_id, msg.id]
    )
    res.json({ success: true, discussion_id: msg.discussion_id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
