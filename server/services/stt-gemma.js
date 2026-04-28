/**
 * STT via Gemma 4 (vLLM – API OpenAI-compatible)
 * Envoie l'audio en base64 inline et retourne le texte transcrit.
 *
 * Variables d'env :
 *   OLLAMA_BASE_URL   → base vLLM  (défaut http://127.0.0.1:8000)
 *   STT_GEMMA_MODEL   → modèle STT (défaut = OLLAMA_MODEL)
 */

const VLLM_BASE  = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:8000'
const STT_MODEL  = process.env.STT_GEMMA_MODEL || process.env.OLLAMA_MODEL || 'google/gemma-4-E2B-it'

const STT_PROMPT =
  "Transcris l'audio. Réponds UNIQUEMENT avec le texte transcrit en français, " +
  "sans commentaire, sans ponctuation ajoutée, sans guillemets. " +
  "Si l'audio est silencieux ou incompréhensible, réponds par une chaîne vide."

/** Supprime les préfixes parasites que le LLM peut ajouter. */
function clean(text) {
  return text
    .replace(/^(transcri(?:pt|ption|s|re)[:\s]+)/i, '')
    .replace(/^(texte[:\s]+)/i, '')
    .replace(/^["«'`]|["»'`]$/g, '')
    .trim()
}

/**
 * Transcrit un Buffer audio avec Gemma 4.
 * @param {Buffer} audioBuffer  - bytes bruts (WebM / WAV / Ogg …)
 * @param {string} mimeType     - type MIME (ex. 'audio/webm')
 * @returns {Promise<string>}   - texte transcrit (vide si silence)
 */
export async function transcribeWithGemma(audioBuffer, mimeType = 'audio/webm') {
  const audioB64 = audioBuffer.toString('base64')

  // vLLM attend le format sans le préfixe "audio/"
  const fmt = (mimeType.split(';')[0] || 'audio/webm').replace('audio/', '')

  const resp = await fetch(`${VLLM_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: STT_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'input_audio', input_audio: { data: audioB64, format: fmt } },
          { type: 'text', text: STT_PROMPT },
        ],
      }],
      max_tokens: 512,
      temperature: 0.0,
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Gemma STT ${resp.status}: ${errText.slice(0, 300)}`)
  }

  const data = await resp.json()
  const raw  = data.choices?.[0]?.message?.content ?? ''
  return clean(raw)
}
