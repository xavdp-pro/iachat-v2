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
import { storeMemory, searchMemory, searchExperiences, searchDevisRules, searchDocuments } from '../services/memory.js'

const router = Router()
router.use(authenticate)

const MAX_CONTEXT_CHARS = Number(process.env.OLLAMA_MAX_CONTEXT_CHARS || 80000)
const MAX_MESSAGE_CHARS = Number(process.env.OLLAMA_MAX_MESSAGE_CHARS || 12000)
const RECENT_MESSAGE_KEEP = Number(process.env.OLLAMA_RECENT_MESSAGE_KEEP || 24)
const MAX_COMPLETION_TOKENS = Number(process.env.OLLAMA_MAX_COMPLETION_TOKENS || 1024)

function safePdfFilePart(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildDevisPdfFilename(devis, versionNumber = null) {
  const baseNumber = devis?.quote_number || devis?.name || (devis?.id ? `D${devis.id}` : null)
  const numberedName = [baseNumber, versionNumber].filter(Boolean).join('.')
  const parts = [numberedName, devis?.client_name || 'Client'].map(safePdfFilePart).filter(Boolean)
  return `${parts.length ? parts.join(' - ') : 'devis'}.pdf`
}

async function resolveDevisVersionNumber(devisId, requestedVersionId) {
  const versionId = Number(requestedVersionId || 0)
  if (!Number.isInteger(versionId) || versionId < 1) return null
  const [versions] = await db.query(
    'SELECT id, parent_version_id FROM devis_versions WHERE devis_id = ? ORDER BY id ASC',
    [devisId]
  )
  const target = versions.find((version) => Number(version.id) === versionId)
  if (!target) return null
  const siblings = versions.filter((version) => Number(version.parent_version_id || 0) === Number(target.parent_version_id || 0))
  const index = siblings.findIndex((version) => Number(version.id) === versionId)
  return index >= 0 ? `V${index + 1}` : null
}

function textLength(content) {
  if (typeof content === 'string') return content.length
  if (Array.isArray(content)) return content.reduce((sum, part) => {
    if (part?.type === 'text') return sum + String(part.text || '').length
    if (part?.type === 'image_url') return sum + 1000
    return sum + JSON.stringify(part || '').length
  }, 0)
  return JSON.stringify(content || '').length
}

function truncateText(text, maxChars) {
  const raw = String(text || '')
  if (raw.length <= maxChars) return raw
  const head = raw.slice(0, Math.floor(maxChars * 0.35)).trimEnd()
  const tail = raw.slice(raw.length - Math.floor(maxChars * 0.65)).trimStart()
  return `${head}\n\n[...contenu tronque pour rester dans la fenetre de contexte...]\n\n${tail}`
}

function trimMessageContent(content) {
  if (typeof content === 'string') return truncateText(content, MAX_MESSAGE_CHARS)
  if (!Array.isArray(content)) return content
  return content.map((part) => {
    if (part?.type !== 'text') return part
    return { ...part, text: truncateText(part.text, MAX_MESSAGE_CHARS) }
  })
}

function estimateMessagesLength(messages) {
  return messages.reduce((sum, msg) => sum + textLength(msg.content) + String(msg.role || '').length + 16, 0)
}

function fitMessagesForOllama(messages) {
  const normalized = messages.map((msg) => ({ ...msg, content: trimMessageContent(msg.content) }))
  const system = normalized.find((msg) => msg.role === 'system')
  const conversation = normalized.filter((msg) => msg.role !== 'system')
  let selected = conversation.slice(-RECENT_MESSAGE_KEEP)

  while (selected.length > 2 && estimateMessagesLength([system, ...selected].filter(Boolean)) > MAX_CONTEXT_CHARS) {
    selected = selected.slice(1)
  }

  return [system, ...selected].filter(Boolean)
}

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

  const ruleHits = await searchDevisRules({ text: lastUserMsg, topK: 5 }).catch(() => [])
  const rulesBlock = ruleHits.length
    ? `\n\n[Règles devis pertinentes — cite-les explicitement quand elles guident la réponse :]\n` +
    ruleHits.map((h, i) => `${i + 1}. [${h.rule_code || `REGLE-${h.rule_id}`}] ${h.title} — ${h.excerpt || ''}`).join('\n')
    : ''

  const documentHits = await searchDocuments({ text: lastUserMsg, topK: 4 }).catch(() => [])
  const documentsBlock = documentHits.length
    ? `\n\n[Documents/PDF analysés pertinents — cite le document et la page quand tu t'appuies dessus :]\n` +
    documentHits.map((h, i) => `${i + 1}. [Document ${h.document_id}, page ${h.page_number}] ${h.original_name || 'Document'} — ${h.excerpt || ''}`).join('\n')
    : ''

  const devisPdfHits = await findDevisPdfSources(lastUserMsg).catch(() => [])
  const devisPdfBlock = devisPdfHits.length
    ? `\n\n[PDF de devis générés disponibles dans l'interface — ne dis pas que tu ne peux pas fournir le fichier, indique à l'utilisateur de cliquer sur la pill PDF sous ta réponse :]\n` +
    devisPdfHits.map((h, i) => `${i + 1}. ${h.title} — ${h.excerpt}`).join('\n')
    : ''

  const out = [{ role: 'system', content: systemPrompt() + memBlock + expBlock + rulesBlock + documentsBlock + devisPdfBlock }]
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
  return fitMessagesForOllama(out)
}

