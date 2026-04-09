/**
 * Long-term vector memory — Qdrant + fastembed
 *
 * Embeddings: fastembed BGESmallENV15 (384 dims, local ONNX, no GPU needed)
 * Storage: Qdrant on 127.0.0.1:6333 (Docker)
 *
 * Usage:
 *   import { storeMemory, searchMemory } from './memory.js'
 *
 *   // After persisting a message:
 *   await storeMemory({ messageId, discussionId, projectId, role, text })
 *
 *   // Before building Ollama context:
 *   const hits = await searchMemory({ text: userMessage, projectId, topK: 5 })
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import { EmbeddingModel, FlagEmbedding } from 'fastembed'

const COLLECTION = process.env.QDRANT_COLLECTION || 'iachat_memory'
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333'
const VECTOR_SIZE = 384 // BGESmallENV15

const client = new QdrantClient({ url: QDRANT_URL })

let _embedder = null
let _initPromise = null

async function getEmbedder() {
  if (_embedder) return _embedder
  if (_initPromise) return _initPromise

  _initPromise = FlagEmbedding.init({
    model: EmbeddingModel.BGESmallENV15,
    cacheDir: '/var/lib/qdrant/fastembed-cache',
  }).then((emb) => {
    _embedder = emb
    _initPromise = null
    console.log('✅ fastembed: BGESmallENV15 ready')
    return emb
  })

  return _initPromise
}

async function ensureCollection() {
  try {
    await client.getCollection(COLLECTION)
  } catch {
    await client.createCollection(COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    })
    console.log(`✅ Qdrant: collection "${COLLECTION}" created`)
  }
}

/** Compute embedding vector for a text string */
async function embed(text) {
  const embedder = await getEmbedder()
  // FlagEmbedding.embed returns an async generator of Float32Array[]
  const gen = embedder.embed([text])
  for await (const batch of gen) {
    return Array.from(batch[0])
  }
  throw new Error('embed: no output from fastembed')
}

/**
 * Store a message in long-term vector memory.
 * @param {object} p
 * @param {number} p.messageId
 * @param {number} p.discussionId
 * @param {number|null} p.projectId
 * @param {string} p.role  'user' | 'assistant'
 * @param {string} p.text
 */
export async function storeMemory({ messageId, discussionId, projectId, role, text }) {
  if (!text?.trim()) return
  try {
    await ensureCollection()
    const vector = await embed(text.slice(0, 2000)) // cap at 2000 chars for embedding
    await client.upsert(COLLECTION, {
      points: [
        {
          id: messageId,
          vector,
          payload: {
            message_id: messageId,
            discussion_id: discussionId,
            project_id: projectId ?? null,
            role,
            text: text.slice(0, 500), // short excerpt for payload
          },
        },
      ],
    })
  } catch (err) {
    // Non-blocking — memory errors must never break message delivery
    console.error('storeMemory error:', err.message)
  }
}

/**
 * Search long-term memory for relevant past context.
 * @param {object} p
 * @param {string} p.text       Current user message
 * @param {number|null} p.projectId  Scope search to a project (optional)
 * @param {number} [p.topK=5]   Number of results
 * @param {number} [p.minScore=0.55] Minimum cosine similarity
 * @returns {Promise<Array<{role, text, score}>>}
 */
export async function searchMemory({ text, projectId, topK = 5, minScore = 0.55 }) {
  if (!text?.trim()) return []
  try {
    await ensureCollection()
    const vector = await embed(text.slice(0, 2000))

    const filter = projectId
      ? { must: [{ key: 'project_id', match: { value: projectId } }] }
      : undefined

    const result = await client.search(COLLECTION, {
      vector,
      limit: topK,
      score_threshold: minScore,
      with_payload: true,
      filter,
    })

    return result.map((r) => ({
      role: r.payload.role,
      text: r.payload.text,
      score: r.score,
      discussion_id: r.payload.discussion_id,
    }))
  } catch (err) {
    console.error('searchMemory error:', err.message)
    return []
  }
}

/** Warm up the embedder at server start (non-blocking) */
export function warmupMemory() {
  getEmbedder().catch((err) => console.error('fastembed warmup failed:', err.message))
}
