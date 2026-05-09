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
import crypto from 'node:crypto'

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

// ─── KNOWLEDGE BASE (experiences) ────────────────────────────────────────────

const EXPERIENCES_COLLECTION = process.env.QDRANT_EXPERIENCES_COLLECTION || 'iachat_experiences'

async function ensureExperiencesCollection() {
  try {
    await client.getCollection(EXPERIENCES_COLLECTION)
  } catch {
    await client.createCollection(EXPERIENCES_COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    })
    console.log(`✅ Qdrant: collection "${EXPERIENCES_COLLECTION}" created`)
  }
}

/**
 * Store an approved experience in Qdrant.
 * @param {object} p
 * @param {number} p.experienceId - DB id
 * @param {string} p.title
 * @param {string} p.content
 * @param {string|null} p.category
 */
export async function storeExperience({ experienceId, title, content, category }) {
  const text = `${title}\n\n${content}`.slice(0, 2000)
  try {
    await ensureExperiencesCollection()
    const vector = await embed(text)
    await client.upsert(EXPERIENCES_COLLECTION, {
      points: [
        {
          id: experienceId,
          vector,
          payload: {
            experience_id: experienceId,
            title,
            excerpt: content.slice(0, 500),
            category: category ?? null,
          },
        },
      ],
    })
  } catch (err) {
    console.error('storeExperience error:', err.message)
  }
}

/**
 * Delete an experience from Qdrant (on rejection or deletion).
 */
export async function deleteExperience(experienceId) {
  try {
    await ensureExperiencesCollection()
    await client.delete(EXPERIENCES_COLLECTION, { points: [experienceId] })
  } catch (err) {
    console.error('deleteExperience error:', err.message)
  }
}

/**
 * Search the knowledge base for experiences relevant to a devis context.
 * @param {object} p
 * @param {string} p.text - Current devis description or user query
 * @param {number} [p.topK=5]
 * @param {number} [p.minScore=0.45]
 * @returns {Promise<Array<{experience_id, title, excerpt, category, score}>>}
 */
export async function searchExperiences({ text, topK = 5, minScore = 0.45 }) {
  if (!text?.trim()) return []
  try {
    await ensureExperiencesCollection()
    const vector = await embed(text.slice(0, 2000))
    const result = await client.search(EXPERIENCES_COLLECTION, {
      vector,
      limit: topK,
      score_threshold: minScore,
      with_payload: true,
    })
    return result.map((r) => ({
      experience_id: r.payload.experience_id,
      title: r.payload.title,
      excerpt: r.payload.excerpt,
      category: r.payload.category,
      score: r.score,
    }))
  } catch (err) {
    console.error('searchExperiences error:', err.message)
    return []
  }
}

// ─── DEVIS RULES (règles atomiques opérationnelles) ────────────────────────

const DEVIS_RULES_COLLECTION = process.env.QDRANT_DEVIS_RULES_COLLECTION || 'devis_rules'

async function ensureDevisRulesCollection() {
  try {
    await client.getCollection(DEVIS_RULES_COLLECTION)
  } catch {
    await client.createCollection(DEVIS_RULES_COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    })
    console.log(`✅ Qdrant: collection "${DEVIS_RULES_COLLECTION}" created`)
  }
}

export async function storeDevisRule({ ruleId, title, content, category, severity, sourceType, sourceRef, tags = [] }) {
  if (!ruleId || !title?.trim() || !content?.trim()) return null
  const text = [title, content, category, severity, sourceRef, ...tags].filter(Boolean).join('\n').slice(0, 2500)
  try {
    await ensureDevisRulesCollection()
    const vector = await embed(text)
    await client.upsert(DEVIS_RULES_COLLECTION, {
      points: [
        {
          id: Number(ruleId),
          vector,
          payload: {
            type: 'devis_rule',
            rule_id: Number(ruleId),
            title,
            excerpt: content.slice(0, 700),
            category: category ?? null,
            severity: severity ?? 'warning',
            source_type: sourceType ?? null,
            source_ref: sourceRef ?? null,
            tags,
          },
        },
      ],
    })
    return String(ruleId)
  } catch (err) {
    console.error('storeDevisRule error:', err.message)
    return null
  }
}

export async function deleteDevisRule(ruleId) {
  if (!ruleId) return
  try {
    await ensureDevisRulesCollection()
    await client.delete(DEVIS_RULES_COLLECTION, { points: [Number(ruleId)] })
  } catch (err) {
    console.error('deleteDevisRule error:', err.message)
  }
}

export async function searchDevisRules({ text, topK = 8, minScore = 0.35 }) {
  if (!text?.trim()) return []
  try {
    await ensureDevisRulesCollection()
    const vector = await embed(text.slice(0, 2000))
    const result = await client.search(DEVIS_RULES_COLLECTION, {
      vector,
      limit: topK,
      score_threshold: minScore,
      with_payload: true,
    })
    return result.map((r) => ({
      score: r.score,
      rule_id: r.payload.rule_id,
      title: r.payload.title,
      excerpt: r.payload.excerpt,
      category: r.payload.category,
      severity: r.payload.severity,
      source_type: r.payload.source_type,
      source_ref: r.payload.source_ref,
      tags: r.payload.tags ?? [],
    }))
  } catch (err) {
    console.error('searchDevisRules error:', err.message)
    return []
  }
}

// ─── DOCUMENTS (pipeline d'analyse documentaire) ─────────────────────────────

const DOCUMENTS_COLLECTION = process.env.QDRANT_DOCUMENTS_COLLECTION || 'iachat_documents'