async function buildSourceAttachments(query, messageId) {
  const [experiences, rules, documents] = await Promise.all([
    searchExperiences({ text: query, topK: 3 }).catch(() => []),
    searchDevisRules({ text: query, topK: 5 }).catch(() => []),
    searchDocuments({ text: query, topK: 4 }).catch(() => []),
  ])
  const sources = [
    ...rules.map((rule) => ({
      kind: 'rule',
      id: rule.rule_id,
      code: rule.rule_code,
      title: rule.title,
      excerpt: rule.excerpt,
      category: rule.category,
      severity: rule.severity,
      score: rule.score,
    })),
    ...experiences.map((experience) => ({
      kind: 'experience',
      id: experience.experience_id,
      title: experience.title,
      excerpt: experience.excerpt,
      category: experience.category,
      score: experience.score,
    })),
    ...documents.map((document) => ({
      kind: 'document',
      id: document.document_id,
      page_id: document.page_id,
      page_number: document.page_number,
      title: document.original_name || `Document ${document.document_id}`,
      excerpt: document.excerpt,
      category: document.page_number ? `Page ${document.page_number}` : 'Document',
      score: document.score,
      url: `/api/documents/${document.document_id}`,
    })),
  ]

  const devisPdfSources = await findDevisPdfSources(query).catch(() => [])
  sources.push(...devisPdfSources)

  const saved = []
  for (const source of sources) {
    const label = source.kind === 'rule'
      ? (source.code || `Règle ${source.id}`)
      : source.kind === 'document'
        ? (source.title || `Document ${source.id}`)
        : `Expérience ${source.id}`
    const [result] = await db.query(
      'INSERT INTO message_attachments (message_id, type, filename, mime_type, path, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
      [messageId, 'source', label, 'application/json', JSON.stringify(source), null]
    )
    saved.push({
      id: result.insertId,
      message_id: messageId,
      attach_type: 'source',
      name: label,
      mime_type: 'application/json',
      data: JSON.stringify(source),
    })
  }
  return saved
}

async function findDevisPdfSources(query) {
  const text = String(query || '').trim()
  if (!text) return []
  const wantsPdf = /\b(pdf|devis|offre|proposition|chiffrage|n[°o]?\s*\d|d\d+)/i.test(text)
  if (!wantsPdf) return []

  const tokens = Array.from(new Set(text.match(/[A-Z]?\d{2,}[-\w.]*/gi) || []))
    .map((token) => `%${token.replace(/[%_]/g, '')}%`)
    .slice(0, 6)

  let sql = `SELECT id, quote_number, name, client_name, current_version_id, updated_at
             FROM devis`
  const params = []
  if (tokens.length) {
    sql += ` WHERE ${tokens.map(() => '(quote_number LIKE ? OR name LIKE ? OR client_name LIKE ?)').join(' OR ')}`
    for (const token of tokens) params.push(token, token, token)
  }
  sql += ' ORDER BY updated_at DESC, id DESC LIMIT 3'

  const [rows] = await db.query(sql, params)
  const sources = []
  for (const devis of rows) {
    const versionNumber = await resolveDevisVersionNumber(devis.id, devis.current_version_id).catch(() => null)
    const filename = buildDevisPdfFilename(devis, versionNumber)
    sources.push({
      kind: 'devis_pdf',
      id: devis.id,
      title: filename,
      excerpt: `${devis.quote_number || devis.name || `Devis ${devis.id}`} — ${devis.client_name || 'Client non renseigné'}`,
      category: 'PDF devis généré',
      url: `/api/devis/${devis.id}/pdf?inline=1`,
      filename,
    })
  }
  return sources
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
          maxTokens: MAX_COMPLETION_TOKENS,
        })
        const [aiResult] = await db.query(
          'INSERT INTO messages (discussion_id, user_id, role, content, agent_slug) VALUES (?, NULL, ?, ?, ?)',
          [discussion_id, 'assistant', reply, model]
        )
        const sourceAttachments = await buildSourceAttachments(content, aiResult.insertId)
        assistantPayload = {
          id: aiResult.insertId,
          discussion_id,
          content: reply,
          role: 'assistant',
          agent_slug: model,
          attachments: sourceAttachments,
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
        maxTokens: MAX_COMPLETION_TOKENS,
        onChunk: (delta) => {
          res.write(`data: ${JSON.stringify({ type: 'chunk', delta })}\n\n`)
        },
      })
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Ollama request timed out' : (e.message || 'Ollama error')
      console.error('Ollama stream error:', msg)
      try { res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`) } catch { /* client disconnected */ }
      return res.end()
    } finally {
      clearTimeout(timer)
    }

    // 4. Persist assistant reply
    const [aiResult] = await db.query(
      'INSERT INTO messages (discussion_id, user_id, role, content, agent_slug) VALUES (?, NULL, ?, ?, ?)',
      [discussion_id, 'assistant', fullText, model]
    )
    const sourceAttachments = await buildSourceAttachments(content, aiResult.insertId)
    const assistantPayload = {
      id: aiResult.insertId, discussion_id, content: fullText,
      role: 'assistant', agent_slug: model,
      attachments: sourceAttachments, created_at: new Date().toISOString(),
    }

    // Store assistant reply in vector memory (non-blocking)
    storeMemory({ messageId: aiResult.insertId, discussionId: discussion_id, projectId: null, role: 'assistant', text: fullText }).catch(() => { })

    res.write(`data: ${JSON.stringify({ type: 'done', assistant: assistantPayload })}\n\n`)
    res.end()
  } catch (err) {
    try { res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`) } catch { /* client disconnected */ }
    try { res.end() } catch { /* client disconnected */ }
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
