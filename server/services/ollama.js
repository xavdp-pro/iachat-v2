/**
 * vLLM HTTP client (OpenAI-compatible API). Used for chat completions after user messages.
 */

function baseUrl() {
  const raw = process.env.OLLAMA_BASE_URL || 'http://localhost:8000'
  return raw.replace(/\/+$/, '')
}

/** Public for admin route: show which host is configured */
export function ollamaBaseUrl() {
  return baseUrl()
}

/**
 * Turn vague Node fetch errors ("fetch failed") into actionable text for admins.
 */
export function explainListModelsError(err) {
  const tagsUrl = `${baseUrl()}/v1/models`
  const msg = err?.message || String(err)
  const cause = err?.cause
  const code = cause?.code || cause?.errno || cause?.name
  const causeMsg = typeof cause?.message === 'string' ? cause.message : ''

  if (err?.name === 'AbortError') {
    return `Timeout calling ${tagsUrl} — Ollama did not respond in time.`
  }

  const isFetchFailed =
    msg === 'fetch failed' ||
    (typeof msg === 'string' && msg.toLowerCase().includes('fetch failed'))

  if (isFetchFailed) {
    if (code === 'ENOTFOUND') {
      return `Cannot reach ${tagsUrl}: DNS lookup failed (ENOTFOUND). Check OLLAMA_BASE_URL hostname.`
    }
    if (code === 'ECONNREFUSED') {
      return `Cannot reach ${tagsUrl}: connection refused (ECONNREFUSED). Is Ollama listening on that host:port?`
    }
    if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
      return `Cannot reach ${tagsUrl}: connection timed out. Check firewall, VPN, or remote Ollama URL.`
    }
    if (
      typeof code === 'string' &&
      (code.includes('CERT') || code.includes('TLS') || code.includes('SSL'))
    ) {
      return `Cannot reach ${tagsUrl}: TLS/SSL error (${code}). Try http:// for local LAN or fix certificates.`
    }
    const extra = [code, causeMsg].filter(Boolean).join(' — ')
    return `Cannot reach ${tagsUrl}: network error${extra ? ` (${extra})` : ''}. Verify OLLAMA_BASE_URL and that the server can reach Ollama.`
  }

  return `Failed to list models from ${tagsUrl}: ${msg}${code ? ` [${code}]` : ''}${causeMsg ? ` — ${causeMsg}` : ''}`
}

export function isOllamaEnabled() {
  const v = process.env.OLLAMA_ENABLED
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

export function defaultModel() {
  return (process.env.OLLAMA_MODEL || 'Qwen/Qwen2.5-32B-Instruct-AWQ').trim()
}

/**
 * When /api/tags fails, use comma-separated OLLAMA_FALLBACK_MODELS plus default model.
 * @returns {Array<{ name: string }>}
 */
export function fallbackChatModels() {
  const seen = new Set()
  const out = []
  const push = (name) => {
    const n = String(name || '').trim()
    if (!n || seen.has(n)) return
    seen.add(n)
    out.push({ name: n })
  }
  const def = defaultModel()
  if (def) push(def)
  const raw = process.env.OLLAMA_FALLBACK_MODELS || ''
  for (const part of raw.split(',')) push(part)
  if (out.length === 0 && def) push(def)
  return out
}

/**
 * Ensure OLLAMA_MODEL appears in the dropdown even if Ollama omits it.
 * @param {Array<{ name: string }>} list
 */
export function mergeDefaultIntoModelList(list) {
  const def = defaultModel()
  if (!def || !Array.isArray(list)) return list
  const names = new Set(list.map((m) => m.name))
  if (names.has(def)) return list
  return [{ name: def }, ...list]
}

export function systemPrompt() {
  return (
    process.env.OLLAMA_SYSTEM_PROMPT ||
    'You are a helpful, concise assistant. Answer in the same language as the user when appropriate.'
  )
}

/**
 * @returns {Promise<Array<{ name: string }>>}
 */
export async function listModels() {
  const url = `${baseUrl()}/v1/models`
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`vLLM /v1/models ${res.status}: ${text || res.statusText}`)
    }
    const data = await res.json()
    // OpenAI-compatible: { data: [{ id: "model-name" }, ...] }
    const rawList = Array.isArray(data.data) ? data.data : []
    return rawList
      .map((m) => {
        if (typeof m === 'string') return { name: m.trim(), size: undefined }
        const name = (m && (m.id || m.name)) ? String(m.id || m.name).trim() : ''
        return { name, size: undefined }
      })
      .filter((m) => m.name)
  } finally {
    clearTimeout(t)
  }
}

/**
 * @param {object} opts
 * @param {string} opts.model
 * @param {Array<{ role: string, content: string }>} opts.messages
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>} assistant text
 */
export async function chatCompletion({ model, messages, signal }) {
  const url = `${baseUrl()}/v1/chat/completions`
  const body = JSON.stringify({
    model,
    messages,
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `vLLM /v1/chat/completions ${res.status}`)
  }
  const data = await res.json()
  // OpenAI-compatible: { choices: [{ message: { content: "..." } }] }
  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new Error('vLLM returned no message content')
  return text.trim()
}

/**
 * Stream chat completion via vLLM SSE.
 * @param {object} opts
 * @param {string} opts.model
 * @param {Array<{ role: string, content: string }>} opts.messages
 * @param {AbortSignal} [opts.signal]
 * @param {(delta: string) => void} opts.onChunk  called for each streamed token
 * @returns {Promise<string>} full assistant text once streaming is done
 */
export async function chatCompletionStream({ model, messages, signal, onChunk }) {
  const url = `${baseUrl()}/v1/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `vLLM /v1/chat/completions ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return fullText
      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          fullText += delta
          onChunk(delta)
        }
      } catch { /* skip malformed SSE chunk */ }
    }
  }
  return fullText
}