async function ensureDocumentsCollection() {
  try {
    await client.getCollection(DOCUMENTS_COLLECTION)
  } catch {
    await client.createCollection(DOCUMENTS_COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    })
    console.log(`✅ Qdrant: collection "${DOCUMENTS_COLLECTION}" created`)
  }
}

/**
 * Stocker une page analysée dans Qdrant.
 * l'ID Qdrant = `${documentId}_${pageNumber}` converti en entier via hash.
 * On préfère stocker par payload + upsert avec un UUID stable.
 *
 * @param {object} p
 * @param {number} p.documentPageId  ID PK de document_pages en DB
 * @param {number} p.documentId
 * @param {number} p.pageNumber
 * @param {string} p.text           Texte OCR ou analyse vision
 * @param {string} p.originalName   Nom du fichier original
 */
export async function storeDocumentPage({ documentPageId, documentId, pageNumber, text, originalName }) {
  if (!text?.trim()) return
  try {
    await ensureDocumentsCollection()
    const vector = await embed(text.slice(0, 2000))
    await client.upsert(DOCUMENTS_COLLECTION, {
      points: [
        {
          id: documentPageId,
          vector,
          payload: {
            page_id: documentPageId,
            document_id: documentId,
            page_number: pageNumber,
            excerpt: text.slice(0, 500),
            original_name: originalName ?? null,
          },
        },
      ],
    })
  } catch (err) {
    console.error('storeDocumentPage error:', err.message)
  }
}

/**
 * Supprimer toutes les pages d'un document de Qdrant.
 * @param {number[]} pageIds  Liste des IDs PK de document_pages
 */
export async function deleteDocumentPages(pageIds) {
  if (!pageIds?.length) return
  try {
    await ensureDocumentsCollection()
    await client.delete(DOCUMENTS_COLLECTION, { points: pageIds })
  } catch (err) {
    console.error('deleteDocumentPages error:', err.message)
  }
}

/**
 * Recherche sémantique dans les documents analysés.
 * @param {object} p
 * @param {string} p.text
 * @param {number} [p.topK=5]
 * @param {number} [p.minScore=0.40]
 * @returns {Promise<Array<{page_id, document_id, page_number, excerpt, original_name, score}>>}
 */
export async function searchDocuments({ text, topK = 5, minScore = 0.40 }) {
  if (!text?.trim()) return []
  try {
    await ensureDocumentsCollection()
    const vector = await embed(text.slice(0, 2000))
    const result = await client.search(DOCUMENTS_COLLECTION, {
      vector,
      limit: topK,
      score_threshold: minScore,
      with_payload: true,
    })
    return result.map((r) => ({
      page_id: r.payload.page_id,
      document_id: r.payload.document_id,
      page_number: r.payload.page_number,
      excerpt: r.payload.excerpt,
      original_name: r.payload.original_name,
      score: r.score,
    }))
  } catch (err) {
    console.error('searchDocuments error:', err.message)
    return []
  }
}

// ─── NEXUS DESIGNATIONS (exemples issus des devis PDF historiques) ──────────

const DESIGNATIONS_COLLECTION = process.env.QDRANT_DESIGNATIONS_COLLECTION || 'nexus_designations'

async function ensureDesignationsCollection() {
  try {
    await client.getCollection(DESIGNATIONS_COLLECTION)
  } catch {
    await client.createCollection(DESIGNATIONS_COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    })
    console.log(`✅ Qdrant: collection "${DESIGNATIONS_COLLECTION}" created`)
  }
}

function designationPointId(example) {
  const key = [example.source_pdf, example.page, example.repere, example.title, example.config_text].filter(Boolean).join('|')
  return parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 12), 16)
}

export async function storeDesignationExamples({ examples = [] }) {
  const usable = examples.filter((example) => example?.config_text?.trim() && example?.designation?.trim())
  if (!usable.length) return { stored: 0 }
  await ensureDesignationsCollection()

  let stored = 0
  for (const example of usable) {
    const vector = await embed(example.config_text.slice(0, 2000))
    await client.upsert(DESIGNATIONS_COLLECTION, {
      points: [
        {
          id: designationPointId(example),
          vector,
          payload: {
            source_pdf: example.source_pdf ?? null,
            page: example.page ?? null,
            repere: example.repere ?? null,
            title: example.title ?? null,
            designation: example.designation.slice(0, 2500),
            config_text: example.config_text.slice(0, 2000),
            dimensions: example.dimensions ?? [],
            performances: example.performances ?? [],
            equipments: example.equipments ?? [],
          },
        },
      ],
    })
    stored += 1
  }
  return { stored }
}

export async function searchDesignationExamples({ text, topK = 4, minScore = 0.35 }) {
  if (!text?.trim()) return []
  try {
    await ensureDesignationsCollection()
    const vector = await embed(text.slice(0, 2000))
    const result = await client.search(DESIGNATIONS_COLLECTION, {
      vector,
      limit: topK,
      score_threshold: minScore,
      with_payload: true,
    })
    return result.map((r) => ({
      score: r.score,
      source_pdf: r.payload.source_pdf,
      page: r.payload.page,
      repere: r.payload.repere,
      title: r.payload.title,
      designation: r.payload.designation,
      config_text: r.payload.config_text,
      dimensions: r.payload.dimensions ?? [],
      performances: r.payload.performances ?? [],
      equipments: r.payload.equipments ?? [],
    }))
  } catch (err) {
    console.error('searchDesignationExamples error:', err.message)
    return []
  }
}

