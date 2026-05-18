/**
 * /api/devis — Analyse Excel NEXUS + assistant Gemma + CRUD devis/lines
 *
 * POST /api/devis/conseils     — session + résultats → conseils (expériences)
 * POST /api/devis/analyze      — upload .xlsx → exécute detect_nexus.py → retourne JSON
 * POST /api/devis/grid-intent  — langage libre → JSON d'éditions grille (vLLM), validé puis appliqué côté client
 * POST /api/devis/ask          — question Gemma avec contexte markdowns + lignes devis
 * GET  /api/devis/types-options — liste des types depuis knowledge_tables.json
 * POST /api/devis/recompute-row — recalcule une ligne via detect_nexus.py --recompute
 * POST /api/devis/parse-line   — parse texte libre → _raw[17] via Gemma 4 (vLLM)
 * CRUD /api/devis              — devis headers
 * CRUD /api/devis/:id/lines   — devis line items
 */
import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { chatCompletion, fitChatMessages, maxCompletionTokens } from '../services/ollama.js'
import { getGlobalOllamaModel } from '../services/appSettings.js'
import { parseDocument } from '../services/document-parser.js'
import { analyzeDocument } from '../services/document-analyzer.js'
import { searchDesignationExamples, searchDevisRules, searchExperiences } from '../services/memory.js'
import db from '../db/index.js'
import multer from 'multer'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import os from 'os'
import crypto from 'crypto'

const execFileAsync = promisify(execFile)

// Répertoire des markdowns NEXUS
const XLSX_DIR = '/apps/zeruxcom-v1/app/ressources/XLSX'
const SCRIPT = join(XLSX_DIR, 'detect_nexus.py')
const QUOTE_SEQUENCE_ID = 1

const router = Router()
router.use(authenticate)

const VALID_LINE_SECTIONS = new Set(['products', 'calculations', 'transport'])
const normalizeLineSection = (value) => VALID_LINE_SECTIONS.has(value) ? value : 'products'
const RD_VALIDATION_CATEGORY = 'Validations individuelles R&D'
const AI_ATTACHMENT_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/tiff'])

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

function buildDevisDisplayName(devis, versionNumber = null) {
  const baseNumber = devis?.quote_number || devis?.name || (devis?.id ? `D${devis.id}` : null)
  const numberedName = [baseNumber, versionNumber].filter(Boolean).join('.')
  const parts = [numberedName, devis?.client_name || 'Client'].map(safePdfFilePart).filter(Boolean)
  return parts.length ? parts.join(' - ') : 'devis'
}

function attachmentDisposition(filename) {
  const safeName = filename || 'devis.pdf'
  const asciiName = String(safeName).replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
}

async function resolveDevisVersionNumber(devisId, requestedVersionId) {
  const versionId = Number(requestedVersionId || 0)
  if (!Number.isInteger(versionId) || versionId < 1) return null
  const [versions] = await db.query(
    'SELECT id, parent_version_id, version_label FROM devis_versions WHERE devis_id = ? ORDER BY id ASC',
    [devisId]
  )
  const target = versions.find(version => Number(version.id) === versionId)
  if (!target) return null
  const childrenByParent = new Map()
  for (const version of versions) {
    const key = Number(version.parent_version_id || 0)
    const list = childrenByParent.get(key) || []
    list.push(version)
    childrenByParent.set(key, list)
  }
  for (const list of childrenByParent.values()) list.sort((a, b) => Number(a.id) - Number(b.id))
  const numbers = new Map()
  const walk = (parentId, prefix) => {
    for (const [index, version] of (childrenByParent.get(parentId) || []).entries()) {
      const number = prefix ? `${prefix}.${index + 1}` : String(index + 1)
      numbers.set(Number(version.id), number)
      walk(Number(version.id), number)
    }
  }
  walk(0, '')
  return numbers.get(versionId) || String(target.version_label || '').replace(/^v/i, '') || null
}

function normalizeAiAttachments(input = [], limit = 6) {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      const dataUrl = String(item?.dataUrl || item?.data_url || '')
      const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/i)
      if (!match) return null
      const type = String(item?.type || match[1] || '').toLowerCase()
      if (!AI_ATTACHMENT_MIMES.has(type)) return null
      return {
        name: String(item?.name || (type === 'application/pdf' ? 'document.pdf' : 'image')).slice(0, 140),
        type,
        dataUrl,
      }
    })
    .filter(Boolean)
    .slice(0, limit)
}

async function analyzeAiDocuments(attachments, model) {
  const docs = attachments.filter(item => item.type === 'application/pdf')
  if (!docs.length) return ''
  const parts = []
  for (const doc of docs.slice(0, 3)) {
    const dir = await mkdtemp(join(os.tmpdir(), 'gemma-doc-'))
    const safeName = basename(doc.name || '').replace(/[^a-zA-Z0-9._-]/g, '_') || `${crypto.randomUUID()}.pdf`
    const filePath = join(dir, safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`)
    try {
      const base64 = doc.dataUrl.split(',')[1] || ''
      await writeFile(filePath, Buffer.from(base64, 'base64'))
      const parsed = await parseDocument(filePath, doc.type)
      const limitedPages = parsed.pages.slice(0, 8)
      const { pageResults, summary } = await analyzeDocument({ pages: limitedPages, model })
      const pageText = pageResults.map(page => `Page ${page.pageNumber}: ${page.result}`).join('\n\n')
      parts.push(`### ${doc.name}\nPages analysees: ${limitedPages.length}/${parsed.pageCount}\nSynthese:\n${summary}\n\nDetails par page:\n${pageText}`)
    } catch (err) {
      parts.push(`### ${doc.name}\nImpossible d'analyser ce PDF: ${err.message}`)
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => { })
    }
  }
  return parts.length ? `\n\n[PIECES JOINTES PDF ANALYSEES PAR VISION/OCR]\n${parts.join('\n\n---\n\n')}` : ''
}

async function loadRdValidations() {
  const [rows] = await db.query(
    `SELECT id, title, content, category
       FROM experiences
      WHERE status = 'approved' AND category = ?
      ORDER BY id ASC`,
    [RD_VALIDATION_CATEGORY]
  )
  return rows
}

async function detectEnv() {
  const validations = await loadRdValidations().catch(() => [])
  return {
    ...process.env,
    NEXUS_RD_VALIDATIONS: JSON.stringify(validations),
  }
}

function isBlockingUnpricedLine(line = {}) {
  const hasBasePrice = line.prix_base_ht != null && Number(line.prix_base_ht) > 0
  if (hasBasePrice) return false
  const text = [
    line.designation,
    line.type,
    line.type_porte,
    ...(Array.isArray(line.alertes) ? line.alertes : []),
    ...(Array.isArray(line.options) ? line.options.map(option => `${option?.label || ''} ${option?.note || ''}`) : []),
  ].filter(Boolean).join(' ')
  return /hors catalogue|nous consulter|impossible|pas de prix de base|non chiffrable/i.test(text)
}

function quoteNumberPrefix(date = new Date()) {
  const yearDigit = String(date.getFullYear()).slice(-1)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${yearDigit}${month}`
}

function formatQuoteNumber(sequenceValue, date = new Date()) {
  const seq = String(Number(sequenceValue) || 0).padStart(4, '0')
  return `${quoteNumberPrefix(date)}.${seq}`
}

async function nextQuoteNumber(connection) {
  await connection.query('INSERT IGNORE INTO quote_sequence (id, next_value) VALUES (?, ?)', [QUOTE_SEQUENCE_ID, 105])
  const [[row]] = await connection.query('SELECT next_value FROM quote_sequence WHERE id = ? FOR UPDATE', [QUOTE_SEQUENCE_ID])
  const nextValue = Number(row?.next_value || 105)
  const quoteNumber = formatQuoteNumber(nextValue)
  await connection.query('UPDATE quote_sequence SET next_value = ? WHERE id = ?', [nextValue + 1, QUOTE_SEQUENCE_ID])
  return quoteNumber
}

function parseMaybeJson(value, fallback = []) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string' || !value.trim()) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

const VANTAIL_LABELS = { '1V': 'UN VANTAIL', '2V': 'DEUX VANTAUX', 'SFX': 'SEMI-FIXE', '1VSFX': 'UN VANTAIL + SEMI-FIXE', '2VSFX': 'DEUX VANTAUX + SEMI-FIXE' }
const VANTAIL_CODE_RE = /\b(1V|2V|SFX|1VSFX|2VSFX)\b/gi

function cleanCodedText(str) {
  if (!str) return null
  // Expand type abbreviations (BP→BLOC-PORTE, etc.) and strip vantail codes
  let s = String(str)
    .replace(/\bBP\b/g, 'BLOC-PORTE')
    .replace(/\bCH\b/g, 'CHASSIS FIXE')
    .replace(/\bGI\b/g, 'GUICHET')
    .replace(VANTAIL_CODE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return s || null
}

function designationSearchText(line = {}) {
  const options = parseMaybeJson(line.options ?? line.options_json, [])
  const equipments = parseMaybeJson(line.equip_extra ?? line.equipements_json, [])
  const alerts = parseMaybeJson(line.alertes ?? line.alertes_json, [])
  const vantailLabel = line.vantail ? (VANTAIL_LABELS[String(line.vantail).toUpperCase()] || line.vantail) : null
  const gammeClean = cleanCodedText(line.gamme)
  const typeClean = cleanCodedText(line.type)
  const typePorteClean = cleanCodedText(line.type_porte)
  const parts = [
    line.designation,
    typeClean,
    typePorteClean,
    line.localisation ? `Localisation : ${line.localisation}` : null,
    gammeClean,
    vantailLabel,
    line.haut_mm || line.hauteur_mm ? `H ${line.haut_mm || line.hauteur_mm}` : null,
    line.larg_mm || line.largeur_mm ? `L ${line.larg_mm || line.largeur_mm}` : null,
    line.hauteur_pl_mm != null ? `${line._dimensionLabel === 'CV' ? 'Clair vitrage CV' : 'Passage libre PL'} H ${line.hauteur_pl_mm}` : null,
    line.largeur_pl_mm != null ? `${line._dimensionLabel === 'CV' ? 'Clair vitrage CV' : 'Passage libre PL'} L ${line.largeur_pl_mm}` : null,
    line.hauteur_reservation_mm != null ? `Réservation gros oeuvre H ${line.hauteur_reservation_mm}` : null,
    line.largeur_reservation_mm != null ? `Réservation gros oeuvre L ${line.largeur_reservation_mm}` : null,
    line.serrure?.from,
    line.serrure?.ref,
    line.serrure_ref,
    line.ferme_porte?.from,
    line.ferme_porte?.ref,
    line.ferme_porte_ref,
    line.autres,
    ...(Array.isArray(options) ? options.map((option) => String(option?.label || '').trim()).filter(Boolean) : []),
    ...(Array.isArray(equipments) ? equipments.map((item) => String(item?.label || '').trim()).filter(Boolean) : []),
    ...(Array.isArray(alerts) ? alerts : []),
    // docs intentionally excluded: they are internal .md knowledge base refs, not commercial info
  ]
  return parts.filter(Boolean).join(' | ').replace(/\s+/g, ' ').trim()
}

function isCasualAssistantMessage(text) {
  const normalized = String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return false
  if (normalized.length > 240) return false
  const stopBusinessIntent = /\b(ne parle pas du devis|arrete le devis|conversation normale)\b/.test(normalized)
  const hasBusinessIntent = /\b(tableau|devis|ligne|gamme|classement|total ht|prix|chiffr|option|alerte|dimension|hauteur|huteur|huter|largeur|porte|portes|type|chassis|cr[2-6]|rc[2-6]|ei\s?\d+|fb[4-7]|anti feu|coupe feu|serrure|garniture|vitrage|ferme porte|calcul|modifier|modifie|verifier|verifie|controle|audit)\b/.test(normalized)
  if (hasBusinessIntent && !stopBusinessIntent) return false
  return /^(salut|bonjour|bonsoir|hello|hey|coucou)\b/.test(normalized) ||
    /\b(tu es la|t es la|tes la|t la|tu est la|vous etes la|ca va|comment ca va|tu vas bien|merci)\b/.test(normalized) ||
    /\b(mon nom est|mon prenom est|je m appelle|je mappelle|appelle moi|moi c est|c est xavier|je suis xavier)\b/.test(normalized) ||
    /\bmon\s+n(?:om|on|o)?\s+\w{0,8}\s*xavier\b/.test(normalized) ||
    (/\bxavier\b/.test(normalized) && /\b(mon|nom|prenom|appelle|suis|memoire|souviens)\b/.test(normalized)) ||
    /\b(comment je m appelle|quel est mon nom|tu connais mon nom|tu te souviens de mon nom|test de memoire|memoire)\b/.test(normalized) ||
    /\b(discute avec moi|parle avec moi|conversation normale|on discute|ne parle pas du devis|arrete le devis)\b/.test(normalized) ||
    (normalized.length <= 180 && !hasBusinessIntent)
}

function equipmentText(value, depth = 0) {
  if (value == null || depth > 2) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(item => equipmentText(item, depth + 1)).join(' ')
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !/^_/u.test(key))
      .map(([, item]) => equipmentText(item, depth + 1))
      .join(' ')
  }
  return ''
}

function isBusinessDevisHistory(content) {
  const text = String(content || '').toLowerCase()
  if (text.length > 700) return true
  return /\b(devis|ligne|gamme|classement|total ht|options|alertes|hauteur ht|largeur ht|cr3|cr4|cr5|cr6|chassis|tableau)\b/i.test(text) ||
    /^\s*\|.+\|/m.test(text)
}

// ── POST /api/devis/grid-intent — natural language → validated edit list (client applies) ──
const GRID_INTENT_PATCH_KEYS = new Set([
  'hauteur_mm', 'largeur_mm', 'localisation', 'designation', 'type_porte',
  'gamme', 'vantail', 'prix_base_ht', 'ref_base', 'qty', 'multiple',
  'rc', 'pb', 'cf', 'blast', 'belier', 'prison', 'acoustic',
  'serrure', 'garniture_int', 'garniture_ext', 'vitrage', 'ferme_porte',
  'cremone', 'autres', 'thermolaquage', 'notes', 'options_add', 'options_remove',
])

const GRID_INTENT_PATCH_ALIASES = new Map([
  ['type', 'type_porte'], ['produit', 'type_porte'], ['hauteur', 'hauteur_mm'], ['largeur', 'largeur_mm'],
  ['h', 'hauteur_mm'], ['l', 'largeur_mm'], ['quantite', 'qty'], ['quantité', 'qty'], ['qte', 'qty'],
  ['remise', 'multiple'], ['multiplicateur', 'multiple'], ['coupe_feu', 'cf'], ['feu', 'cf'], ['anti_feu', 'cf'],
  ['pare_balles', 'pb'], ['pareballes', 'pb'], ['acoustique', 'acoustic'], ['db', 'acoustic'],
  ['fermeporte', 'ferme_porte'], ['ferme_porte_ref', 'ferme_porte'], ['fp', 'ferme_porte'],
  ['garniture_interieure', 'garniture_int'], ['garniture_intérieure', 'garniture_int'],
  ['garniture_exterieure', 'garniture_ext'], ['garniture_extérieure', 'garniture_ext'],
  ['option', 'options_add'], ['options', 'options_add'], ['ajouter_option', 'options_add'], ['supprimer_option', 'options_remove'],
  ['note', 'notes'], ['commentaire', 'notes'], ['thermolaquage_type', 'thermolaquage'],
])

function canonicalGridIntentPatchKey(key) {
  const raw = String(key || '').trim()
  const normalized = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_')
  return GRID_INTENT_PATCH_ALIASES.get(raw) || GRID_INTENT_PATCH_ALIASES.get(normalized) || normalized
}

function cleanGridIntentString(value, max = 4000) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, max) : null
}

function cleanGridIntentList(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,;|]+/u)
  return list.map(item => cleanGridIntentString(item, 220)).filter(Boolean).slice(0, 12)
}

function repLetterFromIndex(i) {
  let n = Math.max(0, Number(i) || 0) + 1
  let label = ''
  while (n > 0) {
    n -= 1
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26)
  }
  return label
}

function sanitizeGridIntentPatch(patch) {
  if (!patch || typeof patch !== 'object') return {}
  const out = {}
  for (const [rawKey, value] of Object.entries(patch)) {
    const key = canonicalGridIntentPatchKey(rawKey)
    if (!GRID_INTENT_PATCH_KEYS.has(key)) continue
    if (value === null || value === undefined) continue
    if (key === 'hauteur_mm' || key === 'largeur_mm') {
      const n = Number(value)
      if (Number.isFinite(n) && n >= 100 && n <= 14000) out[key] = Math.round(n)
    } else if (key === 'prix_base_ht') {
      const n = Number(value)
      if (Number.isFinite(n) && n >= 0 && n < 1e10) out[key] = n
    } else if (key === 'qty') {
      const n = Number(value)
      if (Number.isFinite(n) && n > 0 && n <= 9999) out[key] = Math.round(n)
    } else if (key === 'multiple') {
      const n = Number(value)
      if (Number.isFinite(n) && n >= 0 && n <= 10) out[key] = n
    } else if (key === 'options_add' || key === 'options_remove') {
      const list = cleanGridIntentList(value)
      if (list.length) out[key] = list
    } else if (key === 'gamme' || key === 'vantail' || key === 'ref_base') {
      const s = cleanGridIntentString(value, 120)
      if (s) out[key] = s
    } else if (['rc', 'pb', 'cf', 'blast', 'belier', 'prison', 'acoustic', 'serrure', 'garniture_int', 'garniture_ext', 'vitrage', 'ferme_porte', 'cremone', 'autres', 'thermolaquage'].includes(key)) {
      const s = cleanGridIntentString(value, 220)
      if (s) out[key] = s
    } else {
      const s = cleanGridIntentString(value, 4000)
      if (s) out[key] = s
    }
  }
  return out
}

function productLineIndices(catalog) {
  return catalog
    .map((row, index) => ((row.line_section || 'products') === 'products' ? index : -1))
    .filter(index => index >= 0)
}

function expandGridIntentTargets(targets, catalog) {
  if (targets == null) return []
  const allToken = (value) => {
    const s = String(value || '').trim().toLowerCase()
    return ['all_products', 'all', 'toutes', 'tous', 'chaque_porte', 'chaque ligne', 'ensemble'].includes(s)
  }
  if (typeof targets === 'string' && allToken(targets)) return productLineIndices(catalog)
  const list = Array.isArray(targets) ? targets : [targets]
  const out = new Set()
  for (const item of list) {
    if (item == null) continue
    if (typeof item === 'string' && allToken(item)) {
      for (const index of productLineIndices(catalog)) out.add(index)
      continue
    }
    if (typeof item === 'number' && Number.isFinite(item)) {
      const index = Math.trunc(item) - 1
      if (index >= 0 && index < catalog.length) out.add(index)
      continue
    }
    const raw = String(item).trim()
    if (/^[A-Za-z]+$/.test(raw)) {
      const index = raw.toUpperCase().split('').reduce((sum, char) => (sum * 26) + char.charCodeAt(0) - 64, 0) - 1
      if (index >= 0 && index < catalog.length) out.add(index)
    } else if (/^\d+$/.test(raw)) {
      const index = Number(raw) - 1
      if (index >= 0 && index < catalog.length) out.add(index)
    }
  }
  return [...out].sort((a, b) => a - b)
}

function normalizedGridIntentText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
}

function rowIntentSearchText(row = {}) {
  return normalizedGridIntentText([
    row.ligne, row.gamme, row.vantail, row.designation, row.type, row.localisation,
    row.haut_mm, row.larg_mm, row.rc, row.pb, row.cf, row.blast, row.belier, row.prison,
    row.serrure, row.garniture_int, row.garniture_ext, row.vitrage, row.ferme_porte,
    row.cremone, row.autres, row.thermolaquage, row.options_text, row.alertes_text,
  ].filter(Boolean).join(' '))
}

function rowLooksLikeDoor(row = {}) {
  const text = normalizedGridIntentText([row.type, row.designation, row.gamme].filter(Boolean).join(' '))
  if (/\b(chassis|guichet)\b/u.test(text)) return false
  return (row.line_section || 'products') === 'products'
}

function rowLooksLikeChassis(row = {}) {
  return /\bchassis\b/u.test(normalizedGridIntentText([row.type, row.designation, row.gamme].filter(Boolean).join(' ')))
}

function rowMatchesSecurityLevel(row = {}, prefix, level) {
  const expected = `${prefix}${level}`
  const candidates = [row.gamme, row.rc, row.pb, row.cf, row.designation, row.type]
    .map(value => normalizedGridIntentText(value).replace(/\s+/g, ''))
    .filter(Boolean)
  return candidates.some(value => value.includes(expected))
}

function filterDoorTargetsIfRequested(text, catalog, targets) {
  const wantsDoor = /\bportes?\b/u.test(text)
  const explicitlyWantsNonDoor = /\b(chassis|guichet)\b/u.test(text)
  if (!wantsDoor || explicitlyWantsNonDoor) return targets
  return targets.filter(index => rowLooksLikeDoor(catalog[index]))
}

function filterChassisTargetsIfRequested(text, catalog, targets) {
  if (!/\bchassis\b/u.test(text)) return targets
  return targets.filter(index => rowLooksLikeChassis(catalog[index]))
}

function deterministicGridIntent(question, catalog) {
  const text = normalizedGridIntentText(question)
  const patch = {}
  const heightMatch = text.match(/(?:hauteur|huteur|huter|haut(?:eur)?|\bh\b)(?:\s+(?:de\s+)?(?:porte|ht))?[^0-9]{0,40}(\d{3,5})\b/u)
  const widthMatch = text.match(/(?:largeur|larg(?:eur)?|\bl\b)(?:\s+(?:de\s+)?(?:porte|ht))?[^0-9]{0,40}(\d{3,5})\b/u)
  const qtyMatch = text.match(/(?:quantite|qte|qty|\bq\b)[^0-9]{0,24}(\d{1,4})\b/u)
  const priceMatch = text.match(/(?:prix\s*(?:base|ht)?|pu\s*ht)[^0-9]{0,24}(\d+(?:[.,]\d+)?)\b/u)
  const multipleMatch = text.match(/(?:remise|coef|coefficient|multiplicateur)[^0-9]{0,24}(\d+(?:[.,]\d+)?)\b/u)
  const localisationMatch = question.match(/(?:localisation|localiser|zone|lieu)\s*(?:=|:|a|à|en|sur)?\s*([^,.;]+)$/i)
  const noteMatch = question.match(/(?:note|commentaire|remarque)\s*(?:=|:|a|à)?\s*([^,.;]+)$/i)
  if (heightMatch) patch.hauteur_mm = Number(heightMatch[1])
  if (widthMatch) patch.largeur_mm = Number(widthMatch[1])
  if (qtyMatch) patch.qty = Number(qtyMatch[1])
  if (priceMatch) patch.prix_base_ht = Number(priceMatch[1].replace(',', '.'))
  if (multipleMatch) patch.multiple = Number(multipleMatch[1].replace(',', '.'))
  if (localisationMatch) patch.localisation = localisationMatch[1].trim()
  if (noteMatch) patch.notes = noteMatch[1].trim()

  const perfMatch = question.match(/\b(CR\s*[2-6]|RC\s*[2-6]|FB\s*[4-7]|EI\s*(?:30|60|90|120)|(?:[245])\s*t\s*\/\s*m(?:²|2)|(?:30|35|40|45)\s*dB)\b/i)
  if (perfMatch && /\b(?:mettre|passer|changer|remplacer|en|vers|devient|devenir)\b/i.test(question)) {
    const value = perfMatch[1].replace(/\s+/g, '').toUpperCase().replace(/^RC/, 'CR').replace(/DB$/, 'dB')
    if (/^CR[2-6]$/.test(value)) patch.rc = value
    else if (/^FB[4-7]$/.test(value)) patch.pb = value
    else if (/^EI(?:30|60|90|120)$/.test(value)) patch.cf = value
    else if (/DB/i.test(perfMatch[1])) patch.acoustic = perfMatch[1].replace(/\s+/g, ' ').replace(/db/i, 'dB')
    else patch.blast = perfMatch[1].replace(/\s+/g, '')
  }

  const typeMatch = question.match(/(?:type(?:\s+(?:porte|produit))?|produit)\s*(?:=|:|a|à|en|sur)?\s*(BP\s*[12]V|Chassis|Guichet)\b/i)
  if (typeMatch) patch.type_porte = typeMatch[1].replace(/\s+/g, ' ').trim()

  const equipmentPatterns = [
    ['serrure', /serrure\s*(?:=|:|a|à|en|mettre)?\s*([^,.;]+)$/i],
    ['ferme_porte', /ferme[ -]?porte\s*(?:=|:|a|à|en|mettre)?\s*([^,.;]+)$/i],
    ['vitrage', /(?:vitrage|remplissage)\s*(?:=|:|a|à|en|mettre)?\s*([^,.;]+)$/i],
    ['cremone', /cr[ée]mone\s*(?:=|:|a|à|en|mettre)?\s*([^,.;]+)$/i],
    ['thermolaquage', /\b(RAL|NCS)\b/i],
  ]
  for (const [key, re] of equipmentPatterns) {
    const match = question.match(re)
    if (match && !patch[key]) patch[key] = match[1].trim()
  }

  const cleanPatch = sanitizeGridIntentPatch(patch)
  if (!Object.keys(cleanPatch).length) return null

  let targets = []
  const lineMatch = text.match(/(?:\blignes?\b|\brepere\b|\brepère\b)\s+([a-z]{1,3}|\d{1,3})\b/u)
  if (lineMatch) {
    targets = expandGridIntentTargets(lineMatch[1], catalog)
  } else if (/\bcr\s*([2-6])\b/.test(text) || /\brc\s*([2-6])\b/.test(text)) {
    const level = (text.match(/\b(?:cr|rc)\s*([2-6])\b/) || [])[1]
    targets = catalog.map((row, index) => rowMatchesSecurityLevel(row, 'cr', level) ? index : -1).filter(index => index >= 0)
  } else if (/\bfb\s*([4-7])\b/.test(text)) {
    const level = (text.match(/\bfb\s*([4-7])\b/) || [])[1]
    targets = catalog.map((row, index) => rowMatchesSecurityLevel(row, 'fb', level) ? index : -1).filter(index => index >= 0)
  } else if (/\bei\s*(30|60|90|120)\b/u.test(text)) {
    const level = (text.match(/\bei\s*(30|60|90|120)\b/u) || [])[1]
    targets = catalog.map((row, index) => rowMatchesSecurityLevel(row, 'ei', level) ? index : -1).filter(index => index >= 0)
  } else if (/anti[ -]?feu|coupe[ -]?feu|\bfeu\b|\bei\s*(30|60|90|120)?\b/u.test(text)) {
    targets = catalog.map((row, index) => /\bei\s*(30|60|90|120)\b|anti[ -]?feu|coupe[ -]?feu/u.test(rowIntentSearchText(row)) ? index : -1).filter(index => index >= 0)
  } else if (/toutes?|tous|chaque|ensemble|all/u.test(text)) {
    targets = productLineIndices(catalog)
  }
  targets = filterDoorTargetsIfRequested(text, catalog, targets)
  targets = filterChassisTargetsIfRequested(text, catalog, targets)
  if (!targets.length) return null
  return {
    reply: `${targets.length} ligne${targets.length > 1 ? 's' : ''} ciblée${targets.length > 1 ? 's' : ''}.`,
    edits: [{ targets: targets.map(index => catalog[index]?.ligne || index + 1).filter(Boolean), set: cleanPatch }],
  }
}

function extractJsonFromModelText(text) {
  const trimmed = String(text || '').trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const inner = fence ? fence[1].trim() : trimmed
  const start = inner.indexOf('{')
  const end = inner.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('No JSON object in model output')
  return JSON.parse(inner.slice(start, end + 1))
}

function flattenGridIntentEdits(parsed, catalog) {
  const rawEdits = Array.isArray(parsed?.edits)
    ? parsed.edits
    : (Array.isArray(parsed?.actions) ? parsed.actions : [])
  const flat = []
  const maxOps = 48
  for (const edit of rawEdits) {
    if (flat.length >= maxOps) break
    const set = sanitizeGridIntentPatch(edit?.set || edit?.patch)
    if (!Object.keys(set).length) continue
    const targets = edit?.targets !== undefined ? edit.targets : edit?.target
    const indices = expandGridIntentTargets(targets, catalog)
    for (const index of indices) {
      if (flat.length >= maxOps) break
      const row = catalog[index]
      if (!row) continue
      flat.push({ lineIndex: index, lineId: row.id || null, rowKey: row.key, patch: { ...set } })
    }
  }
  return flat.map((item) => {
    const row = catalog[item.lineIndex]
    if (!row) return null
    if (item.lineId && Number(row.id) !== Number(item.lineId)) return null
    return item
  }).filter(Boolean)
}

function cleanDesignationFact(value) {
  return String(value || '')
    .replace(/\d+(?:[,.]\d+)?\s*€(?:\s*\/\s*m²)?/giu, '')
    .replace(/\s*[×x]\s*\d+(?:[,.]\d+)?\s*m²/giu, '')
    .replace(/\s*\([^)]*(?:prix|tarif|€)[^)]*\)/giu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[—-]\s*$/u, '')
    .trim()
}

function designationTargetFacts(line = {}) {
  const options = parseMaybeJson(line.options ?? line.options_json, [])
  const equipments = parseMaybeJson(line.equip_extra ?? line.equipements_json, [])
  const alerts = parseMaybeJson(line.alertes ?? line.alertes_json, [])
  const optionLabels = Array.isArray(options)
    ? options.map(option => cleanDesignationFact(option?.label || option?.designation || option?.name || '')).filter(Boolean)
    : []
  const equipmentLabels = Array.isArray(equipments)
    ? equipments.map(item => cleanDesignationFact(item?.label || item?.designation || item?.name || '')).filter(Boolean)
    : []
  const vantailLabel = line.vantail ? (VANTAIL_LABELS[String(line.vantail).toUpperCase()] || line.vantail) : null
  const facts = [
    line.type || line.type_porte ? `Type produit : ${cleanCodedText(line.type || line.type_porte)}` : null,
    line.gamme ? `Gamme / performances : ${cleanCodedText(line.gamme)}` : null,
    vantailLabel ? `Configuration : ${vantailLabel}` : null,
    line.localisation ? `Localisation : ${line.localisation}` : null,
    line.haut_mm || line.hauteur_mm ? `Hauteur hors-tout : ${line.haut_mm || line.hauteur_mm} mm` : null,
    line.larg_mm || line.largeur_mm ? `Largeur hors-tout : ${line.larg_mm || line.largeur_mm} mm` : null,
    line.hauteur_pl_mm != null ? `${line._dimensionLabel === 'CV' ? 'Hauteur clair de vitrage CV' : 'Hauteur passage libre PL'} : ${line.hauteur_pl_mm} mm` : null,
    line.largeur_pl_mm != null ? `${line._dimensionLabel === 'CV' ? 'Largeur clair de vitrage CV' : 'Largeur passage libre PL'} : ${line.largeur_pl_mm} mm` : null,
    line.hauteur_reservation_mm != null ? `Hauteur réservation gros oeuvre : ${line.hauteur_reservation_mm} mm` : null,
    line.largeur_reservation_mm != null ? `Largeur réservation gros oeuvre : ${line.largeur_reservation_mm} mm` : null,
    line.serrure?.from || line.serrure?.ref || line.serrure_ref ? `Serrure : ${cleanDesignationFact(line.serrure?.from || line.serrure?.ref || line.serrure_ref)}` : null,
    line.ferme_porte?.from || line.ferme_porte?.ref || line.ferme_porte_ref ? `Ferme-porte : ${cleanDesignationFact(line.ferme_porte?.from || line.ferme_porte?.ref || line.ferme_porte_ref)}` : null,
    optionLabels.length ? `Options / remplissages détectés :\n${optionLabels.map(label => `- ${label}`).join('\n')}` : null,
    equipmentLabels.length ? `Equipements détectés :\n${equipmentLabels.map(label => `- ${label}`).join('\n')}` : null,
    Array.isArray(alerts) && alerts.length ? `Notes techniques utilisables seulement si commerciales :\n${alerts.map(alert => `- ${cleanDesignationFact(alert)}`).join('\n')}` : null,
  ]
  return facts.filter(Boolean).join('\n')
}

// ── Multer : stockage dans /tmp, fichiers .xlsx uniquement ──────────────────
const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => cb(null, `devis-${crypto.randomUUID()}.xlsx`),
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok =
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.mimetype.includes('spreadsheet') ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ok ? cb(null, true) : cb(Object.assign(new Error('Seuls les fichiers .xlsx sont acceptés'), { code: 'BAD_TYPE' }))
  },
})

// Erreur multer → JSON
function multerErrorHandler(err, req, res, next) {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fichier trop volumineux (max 20 Mo)' })
  if (err?.code === 'BAD_TYPE') return res.status(400).json({ error: err.message })
  if (err?.name === 'MulterError') return res.status(400).json({ error: err.message })
  next(err)
}

// ── POST /api/devis/analyze ─────────────────────────────────────────────────
router.post('/analyze', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return multerErrorHandler(err, req, res, next)
    next()
  })
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier Excel requis (.xlsx)' })

  const inPath = req.file.path
  const outPath = join(os.tmpdir(), `devis-out-${crypto.randomUUID()}.json`)

  try {
    await execFileAsync('python3', [SCRIPT, inPath, outPath], {
      cwd: XLSX_DIR,
      timeout: 60000,
      env: await detectEnv(),
    })
    const raw = await readFile(outPath, 'utf-8')
    const results = JSON.parse(raw)
    res.json({ results })
  } catch (err) {
    console.error("ERREUR lors de l'appel Python ou lecture:", err)
    const detail = err.stderr || err.stdout || err.message || 'Erreur inconnue'
    res.status(500).json({ error: 'Erreur lors du traitement Python', details: detail })
  } finally {
    unlink(inPath).catch(() => { })
    unlink(outPath).catch(() => { })
  }
})

// ── GET /api/devis/types-options ────────────────────────────────────────────
// Retourne la liste des "types" (combinaison VL + gamme) lus depuis knowledge_tables.json
router.get('/types-options', async (_req, res) => {
  try {
    const { readFile } = await import('node:fs/promises')
    const path = await import('node:path')
    const ktPath = path.join(XLSX_DIR, 'knowledge_tables.json')
    const raw = await readFile(ktPath, 'utf8')
    const data = JSON.parse(raw)
    const tables = data?.tables_prix || data?.tables || data || {}
    const opts = []
    for (const key of Object.keys(tables)) {
      // Format clés: "<gamme>|<vl>"  ex: "CR4|1V", "CR4|2V", "CR4|Chassis", "BLAST|Chassis"
      const [gamme, vl] = key.split('|')
      if (!gamme || !vl) continue
      const isChassis = /^chassis$/i.test(vl)
      const isGuichet = /^guichet/i.test(vl)
      let label
      if (isChassis) label = `Chassis ${gamme}`
      else if (isGuichet) label = `Guichet ${gamme}`
      else label = `BP ${vl} ${gamme}` // ex: BP 1V CR4
      opts.push({ value: label, label, gamme, vl })
    }
    // Tri stable: BP avant Chassis avant Guichet, par gamme
    const order = (o) => (o.label.startsWith('BP ') ? 0 : o.label.startsWith('Chassis') ? 1 : 2)
    opts.sort((a, b) => order(a) - order(b) || a.label.localeCompare(b.label, 'fr'))
    // Dédoublonnage par label
    const seen = new Set()
    const uniq = opts.filter(o => seen.has(o.label) ? false : (seen.add(o.label), true))
    res.json({ options: uniq })
  } catch (err) {
    res.status(500).json({ error: 'Erreur types-options', details: err.message })
  }
})

// ── POST /api/devis/recompute-row ───────────────────────────────────────────
// body: { row: [16 cols], qty?: number } — recalcule une ligne en passant par detect_nexus.py --recompute
router.post('/recompute-row', async (req, res) => {
  const rowArr = req.body?.row
  const qty = Math.max(1, parseInt(req.body?.qty) || 1)
  if (!Array.isArray(rowArr)) return res.status(400).json({ error: 'row (array) requis' })
  try {
    const { spawn } = await import('node:child_process')
    const child = spawn('python3', [SCRIPT, '--recompute'], { cwd: XLSX_DIR, env: await detectEnv() })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.stdin.write(JSON.stringify({ row: rowArr, qty }))
    child.stdin.end()
    const exitCode = await new Promise(resolve => child.on('close', resolve))
    if (exitCode !== 0) {
      return res.status(500).json({ error: 'detect_nexus.py a échoué', details: stderr || stdout })
    }
    // Le script écrit info + JSON sur stdout ; on prend la dernière ligne JSON
    const lines = stdout.trim().split('\n').filter(Boolean)
    const lastLine = lines[lines.length - 1] || '{}'
    const result = JSON.parse(lastLine)
    res.json({ result })
  } catch (err) {
    res.status(500).json({ error: 'Erreur recompute', details: err.message })
  }
})

// ── POST /api/devis/lookup-ref ───────────────────────────────────────────────
// body: { ref: "4402" } → { found, label, prix, source }
router.post('/lookup-ref', async (req, res) => {
  const ref = String(req.body?.ref || '').trim()
  if (!ref) return res.status(400).json({ error: 'ref requise' })
  try {
    const { spawn } = await import('node:child_process')
    const child = spawn('python3', [SCRIPT, '--lookup-ref', ref], { cwd: XLSX_DIR, env: await detectEnv() })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.stdin.end()
    const exitCode = await new Promise(resolve => child.on('close', resolve))
    if (exitCode !== 0) return res.status(500).json({ error: 'lookup-ref échoué', details: stderr })
    const lines = stdout.trim().split('\n').filter(l => l.trim().startsWith('{'))
    const result = JSON.parse(lines[lines.length - 1] || '{"found":false}')
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'Erreur lookup-ref', details: err.message })
  }
})

// ── POST /api/devis/parse-line ───────────────────────────────────────────────
// body: { text: string }
// Retourne: { raw: [17 valeurs], parsed: { type, larg_mm, haut_mm, rc, pb, cf, ... } }
// Gemma 4 (vLLM) parse le texte libre → JSON _raw
router.post('/parse-line', async (req, res) => {
  const text = req.body?.text?.trim()
  if (!text) return res.status(400).json({ error: 'text requis' })
  const model = await getGlobalOllamaModel()
  const systemPrompt = `Tu es un assistant spécialisé dans les portes coupe-feu/anti-effraction NEXUS.
Tu dois extraire depuis une description libre les champs d'une ligne de devis et retourner UNIQUEMENT un objet JSON valide, sans texte autour.

Format JSON attendu (toutes les clés présentes, null si absent):
{
  "type": "<ex: BP 1V, BP 2V, Chassis CR4, Guichet CR4>",
  "larg_mm": <largeur en mm entier ou null>,
  "haut_mm": <hauteur en mm entier ou null>,
  "rc": "<CR2|CR3|CR4|CR5|CR6 ou null>",
  "pb": "<FB4|FB5|FB6|FB7 ou null>",
  "cf": "<EI30|EI60|EI120 ou null>",
  "blast": "<2t/m²|4t/m²|5t/m² ou null>",
  "belier": "<Bélier ou null>",
  "prison": "<Prison ou null>",
  "tornade": null,
  "seisme": null,
  "aev": null,
  "serrure": "<libellé serrure ou null>",
  "garn_int": "<libellé garniture intérieure ou null>",
  "garn_ext": "<libellé garniture extérieure ou null>",
  "fp": "<description du ferme-porte demandé ex: TS-5000 bras glissière, TS-4000 bras compas, ou null si aucun>",
  "autres": "<autres équipements, thermolaquage RAL/NCS si finition spécifique, ou null>"
}

Règles:
- Les dimensions peuvent être données comme "1300x2100", "H=2100 L=1300", "1300 2100" → larg=1300, haut=2100
- "CR4", "FB4", "EI60" peuvent être dans la description principale
- Si la gamme est dans le type (ex "BP 1V CR4"), ne la duplique pas dans rc
- "thermolaquage", "TL", "RAL XXXX", "NCS" → mettre dans autres ; RAL est la finition par défaut si rien n'est précisé
- La performance acoustique (30 dB, 35 dB, 40 dB, 45 dB) → mettre dans autres (ex: "acoustique 40 dB")
- Le ferme-porte est dans fp ; si la description dit "avec FP", "ferme-porte bras glissière", etc. → mettre dans fp
- tornade, seisme, aev = toujours null (gérés séparément)
- Réponds UNIQUEMENT avec le JSON, aucun commentaire, aucun markdown`

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30000)
    const raw = await chatCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      maxTokens: Math.min(512, maxCompletionTokens()),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer))

    // Extrait le JSON (parfois Gemma entoure avec ```)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(422).json({ error: 'Gemma n\'a pas retourné de JSON', raw })
    const parsed = JSON.parse(jsonMatch[0])

    // Construit le _raw[17] dans l'ordre attendu par detect_nexus.py
    const rowArr = [
      parsed.type || null,   // 0
      parsed.larg_mm != null ? Number(parsed.larg_mm) : null, // 1
      parsed.haut_mm != null ? Number(parsed.haut_mm) : null, // 2
      parsed.rc || null,  // 3
      parsed.pb || null,  // 4
      parsed.cf || null,  // 5
      parsed.blast || null,  // 6
      parsed.belier || null,  // 7
      parsed.prison || null,  // 8
      parsed.tornade || null,  // 9
      parsed.seisme || null,  // 10
      parsed.aev || null,  // 11
      parsed.serrure || null,  // 12
      parsed.garn_int || null,  // 13
      parsed.garn_ext || null,  // 14
      parsed.fp || null,  // 15
      parsed.autres || null,  // 16
    ]

    res.json({ parsed, row: rowArr })
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Timeout vLLM (30s)' })
    res.status(500).json({ error: 'Erreur parse-line', details: err.message })
  }
})

// ── POST /api/devis/suggest-designation ────────────────────────────────────
// Gemma propose une désignation PDF en s'appuyant sur les devis historiques vectorisés
router.post('/suggest-designation', async (req, res) => {
  const line = req.body?.line || req.body || {}
  const contextLines = Array.isArray(req.body?.context_lines) ? req.body.context_lines : []
  // Exclude existing designation from query: we're regenerating it from scratch
  const query = designationSearchText({ ...line, designation: '' })
  const targetFacts = designationTargetFacts(line)
  if (!query) return res.status(400).json({ error: 'line requis' })

  try {
    const examples = await searchDesignationExamples({ text: query, topK: 4, minScore: 0.30 })
    if (!examples.length) {
      return res.status(404).json({ error: 'Aucun exemple historique proche trouvé', query })
    }

    const model = await getGlobalOllamaModel()
    const examplesText = examples.map((example, index) => `EXEMPLE ${index + 1} - score ${Number(example.score || 0).toFixed(3)} - ${example.source_pdf} rep. ${example.repere || '?'}\n${example.designation}`).join('\n\n---\n\n')
    const systemPrompt = `Tu es rédacteur de devis NEXUS.
  Tu dois générer le libellé commercial complet d'une ligne de devis PDF en reprenant le style des anciens devis DOORTAL/ZERUX fournis en exemples, mais avec une structure homogène et répétable pour toutes les lignes du devis.

  Règle d'homogénéité stricte :
  - Chaque ligne de détail doit toujours appartenir au même gabarit ci-dessous et rester dans le même genre de formulation.
  - Ne varie pas les intitulés d'une ligne à l'autre : utilise les formulations canoniques ci-dessous, pas des synonymes libres.
  - Les exemples historiques servent au ton commercial uniquement. Ils ne doivent jamais modifier l'ordre, les rubriques ni ajouter des informations absentes.
  - Les équipements doivent toujours être sous le bloc "Equipement fourni-posé :" avec des puces "- ...". Ne mélange pas les équipements dans les lignes de dimensions, de performances ou de finition.

Structure obligatoire (dans cet ordre, en sautant les informations absentes) :
1. TITRE EN MAJUSCULES (ex: BLOC-PORTE "NEXUS" DEUX VANTAUX)
2. Coefficient de transmission thermique Uw = … W/m².K (si applicable)
3. Classement résistance au feu (ou "Sans classement de résistance au feu")
4. Classement anti-effraction (ex: niveau CR4 selon normes EN 1627 - 1630)
5. Description vantaux (matériau, épaisseur tôle)
6. Affaiblissement acoustique Xdb sur attestation (si applicable)
7. Dimensions sur mesure : L … H … Passage libre à 90° (ou clair de vitrage CV pour un châssis fixe)
8. Décomposition vantaux si deux vantaux (largeurs individuelles, hors-bati)
9. Soit dimensions hors-tout : L … H …
10. Réservation gros oeuvre prévoir : L … H … (toujours dimensions hors-tout + 10 mm)
11. Poids approximatif (vantaux + bâti)
12. Finition : acier galvanisé + thermolaquage RAL/NCS (RAL par défaut)
13. Equipement fourni-posé : (puis liste avec "- " en début de chaque item)
14. Localisation (si mentionnée)

Formulations canoniques attendues :
- Performances coupe-feu EI² XX minutes recto/verso
- Classement anti-effraction niveau CRX selon normes EN 1627 - 1630
- Performances pare-balle FBX selon norme EN 1522
- Affaiblissement acoustique XX dB sur attestation
- Dimensions sur mesure : L ... x H ... mm
- Passage libre à 90° : L ... x H ... mm OU Clair de vitrage CV : L ... x H ... mm pour un châssis
- Dimensions hors-tout : L ... x H ... mm
- Réservation gros oeuvre prévoir : L ... x H ... mm
- Finition : acier galvanisé + thermolaquage RAL/NCS
- Equipement fourni-posé :
- Localisation : ...

Contraintes absolues :
- Réponds UNIQUEMENT avec le libellé final brut, une information par ligne, sans markdown ni commentaire.
- Ne mets jamais de prix, quantité, délai, montant HT ou total.
- Utilise uniquement les informations présentes dans la ligne cible. Les exemples servent au style et aux formulations, pas à inventer des équipements.
- La section "DONNEES STRUCTUREES DE LA LIGNE CIBLE" est la source de vérité prioritaire. Si elle contient "Options / remplissages détectés" ou "Equipements détectés", ces éléments doivent apparaître dans le libellé, généralement sous "Equipement fourni-posé :".
- Anti-hallucination : avant d'écrire une ligne, vérifie que la donnée correspondante existe explicitement dans LIGNE CIBLE ou dans les champs calculés fournis. Si la donnée vient seulement d'un exemple historique, omets la ligne.
- N'invente jamais Uw, poids, épaisseur de tôle, largeur de vantail, hors-bâti, avis de chantier, attestation, matériau, vitrage, serrure, garniture, ferme-porte, crémone, finition spéciale ou localisation.
- Si une information est douteuse, absente, contradictoire ou seulement implicite, omets-la au lieu de compléter.
- La réservation gros oeuvre doit toujours être calculée depuis les dimensions hors-tout : largeur HT + 10 mm et hauteur HT + 10 mm. N'utilise aucune autre formule.
- Si une information est absente dans la ligne cible, omet cette ligne.
- Le titre (ligne 1) doit toujours être en MAJUSCULES.
- N'utilise JAMAIS les codes internes bruts comme "1V", "2V", "BP", "CH", "SFX" dans le libellé. Ils sont déjà traduits : 1V=UN VANTAIL, 2V=DEUX VANTAUX, BP=BLOC-PORTE, CH=CHASSIS FIXE.
- Pour "Vantail en tôle épaisseur X" : utilise uniquement l'épaisseur si elle est explicitement disponible dans la ligne cible (ex: 20/10°, 25/10°). Si absente, écris uniquement "Vantail en tôle double face" sans épaisseur. NE JAMAIS inventer ni utiliser "1V" ou "2V" comme épaisseur.
- Si une localisation est présente dans la ligne cible, elle doit apparaître exactement sous la forme "Localisation : ..." en fin de libellé, sans la transformer.
- Ne mentionne jamais les noms de fichiers internes (ex: BASE.md, CR3.md, SERRURES-GARNITURES.md). Ces références sont strictement internes.`

    const contextText = contextLines
      .slice(0, 6)
      .map((ctx, idx) => `CONTEXTE ${idx + 1}: ${designationSearchText(ctx)}`)
      .filter(Boolean)
      .join('\n')
    const userPrompt = `EXEMPLES HISTORIQUES A IMITER:\n\n${examplesText}\n\nDONNEES STRUCTUREES DE LA LIGNE CIBLE (SOURCE DE VERITE):\n${targetFacts}\n\nLIGNE CIBLE (texte de recherche complémentaire):\n${query}${contextText ? `\n\nCONTEXTE DU DEVIS (lignes voisines):\n${contextText}` : ''}\n\nLIBELLE A PRODUIRE:`
    const designation = await chatCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 900,
    })

    // Post-process: remove rogue internal codes that Gemma may still slip in
    let cleanDesignation = String(designation || '').trim()
    // "épaisseur 1V" / "épaisseur 2V" → "épaisseur 20/10°" (standard NEXUS tôle)
    cleanDesignation = cleanDesignation.replace(/épaisseur\s+[12]V\b/gi, 'épaisseur 20/10°')
    // "épaisseur 20/10°/10°" (duplicate suffix from bad XLSX data) → "épaisseur 20/10°"
    cleanDesignation = cleanDesignation.replace(/épaisseur\s+20\/10°\/10°/gi, 'épaisseur 20/10°')
    // Standalone "1V" or "2V" not preceded by a digit/ref (e.g. "CR3 — 1V" at end of line)
    cleanDesignation = cleanDesignation.replace(/(?<![A-Z\d])([12]V)\b(?!\s*[-–—])/g, (m, p1) =>
      p1 === '1V' ? 'UN VANTAIL' : 'DEUX VANTAUX'
    )
    // Fix malformed Uw lines:
    // Case 1: "Uw = None/null/undefined" → remove entire line
    cleanDesignation = cleanDesignation.replace(
      /Coefficient de transmission thermique Uw\s*=\s*(None|null|undefined)\s*\n?/gi,
      ''
    )
    // Case 2: "Uw = " at end of line (empty value) → remove
    cleanDesignation = cleanDesignation.replace(
      /Coefficient de transmission thermique Uw\s*=\s*\n/gi,
      ''
    )
    // Case 3: "Uw = Sans classement..." (Gemma merged Uw + feu line) → strip Uw prefix
    cleanDesignation = cleanDesignation.replace(
      /Coefficient de transmission thermique Uw\s*=\s*(?=Sans\s)/gi,
      ''
    )
    cleanDesignation = cleanDesignation.replace(/  +/g, ' ').trim()
    // Remove lines that contain only .md internal filenames (e.g. "Localisation : BASE.md")
    cleanDesignation = cleanDesignation.split('\n')
      .filter(l => !/\b\w[\w-]*\.md\b/.test(l))
      // Remove lines with prices or XLSX internal markers (whole or decimal amounts)
      .filter(l => !/\d+([,.]\d+)?\s*€/.test(l) && !/(xlsx|défaut gamme|× \d+\s*@)/i.test(l))
      // Remove empty "Localisation :" lines
      .filter(l => !/^Localisation\s*:\s*$/i.test(l.trim()))
      // Remove lines with Python "None" artifacts (null data from XLSX)
      .filter(l => !/\bNone\b/.test(l))
      // Remove alert/emoji items from KB alerts bleeding into equipment list
      .filter(l => !/^-?\s*(?:ℹ|❌|⚠️?|🔴|🟡|🟢)/u.test(l.trim()))
      // Remove template placeholder lines Gemma outputs verbatim from system prompt
      .filter(l => !/\bXdb\s+sur\s+attestation\b/i.test(l))
      .filter(l => !/\(si applicable\)/i.test(l))
      // Remove "Localisation :" lines containing internal product codes (not real room codes)
      .filter(l => !/^Localisation\s*:\s*(BP|CH|SFX|BLOC-PORTE|CHASSIS|GUICHET|GI|PT)\b/i.test(l.trim()))
      // Remove orphaned "W/m².K" or "… W/m².K" lines (Uw prefix was stripped, unit remains)
      .filter(l => !/^[…\s]*W\/m²\.K\s*$/.test(l.trim()))
      // Remove blank lines produced by cleanup
      .filter(l => l.trim())
      .join('\n')
      .trim()

    res.json({
      designation: cleanDesignation,
      query,
      target_facts: targetFacts,
      context_count: contextLines.length,
      examples: examples.map((example) => ({
        score: example.score,
        source_pdf: example.source_pdf,
        page: example.page,
        repere: example.repere,
        title: example.title,
        designation: example.designation,
      })),
    })
  } catch (err) {
    console.error('suggest-designation error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Shared Gemma 4 chat messages for stepper ────────────────────────────────
router.get('/ai-messages', async (req, res) => {
  const devisId = req.query.devis_id || null
  const versionId = req.query.version_id || null
  if (!devisId) return res.json([])
  try {
    const [rows] = await db.query(
      `SELECT m.id, m.devis_id, m.version_id, m.user_id, m.role, m.content, m.images_json, m.agent_slug, m.shared,
                  m.created_at, m.updated_at, m.edited_at, u.name AS user_name
             FROM devis_ai_messages m
             LEFT JOIN users u ON u.id = m.user_id
            WHERE m.devis_id = ? AND (m.version_id <=> ?)
            ORDER BY m.created_at ASC, m.id ASC`,
      [devisId, versionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/ai-messages', async (req, res) => {
  const { devis_id, version_id = null, role = 'user', content, images = [], agent_slug = null } = req.body
  if (!devis_id) return res.status(400).json({ error: 'devis_id requis' })
  if (!['user', 'assistant'].includes(role)) return res.status(400).json({ error: 'role invalide' })
  if (!content?.trim()) return res.status(400).json({ error: 'content requis' })
  const safeImages = normalizeAiAttachments(images, 6)
  try {
    const [result] = await db.query(
      `INSERT INTO devis_ai_messages (devis_id, version_id, user_id, role, content, images_json, agent_slug, shared)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [devis_id, version_id || null, role === 'user' ? req.user.id : null, role, content.trim(), safeImages.length ? JSON.stringify(safeImages) : null, agent_slug]
    )
    const [rows] = await db.query(
      `SELECT m.id, m.devis_id, m.version_id, m.user_id, m.role, m.content, m.images_json, m.agent_slug, m.shared,
                  m.created_at, m.updated_at, m.edited_at, u.name AS user_name
             FROM devis_ai_messages m
             LEFT JOIN users u ON u.id = m.user_id
            WHERE m.id = ?`,
      [result.insertId]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/ai-messages', async (req, res) => {
  const { devis_id, version_id = null } = req.body || {}
  if (!devis_id) return res.status(400).json({ error: 'devis_id requis' })
  try {
    const [result] = await db.query(
      'DELETE FROM devis_ai_messages WHERE devis_id = ? AND (version_id <=> ?)',
      [devis_id, version_id || null]
    )
    res.json({ success: true, deleted: result.affectedRows || 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/ai-messages/:id', async (req, res) => {
  const { content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'content requis' })
  try {
    const [rows] = await db.query('SELECT * FROM devis_ai_messages WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Message introuvable' })
    const message = rows[0]
    if (message.role !== 'user') return res.status(403).json({ error: 'Seuls les messages utilisateur sont éditables' })
    await db.query(
      'UPDATE devis_ai_messages SET content = ?, edited_at = NOW() WHERE id = ?',
      [content.trim(), req.params.id]
    )
    const [updated] = await db.query(
      `SELECT m.id, m.devis_id, m.version_id, m.user_id, m.role, m.content, m.images_json, m.agent_slug, m.shared,
                  m.created_at, m.updated_at, m.edited_at, u.name AS user_name
             FROM devis_ai_messages m
             LEFT JOIN users u ON u.id = m.user_id
            WHERE m.id = ?`,
      [req.params.id]
    )
    res.json(updated[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function parseActionChanges(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return value
  if (!value) return []
  try { return JSON.parse(value) || [] } catch { return [] }
}

// ── Persisted reversible grid actions ──────────────────────────────────────
router.get('/:id/grid-actions', async (req, res) => {
  const devisId = Number(req.params.id)
  const versionId = req.query.version_id || null
  if (!Number.isInteger(devisId) || devisId < 1) return res.status(400).json({ error: 'ID devis invalide' })
  try {
    const [rows] = await db.query(
      `SELECT id, devis_id, version_id, user_id, origin, label, prompt, changes_json, created_at
         FROM devis_grid_actions
        WHERE devis_id = ? AND (version_id <=> ?)
        ORDER BY created_at ASC, id ASC`,
      [devisId, versionId || null]
    )
    res.json(rows.map(row => ({
      id: `db-grid-action-${row.id}`,
      db_id: row.id,
      devis_id: row.devis_id,
      version_id: row.version_id,
      user_id: row.user_id,
      origin: row.origin,
      label: row.label,
      prompt: row.prompt,
      changes: parseActionChanges(row.changes_json),
      createdAt: row.created_at,
    })))
  } catch (err) {
    console.error('grid-actions list error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/grid-actions', async (req, res) => {
  const devisId = Number(req.params.id)
  const versionId = req.body?.version_id || null
  const origin = ['manual', 'ai', 'system'].includes(req.body?.origin) ? req.body.origin : 'manual'
  const label = String(req.body?.label || 'Action grille').trim().slice(0, 255)
  const prompt = req.body?.prompt ? String(req.body.prompt).slice(0, 5000) : null
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : []
  if (!Number.isInteger(devisId) || devisId < 1) return res.status(400).json({ error: 'ID devis invalide' })
  if (!changes.length) return res.status(400).json({ error: 'changes requis' })
  try {
    const [result] = await db.query(
      `INSERT INTO devis_grid_actions (devis_id, version_id, user_id, origin, label, prompt, changes_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [devisId, versionId || null, req.user?.id || null, origin, label, prompt, JSON.stringify(changes)]
    )
    const [rows] = await db.query(
      `SELECT id, devis_id, version_id, user_id, origin, label, prompt, changes_json, created_at
         FROM devis_grid_actions
        WHERE id = ?`,
      [result.insertId]
    )
    const row = rows[0]
    res.status(201).json({
      id: `db-grid-action-${row.id}`,
      db_id: row.id,
      devis_id: row.devis_id,
      version_id: row.version_id,
      user_id: row.user_id,
      origin: row.origin,
      label: row.label,
      prompt: row.prompt,
      changes: parseActionChanges(row.changes_json),
      createdAt: row.created_at,
    })
  } catch (err) {
    console.error('grid-actions create error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id/grid-actions', async (req, res) => {
  const devisId = Number(req.params.id)
  const versionId = req.body?.version_id ?? req.query.version_id ?? null
  const afterIdRaw = req.body?.after_id ?? req.query.after_id ?? null
  const afterId = afterIdRaw == null || afterIdRaw === '' ? null : Number(afterIdRaw)
  if (!Number.isInteger(devisId) || devisId < 1) return res.status(400).json({ error: 'ID devis invalide' })
  if (afterIdRaw != null && (!Number.isInteger(afterId) || afterId < 1)) return res.status(400).json({ error: 'after_id invalide' })
  try {
    const params = [devisId, versionId || null]
    let where = 'devis_id = ? AND (version_id <=> ?)'
    if (afterId != null) {
      where += ' AND id > ?'
      params.push(afterId)
    }
    const [result] = await db.query(`DELETE FROM devis_grid_actions WHERE ${where}`, params)
    res.json({ ok: true, deleted: result.affectedRows || 0 })
  } catch (err) {
    console.error('grid-actions clear error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/devis/grid-intent — natural language → JSON edits (validated; client applies) ──
router.post('/grid-intent', async (req, res) => {
  const question = String(req.body?.question || '').trim()
  const rowsIn = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (!question) return res.status(400).json({ error: 'Question requise' })
  if (question.length > 4500) return res.status(400).json({ error: 'Question trop longue' })
  if (!rowsIn.length) return res.json({ ok: false, reply: 'Aucune ligne de devis dans le contexte.', edits: [] })
  if (isCasualAssistantMessage(question)) {
    return res.json({ ok: false, reply: '', edits: [] })
  }

  const catalog = rowsIn.slice(0, 120).map((row, index) => {
    const raw = Array.isArray(row._raw) ? row._raw : (Array.isArray(row.raw) ? row.raw : [])
    const parsedId = Number(row.id ?? row._lineId ?? row.lineId)
    return {
      index,
      key: String(row.rowKey || row.key || row._clientKey || row.id || row._lineId || `row-${index}`),
      id: Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null,
      ligne: String(row.ligne || repLetterFromIndex(index)).trim().toUpperCase().slice(0, 4),
      line_section: row.line_section || 'products',
      gamme: row.gamme ?? null,
      vantail: row.vantail ?? null,
      designation: row.designation ?? null,
      haut_mm: row.haut_mm ?? row.hauteur_mm ?? null,
      larg_mm: row.larg_mm ?? row.largeur_mm ?? null,
      dimensions: row.dimensions ?? [row.haut_mm ?? row.hauteur_mm, row.larg_mm ?? row.largeur_mm].filter(Boolean).join('×'),
      localisation: row.localisation ?? null,
      type: row.type ?? row.type_porte ?? null,
      rc: row.rc ?? raw[3] ?? null,
      pb: row.pb ?? raw[4] ?? null,
      cf: row.cf ?? raw[5] ?? null,
      blast: row.blast ?? raw[6] ?? null,
      belier: row.belier ?? raw[7] ?? null,
      prison: row.prison ?? raw[8] ?? null,
      serrure: row.serrure ?? raw[12] ?? null,
      garniture_int: row.garniture_int ?? raw[13] ?? null,
      garniture_ext: row.garniture_ext ?? raw[14] ?? null,
      ferme_porte: row.ferme_porte ?? raw[15] ?? null,
      vitrage: row.vitrage ?? raw[16] ?? null,
      options_text: Array.isArray(row.options) ? row.options.map(option => equipmentText(option)).filter(Boolean).join(' | ') : '',
      alertes_text: Array.isArray(row.alertes) ? row.alertes.join(' | ') : '',
    }
  })

  if (!catalog.length) return res.json({ ok: false, reply: 'Aucune ligne exploitable dans le contexte.', edits: [] })

  const deterministic = deterministicGridIntent(question, catalog)
  if (deterministic) {
    const edits = flattenGridIntentEdits(deterministic, catalog)
    if (edits.length) {
      const reply = `${edits.length} ligne${edits.length > 1 ? 's' : ''} ciblée${edits.length > 1 ? 's' : ''}.`
      return res.json({ ok: true, reply, edits })
    }
  }

  const tableJson = JSON.stringify(catalog, null, 0)
  const systemMsg = `Tu es un extracteur d'intentions pour un tableau de devis NEXUS (portes).
L'utilisateur demande une ou plusieurs modifications en français (langage libre).
Tu dois répondre UNIQUEMENT par un objet JSON (pas de markdown, pas de texte hors JSON) avec cette forme exacte :
{
  "reply": "phrase courte en français résumant ce qui sera modifié (ou pourquoi tu refuses)",
  "edits": [
    {
      "targets": "all_products" | ["A","B"] | [1,2] | "C",
      "set": { "cle": valeur }
    }
  ]
}

Règles pour "targets" :
- "all_products" (ou "all") = toutes les lignes produit (pas transport ni calculs).
- Une lettre seule "A" = ligne A (première ligne = A).
- Un tableau mélange lettres et numéros 1-based : ["A","B",3] = lignes A, B et 3.
- Numéros = index 1-based dans le tableau fourni (1 = première ligne).

Clés autorisées dans "set" (une ou plusieurs par edit) :
- hauteur_mm, largeur_mm (entiers mm, typiquement 600–3000)
- localisation, designation, type_porte, notes (chaînes)
- gamme, vantail, ref_base (chaînes courtes)
- prix_base_ht, qty, multiple (nombres ; qty=quantité, multiple=coefficient/remise)
- rc, pb, cf, blast, belier, prison, acoustic (performances : CR3, FB6, EI60, 4t/m², 40 dB...)
- serrure, garniture_int, garniture_ext, vitrage, ferme_porte, cremone, autres, thermolaquage
- options_add et options_remove (tableaux de libellés courts)

Ciblage métier :
- Résous toi-même les cibles à partir du tableau. Exemples : "toutes les portes CR3" = lignes dont gamme/performance contient CR3 ; "portes anti-feu" = lignes EI/coupe-feu ; "ligne B" = repère B.
- Quand tu cibles par critère, renvoie des cibles explicites (lettres ou numéros), pas une expression vague.

Si la demande est une question, un audit, ou ne correspond pas à une modification de champs : mets "edits": [] et explique dans "reply".
Si tu n'es pas sûr des lignes ciblées, préfère "edits": [] et pose une clarification courte dans "reply".
Ne dépasse pas 12 entrées dans "edits". Regroupe les lignes qui reçoivent le même patch dans un seul objet avec plusieurs targets.

Tableau actuel (ordre = index 0..n-1, id peut être absent si la grille est locale) :
${tableJson}

Question utilisateur :
`

  try {
    const model = await getGlobalOllamaModel()
    const userMsg = `${systemMsg}${question}`
    let rawText
    try {
      rawText = await chatCompletion({
        model,
        messages: [{ role: 'user', content: userMsg }],
        temperature: 0.08,
        maxTokens: 2200,
        responseFormat: { type: 'json_object' },
      })
    } catch (firstErr) {
      console.warn('[devis/grid-intent] json_object mode failed, retry without:', firstErr?.message || firstErr)
      rawText = await chatCompletion({
        model,
        messages: [{ role: 'user', content: userMsg }],
        temperature: 0.08,
        maxTokens: 2200,
      })
    }
    const parsed = extractJsonFromModelText(rawText)
    const edits = flattenGridIntentEdits(parsed, catalog)
    const reply = String(parsed?.reply || '').trim() || (edits.length ? 'Modifications préparées.' : 'Aucune modification structurée extraite.')
    if (!edits.length) return res.json({ ok: false, reply, edits: [] })
    return res.json({ ok: true, reply, edits })
  } catch (err) {
    console.error('[devis/grid-intent]', err)
    return res.json({ ok: false, reply: 'Impossible d’interpréter la demande comme des modifications de tableau. Reformule ou précise les lignes.', edits: [] })
  }
})

// ── POST /api/devis/ask ─────────────────────────────────────────────────────
// body: { rows: [...], question: string, mdFiles: [string], scope: 'line'|'all' }
router.post('/ask', async (req, res) => {
  const { rows = [], question, mdFiles = [], scope = 'line', images = [], history = [], devis_id = null, version_id = null } = req.body
  const safeQuestion = String(question || '').trim()
  const incomingHistory = Array.isArray(history)
    ? history
      .filter(item => ['user', 'assistant'].includes(item?.role) && String(item?.content || '').trim())
      .slice(-10)
      .map(item => ({ role: item.role, content: String(item.content || '').trim().slice(0, 1200) }))
    : []
  const attachments = normalizeAiAttachments(images, 6)
  const pastedImages = attachments.filter(item => item.type.startsWith('image/')).map(item => item.dataUrl)
  if (!safeQuestion && !attachments.length) return res.status(400).json({ error: 'Question requise' })
  const casualMessage = isCasualAssistantMessage(safeQuestion) && !attachments.length

  // ── Enrichissement automatique des markdowns selon les caractéristiques de la ligne ──
  // Objectif : garantir que Gemma a toujours accès aux bons référentiels croisés,
  // même si detect_nexus.py ne les a pas listés explicitement.
  const ALWAYS_LOAD = ['GUIDE-DEVIS.md', 'BASE.md', 'EQUIP-COMMUN.md', 'SERRURES-GARNITURES.md', 'TABLEAUX-ADDITIONNELS.md']
  // En mode "all", on prend toutes les lignes pour extraire les gammes/options ; sinon row[0]
  const contextRows = casualMessage ? [] : ((scope === 'all' || rows.length > 1) ? rows : (rows[0] ? [rows[0]] : []))

  const crossRefs = new Set()
  for (const r of contextRows) {
    const gamme = String(r.gamme || '').toUpperCase()
    const options = Array.isArray(r.options) ? r.options : []
    const optionsText = options.map(o => String(o.label || '').toUpperCase()).join(' ')
    const extraText = String(r.type || '') + ' ' + optionsText + ' ' + JSON.stringify(r.alertes || [])
    const extraUpper = extraText.toUpperCase()

    if (gamme.includes('CR2') || gamme.includes('RC2') || gamme.includes('CR3') || gamme.includes('RC3')) crossRefs.add('CR3.md')
    if (gamme.includes('CR4')) crossRefs.add('CR4.md')
    if (gamme.includes('CR5')) crossRefs.add('CR5.md')
    if (gamme.includes('CR6')) crossRefs.add('CR6.md')
    if (gamme.includes('FB6') || gamme.includes('FB7')) crossRefs.add('FB6-7.md')
    if (gamme.includes('EI60')) crossRefs.add('EI60.md')
    if (gamme.includes('EI120')) crossRefs.add('EI120.md')
    if (gamme.includes('PRISON')) crossRefs.add('PRISON.md')
    if (gamme.includes('ANTI-BÉLIER') || gamme.includes('BELIER')) crossRefs.add('ANTI-BELIER.md')
    if (gamme.includes('BLAST')) crossRefs.add('BLAST.md')
    if (gamme.includes('EF2')) crossRefs.add('EF2.md')
    if (/EI\s?(30|60|120)/.test(extraUpper)) {
      crossRefs.add('EQUIP-EI.md')
      if (extraUpper.includes('EI60')) crossRefs.add('EI60.md')
      if (extraUpper.includes('EI120')) crossRefs.add('EI120.md')
    }
    if (/FB[4-7]/.test(extraUpper)) crossRefs.add('EQUIP-FB.md')
    if (extraUpper.includes('SÉISME') || extraUpper.includes('SEISME') || extraUpper.includes('AEV')) {
      crossRefs.add('SEISME-AEV.md')
    }
    if (extraUpper.includes('BLAST')) crossRefs.add('BLAST.md')
    if (extraUpper.includes('RAL') || extraUpper.includes('NCS') || extraUpper.includes('THERMOLAQUAGE') || extraUpper.includes('LAQUAGE')) {
      crossRefs.add('THERMOLAQUAGE.md')
    }
  }

  // Consolider : docs détectés + cross-refs + fichiers transverses systématiques
  const requestedDocs = casualMessage ? [] : (Array.isArray(mdFiles) ? mdFiles : [])
  const rowDocs = contextRows.flatMap(r => Array.isArray(r.docs) ? r.docs : [])
  const shouldLoadKnowledgeDocs = requestedDocs.length > 0 || contextRows.length > 0
  const allDocs = shouldLoadKnowledgeDocs ? [...new Set([
    ...requestedDocs,
    ...rowDocs,
    ...Array.from(crossRefs),
    ...ALWAYS_LOAD,
  ])] : []

  // Chargement des markdowns référencés (protection path-traversal)
  const mdParts = []
  const loadedDocs = []
  for (const name of allDocs) {
    const safe = basename(name)                      // strip any path component
    const p = join(XLSX_DIR, safe)
    if (p.startsWith(XLSX_DIR) && existsSync(p)) {  // double-check prefix
      try {
        const content = await readFile(p, 'utf-8')
        mdParts.push(`### 📄 ${safe}\n\n${content}`)
        loadedDocs.push(safe)
      } catch { /* ignore unreadable files */ }
    }
  }

  const context = mdParts.join('\n\n---\n\n')

  // ── Règles métier : chargement SYSTÉMATIQUE (toujours injectées, indépendamment de la question) ──
  // Les règles métier approuvées s'appliquent à CHAQUE analyse — ne pas les filtrer par similarité.
  let mandatoryRulesBlock = ''
  try {
    if (!casualMessage) {
      const [rulesRows] = await db.query(
        `SELECT id, title, content, category FROM experiences WHERE status = 'approved' AND category IN ('Règle métier', 'Chiffrage', 'Validations individuelles R&D') ORDER BY id ASC`
      )
      if (rulesRows.length) {
        mandatoryRulesBlock =
          `\n\n[RÈGLES MÉTIER ET CHIFFRAGE APPROUVÉES — À APPLIQUER SYSTÉMATIQUEMENT SUR CHAQUE LIGNE :]\n` +
          `Ces règles s'appliquent à TOUTES les analyses, sans exception. Vérifie chacune d'elles pour chaque porte.\n` +
          rulesRows.map((r, i) => `${i + 1}. [${r.category}] ${r.title}\n${r.content}`).join('\n\n')
      }
    }
  } catch { /* non-bloquant */ }

  // ── Expériences terrain : recherche sémantique (contexte-dépendant) ──
  const expKeywords = /expérience|commercial|précédent|collègue|équipe|terrain|cas vécu|autre(s)? commercial|ont traité|ont fait/i
  const expTopK = expKeywords.test(safeQuestion) ? 8 : 5
  const expHitsRaw = casualMessage ? [] : await searchExperiences({ text: safeQuestion, topK: expTopK }).catch(() => [])
  // Exclure les règles métier déjà injectées ci-dessus (éviter doublons)
  const expHits = expHitsRaw.filter(h => !['Règle métier', 'Chiffrage', 'Validations individuelles R&D'].includes(h.category))
  const expBlock = expHits.length
    ? `\n\n[EXPÉRIENCES TERRAIN — PRIORITÉ ABSOLUE SUR LA DOCUMENTATION :]\nSi une expérience terrain contredit ou précise le tarif standard, la règle terrain prime. Mentionne explicitement que tu appliques une règle métier ("D'après nos expériences commerciales...").\n` +
    expHits.map((h, i) => `${i + 1}. [${h.category || 'Général'}] ${h.title} — ${h.excerpt || ''}`).join('\n')
    : ''

  const semanticRuleText = [
    safeQuestion,
    ...contextRows.slice(0, 40).map((r, i) => `Ligne ${i + 1}: ${r.gamme || ''} ${r.vantail || ''} ${r.type || r.designation || ''} ${r.dimensions || ''} options ${(r.options || []).join?.(', ') || ''} alertes ${(r.alertes || []).join?.(' | ') || ''}`),
  ].filter(Boolean).join('\n')
  const ruleTopK = /v[ée]rif|conforme|conformit|r[èe]gle|audit|contr[oô]le|conseil|attention|risque/i.test(safeQuestion) ? 12 : 7
  const ruleHits = casualMessage ? [] : await searchDevisRules({ text: semanticRuleText || safeQuestion, topK: ruleTopK, minScore: 0.28 }).catch(() => [])
  const rulesBlock = ruleHits.length
    ? `\n\n[RÈGLES DEVIS QDRANT PERTINENTES — À UTILISER POUR VÉRIFIER/CONSEILLER :]\n` +
    ruleHits.map((r, i) => `${i + 1}. ${r.rule_code || `R${r.rule_id}`} [${r.severity || 'warning'}] ${r.title}\n${r.excerpt}${r.source_ref ? `\nSource: ${r.source_type || 'source'} ${r.source_ref}` : ''}`).join('\n\n')
    : ''

  let storedHistory = []
  if (devis_id) {
    try {
      const [storedRows] = await db.query(
        `SELECT role, content
           FROM devis_ai_messages
          WHERE devis_id = ? AND (version_id <=> ?)
          ORDER BY created_at DESC, id DESC
          LIMIT 12`,
        [devis_id, version_id || null]
      )
      storedHistory = storedRows.reverse()
        .filter(item => ['user', 'assistant'].includes(item.role) && String(item.content || '').trim())
        .map(item => ({ role: item.role, content: String(item.content || '').trim().slice(0, 1200) }))
    } catch { /* non-bloquant */ }
  }
  const historySeen = new Set()
  const shortHistory = [...storedHistory, ...incomingHistory]
    .filter(item => !casualMessage || !isBusinessDevisHistory(item.content))
    .filter(item => {
      const key = `${item.role}:${item.content}`
      if (historySeen.has(key)) return false
      historySeen.add(key)
      return true
    })
    .slice(casualMessage ? -6 : -12)
  const historyBlock = shortHistory.length
    ? `\n\n[MÉMOIRE COURTE DE LA CONVERSATION — contexte récent à conserver :]\n` +
    shortHistory.map((m, i) => `${i + 1}. ${m.role === 'user' ? 'Utilisateur' : 'Zerux IA'}: ${String(m.content || '').slice(0, casualMessage ? 400 : 1200)}`).join('\n')
    : ''

  const casualSystemMsg = `Tu es Zerux IA, un assistant conversationnel naturel, direct et chaleureux.
Réponds au dernier message de l'utilisateur comme dans une discussion normale.
Si l'utilisateur donne son nom ou son prénom, mémorise-le dans la conversation et confirme simplement.
Si l'utilisateur demande si tu te souviens de son nom, utilise uniquement la mémoire courte fournie.
Ignore totalement les devis, tableaux, lignes, options ou anciens contenus techniques qui pourraient être dans un historique pollué.
Ne parle pas de devis sauf si l'utilisateur le demande explicitement dans son dernier message.
Réponds en français, brièvement, en Markdown si cela aide.`

  const businessSystemMsg = `Tu es un expert NEXUS en menuiserie sécurisée (portes blindées RC3-RC6, coupe-feu EI60/EI120, pare-balles FB4-FB7).
Tu es avant tout un assistant conversationnel et naturel. Si l'utilisateur te salue, te demande comment tu vas ou te dit "tu es là ?", réponds naturellement, brièvement et poliment, sans générer d'analyse de devis si cela n'est pas explicitement demandé ou pertinent.
Si l'utilisateur donne son prénom, son nom ou teste ta mémoire, réponds comme dans une conversation normale et utilise uniquement la mémoire courte de conversation. Ne reparle pas du devis dans ce cas.
Si le message est une conversation naturelle, ignore totalement les devis, tableaux, lignes et options qui pourraient apparaître dans l'historique ancien.
Quand il s'agit d'analyser des demandes clients ou de générer des devis (en t'appuyant sur le tarif NEXUS 2026-01), tu deviens précis et tu vérifies la cohérence des gammes, dimensions, options et équipements. Tu signales les alertes importantes.

MODE AGENT DE TABLEAU :
- Comporte-toi comme un assistant d'atelier intégré au tableau, pas comme un formulaire.
- Si la demande peut être comprise depuis le tableau, les pièces jointes ou la conversation, réponds directement et n'enchaîne pas les questions de clarification.
- Pose au maximum une question courte uniquement si une information bloquante manque vraiment.
- Pour une demande d'action, confirme l'action attendue ou appliquée en 1 à 3 phrases. Ne rédige pas de long préambule.
- Pour un audit ou une vérification de conformité, utilise les règles Qdrant pertinentes et les expériences terrain. Donne d'abord le verdict par ligne, puis les corrections/conseils.
- Pour les images/PDF/fichiers, commence par ce que tu vois ou lis dans la pièce jointe, puis relie-le au devis. Ne réponds pas uniquement avec les règles générales si une pièce jointe est présente.

FORMAT DE RÉPONSE :
- Réponds en Markdown GitHub clair : titres courts, listes, tableaux Markdown si plusieurs lignes ou montants doivent être comparés.
- N'enferme pas une réponse complète dans un bloc de code.
- Utilise les blocs de code uniquement pour du JSON, CSV ou une donnée brute explicitement demandée.
- Pour un devis complet, préfère un tableau Markdown avec les colonnes Ligne, Gamme, Dimensions, Total HT, Options, Alertes.
- Garde les montants et unités lisibles, sans paragraphes compacts.

CONVENTION DE LECTURE DES TABLEAUX DE PRIX (IMPORTANT) :
Les tableaux de prix fonctionnent par fourchettes de dimensions (hauteur HT en lignes, largeur HT en colonnes).
Convention PLANCHER (floor) : sélectionner le plus grand seuil ≤ à la dimension demandée.
Pour trouver le bon prix :
1. Prendre la PLUS GRANDE hauteur du tableau qui est <= à la hauteur demandée.
2. Prendre la PLUS GRANDE largeur du tableau qui est <= à la largeur demandée.
3. Lire le prix à l'intersection de cette ligne et cette colonne.
4. Si la dimension est inférieure à toutes les valeurs du tableau → hors catalogue.
5. Si la dimension dépasse toutes les valeurs du tableau → hors catalogue.
6. Si aucune entrée n'existe à cette intersection (—), signaler "hors catalogue, nous consulter".

Exemple : Pour un CR4 1V avec H=2100 mm et L=980 mm :
- Hauteurs du tableau : 2060, 2180, 2300, 2600 → plus grande <= 2100 = 2060
- Largeurs du tableau : 800, 960, 1415 → plus grande <= 980 = 960
- Prix = intersection (2060, 960) = 4 882 € HT

RÈGLE DE CROISEMENT DES RÉFÉRENTIELS (IMPORTANT) :
Pour chiffrer une porte correctement, tu dois TOUJOURS croiser plusieurs markdowns :
- GUIDE-DEVIS.md : la méthodologie globale de chiffrage (règles d'arrondi, logique de gamme, etc.)
- BASE.md : le catalogue de base (dimensions standards, serrures, ferme-portes communs)
- Le markdown de la GAMME détectée (CR3/CR4/CR5/CR6/FB6-7/EI60/EI120/PRISON/BLAST/ANTI-BELIER/EF2)
- EQUIP-COMMUN.md : les équipements communs (judas, œilletons, plinthes, poignées)
- EQUIP-EI.md : si option coupe-feu (EI30/EI60/EI120)
- EQUIP-FB.md : si option pare-balles (FB4/FB6/FB7)
- SEISME-AEV.md : si option anti-séisme ou AEV
- TABLEAUX-ADDITIONNELS.md : règles courtes issues des onglets additionnels du XLSX (séisme, AEV, Blast 0,5 t/m², bornes mini/maxi, pièces détachées)
- SERRURES-GARNITURES.md : TOUJOURS consulter pour connaître la serrure et les garnitures livrées par défaut avec chaque gamme. Ne jamais laisser serrure_ref vide sans avoir vérifié ce fichier.

RÈGLE CR2/RC2 :
Si une ligne est demandée ou affichée en CR2/RC2, elle doit utiliser le référentiel CR3 pour le chiffrage et les équipements, car la performance inférieure est chiffrée sur la performance supérieure la plus proche. Ne demande pas quelle ligne modifier quand le tableau fourni contient clairement les lignes concernées : réponds directement avec l'action ou le contrôle appliqué.

CAS HORS CATALOGUE — traitement manuel obligatoire (ne jamais générer de prix automatique) :
- "Chassis vitré" ou toute porte avec H < 1500 mm (1V) / H < 1890 mm (2V) : hors plage catalogue, dimensions incompatibles avec les tableaux standard. Indiquer clairement "nous consulter — devis sur mesure" et ne pas chiffrer de prix de base.
- L > max de la gamme + H < minimum : impossible à fabriquer en standard.
- Toute configuration signalée "hors catalogue" dans GUIDE-DEVIS.md section "Cas hors catalogue" doit déclencher une alerte explicite sans estimation de prix.

CONVENTION DE LECTURE DES TABLEAUX DE PRIX (CRITIQUE) :
- Utiliser TOUJOURS la convention PLANCHER (floor) : sélectionner le plus grand seuil ≤ à la dimension demandée.
  Ex : H=2100 dans [1890, 2180, 2300, 2600] → utiliser H=1890.
  Ex : L=980 dans [800, 960, 1150] → utiliser L=960.
- Si dimension < minimum du tableau → hors catalogue.
- Si dimension > maximum du tableau → hors catalogue (sauf avis de chantier).
- Pour CR4+EI60 ou CR3+EI60 : la table de base est la table de la GAMME ANTI-EFFRACTION (CR4, CR3…), l'EI60 est une option en plus-value.
- Pour CR5+EI30 ou CR5+EI60 : utiliser la table CR5EI60 (pas de table CR5EI30 séparée).
- CR6 2 vantaux : non disponible au catalogue standard — hors catalogue.

Si deux markdowns se contredisent, privilégie le markdown de la gamme principale. Signale la contradiction.
Les fichiers transverses (GUIDE-DEVIS, BASE, EQUIP-COMMUN) sont TOUJOURS chargés pour toi — consulte-les systématiquement.
${context ? `\n\nBase documentaire NEXUS 2026 mise à disposition (${loadedDocs.length} fichiers : ${loadedDocs.join(', ')}) :\n\n${context}` : ''}${mandatoryRulesBlock}${rulesBlock}${expBlock}${historyBlock}
Réponds en français de façon structurée et professionnelle, en Markdown lisible. Si une information manque ou est incohérente, indique-le clairement.`

  const systemMsg = casualMessage
    ? `${casualSystemMsg}${historyBlock}`
    : businessSystemMsg

  try {
    const model = await getGlobalOllamaModel()
    const documentContext = await analyzeAiDocuments(attachments, model)
    const userContent = (() => {
      const imageInstruction = attachments.length
        ? `Une ou plusieurs pieces jointes sont jointes a ce message ou reprises depuis le contexte recent de la conversation: ${attachments.map(item => `${item.name} (${item.type})`).join(', ')}. Elles font partie du contexte utilisateur au meme titre que le texte. Analyse-les et combine ce que tu vois/lis avec la question ecrite et, si present, avec le devis. Pour les PDF, utilise la synthese OCR/vision fournie ci-dessous. Si la question porte sur une image ou un PDF, reponds d'abord explicitement a ce que tu vois/lis dans la piece jointe. Si tu ne peux pas lire ou interpreter une piece jointe, dis-le clairement au lieu de repondre uniquement sur le contexte du devis.\n\n`
        : ''
      if (casualMessage || !rows.length) return `${imageInstruction}${safeQuestion}${documentContext}`

      if (scope === 'all' || rows.length > 1) {
        // Résumé synthétique du devis complet
        const summary = rows.map((r, i) => {
          const opts = (r.options || []).map(o => o.label).join(', ') || '—'
          const alts = (r.alertes || []).join(' | ') || '—'
          const dimensions = r.dimensions || `H${r.dim_standard?.h ?? '?'}×L${r.dim_standard?.l ?? '?'}`
          const price = r.prix_ht ?? r.prix_total_min_ht ?? r.prix_base_ht
          return `Ligne ${i + 1}: ${r.gamme || '?'} ${r.vantail || ''} — ${dimensions} — Total: ${price != null ? price + ' €' : '?'} HT — Options: ${opts} — Alertes: ${alts}`
        }).join('\n')
        return `${imageInstruction}Ensemble du devis (${rows.length} ligne${rows.length > 1 ? 's' : ''}) :\n\`\`\`\n${summary}\n\`\`\`\n\nQuestion / Message : ${safeQuestion}${documentContext}`
      }

      // Scope ligne unique
      return `${imageInstruction}Données de la ligne de devis en cours :\n\`\`\`json\n${JSON.stringify(rows[0], null, 2)}\n\`\`\`\n\nQuestion / Message : ${safeQuestion}${documentContext}`
    })()

    const userMessage = pastedImages.length
      ? {
        role: 'user',
        content: [
          { type: 'text', text: userContent },
          ...pastedImages.map(url => ({ type: 'image_url', image_url: { url } })),
        ],
      }
      : { role: 'user', content: userContent }
    const answer = await chatCompletion({
      model,
      messages: fitChatMessages([
        { role: 'system', content: systemMsg },
        userMessage,
      ]),
    })
    res.json({ answer })
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ── CRUD DEVIS (headers) ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/devis — list all devis for current user
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*,
              (SELECT COUNT(*) FROM devis_lines dl WHERE dl.devis_id = d.id) AS row_count,
              (SELECT COUNT(*) FROM devis_versions dv WHERE dv.devis_id = d.id) AS versions_count
       FROM devis d
       WHERE d.created_by = ?
       ORDER BY d.quote_number DESC, d.updated_at DESC, d.id DESC`,
      [req.user.id]
    )
    const enrichedRows = await Promise.all(rows.map(async (row) => {
      const versionNumber = await resolveDevisVersionNumber(row.id, row.current_version_id).catch(() => null)
      return {
        ...row,
        current_version_number: versionNumber,
        display_name: buildDevisDisplayName(row, versionNumber),
      }
    }))
    res.json(enrichedRows)
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// GET /api/devis/validation-knowledge — version de la base règles/expériences IA
router.get('/validation-knowledge', async (_req, res) => {
  try {
    const { getValidationKnowledgeVersion } = await import('../services/rules-validator.js')
    res.json(await getValidationKnowledgeVersion())
  } catch (err) {
    console.error('validation-knowledge error:', err)
    res.status(500).json({ error: 'Erreur version connaissance IA', details: err.message })
  }
})

// GET /api/devis/:id — single devis with lines
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM devis WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' })
    const devis = rows[0]
    const [lines] = await db.query(
      'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY FIELD(line_section, "products", "calculations", "transport"), position ASC, id ASC',
      [devis.id]
    )
    res.json({ ...devis, lines })
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// POST /api/devis — create a new devis
router.post('/', async (req, res) => {
  const { deal_id, company_id, client_name, name, source_file } = req.body
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const quoteNumber = await nextQuoteNumber(conn)
    const [result] = await conn.query(
      `INSERT INTO devis (quote_number, deal_id, company_id, client_name, name, source_file, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [quoteNumber, deal_id || null, company_id || null, client_name || null, name || 'Nouveau devis', source_file || null, req.user.id]
    )
    const [rows] = await conn.query('SELECT * FROM devis WHERE id = ?', [result.insertId])
    await conn.commit()
    res.status(201).json(rows[0])
  } catch (err) {
    await conn.rollback().catch(() => { })
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  } finally {
    conn.release()
  }
})

// PUT /api/devis/:id — update devis header
router.put('/:id', async (req, res) => {
  const allowed = ['deal_id', 'company_id', 'client_name', 'name', 'status', 'source_file', 'analysis_json', 'validation_json', 'total_ht', 'pdf_path', 'hubspot_note_id']
  const sets = []
  const vals = []
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`)
      vals.push(key.endsWith('_json') ? JSON.stringify(req.body[key]) : req.body[key])
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  vals.push(req.params.id)
  try {
    await db.query(`UPDATE devis SET ${sets.join(', ')} WHERE id = ?`, vals)
    const [rows] = await db.query('SELECT * FROM devis WHERE id = ?', [req.params.id])
    res.json(rows[0])
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// DELETE /api/devis/:id
router.delete('/:id', async (req, res) => {
  try {
    const devisId = Number(req.params.id)
    if (!Number.isInteger(devisId) || devisId < 1) return res.status(400).json({ error: 'ID invalide' })
    const [[devisRow]] = await db.query('SELECT id FROM devis WHERE id = ? AND created_by = ?', [devisId, req.user.id])
    if (!devisRow) return res.status(404).json({ error: 'Devis introuvable' })
    const [versionRows] = await db.query('SELECT id FROM devis_versions WHERE devis_id = ?', [devisId])
    const versionIds = versionRows.map(row => Number(row.id)).filter(Boolean)
    await db.query('DELETE FROM devis_ai_messages WHERE devis_id = ?', [devisId])
    if (versionIds.length) {
      const placeholders = versionIds.map(() => '?').join(',')
      await db.query(`DELETE FROM devis_version_comments WHERE version_id IN (${placeholders})`, versionIds)
      await db.query(`DELETE FROM devis_version_lines WHERE version_id IN (${placeholders})`, versionIds)
      await db.query(`DELETE FROM devis_versions WHERE id IN (${placeholders})`, versionIds)
    }
    await db.query('DELETE FROM devis_lines WHERE devis_id = ?', [devisId])
    await db.query('DELETE FROM devis WHERE id = ? AND created_by = ?', [devisId, req.user.id])
    res.json({ success: true })
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ── CRUD DEVIS LINES ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/devis/:id/lines
router.get('/:id/lines', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY FIELD(line_section, "products", "calculations", "transport"), position ASC, id ASC',
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/lines — add a line
router.post('/:id/lines', async (req, res) => {
  const d = req.body
  try {
    // Auto position = max+1
    const [maxPos] = await db.query(
      'SELECT COALESCE(MAX(position), -1) AS mp FROM devis_lines WHERE devis_id = ?',
      [req.params.id]
    )
    const pos = d.position ?? (maxPos[0].mp + 1)
    const [result] = await db.query(
      `INSERT INTO devis_lines
       (devis_id, position, line_section, designation, localisation, type_porte, gamme, vantail,
        hauteur_mm, largeur_mm, prix_base_ht, ref_base, raw_json, options_json,
        serrure_ref, serrure_prix, ferme_porte_ref, ferme_porte_prix,
        equipements_json, total_ligne_ht, alertes_json, docs_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, pos, normalizeLineSection(d.line_section),
        d.designation || null, d.localisation || null, d.type_porte || null, d.gamme || null, d.vantail || null,
        d.hauteur_mm || null, d.largeur_mm || null, d.prix_base_ht || null,
        d.ref_base || null,
        d.raw_json ? JSON.stringify(d.raw_json) : null,
        d.options_json ? JSON.stringify(d.options_json) : null,
        d.serrure_ref || null, d.serrure_prix || null,
        d.ferme_porte_ref || null, d.ferme_porte_prix || null,
        d.equipements_json ? JSON.stringify(d.equipements_json) : null,
        d.total_ligne_ht || null,
        d.alertes_json ? JSON.stringify(d.alertes_json) : null,
        d.docs_json ? JSON.stringify(d.docs_json) : null,
      ]
    )
    const [rows] = await db.query('SELECT * FROM devis_lines WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/lines/bulk — import multiple lines from analysis
router.post('/:id/lines/bulk', async (req, res) => {
  const { lines } = req.body
  if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines array required' })
  try {
    // Clear existing lines first
    await db.query('DELETE FROM devis_lines WHERE devis_id = ?', [req.params.id])
    if (!lines.length) {
      await db.query('UPDATE devis SET total_ht = ?, status = ? WHERE id = ?', [0, 'editing', req.params.id])
      return res.json([])
    }
    for (let i = 0; i < lines.length; i++) {
      const d = lines[i]
      const totalLigne = (d.prix_base_ht || 0) + (d.options?.reduce((s, o) => s + (o.prix || 0), 0) || 0) + (d.serrure_prix || 0) + (d.ferme_porte_prix || 0)
      const pricedTotal = d.total_ligne_ht ?? d.prix_total_min_ht ?? totalLigne
      const storedTotal = isBlockingUnpricedLine(d) ? null : (pricedTotal || null)
      await db.query(
        `INSERT INTO devis_lines
          (devis_id, position, line_section, designation, localisation, type_porte, gamme, vantail,
          hauteur_mm, largeur_mm, prix_base_ht, ref_base, raw_json, options_json,
          serrure_ref, serrure_prix, ferme_porte_ref, ferme_porte_prix,
          equipements_json, total_ligne_ht, alertes_json, docs_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id, i, normalizeLineSection(d.line_section),
          d.designation || d.type || null, d.localisation || null, d.type || null, d.gamme || null, d.vantail || null,
          d.haut_mm || d.hauteur_mm || null, d.larg_mm || d.largeur_mm || null,
          d.prix_base_ht || null,
          d.ref_base || null,
          d.raw_json || d._raw ? JSON.stringify(d.raw_json || d._raw) : null,
          d.options ? JSON.stringify(d.options) : null,
          d.serrure?.ref || null, null,
          d.ferme_porte?.ref || null, null,
          d.equip_extra ? JSON.stringify(d.equip_extra) : null,
          storedTotal,
          d.alertes ? JSON.stringify(d.alertes) : null,
          d.docs ? JSON.stringify(d.docs) : null,
        ]
      )
    }
    // Update devis total
    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_lines WHERE devis_id = ?',
      [req.params.id]
    )
    await db.query('UPDATE devis SET total_ht = ?, status = ? WHERE id = ?', [sumRows[0].total, 'editing', req.params.id])
    const [allLines] = await db.query('SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY FIELD(line_section, "products", "calculations", "transport"), position ASC, id ASC', [req.params.id])
    res.json(allLines)
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// PUT /api/devis/:id/lines/:lineId — update a line
router.put('/:id/lines/:lineId', async (req, res) => {
  const allowed = ['position', 'line_section', 'designation', 'localisation', 'type_porte', 'gamme', 'vantail', 'hauteur_mm', 'largeur_mm', 'prix_base_ht', 'ref_base', 'raw_json', 'options_json', 'serrure_ref', 'serrure_prix', 'ferme_porte_ref', 'ferme_porte_prix', 'equipements_json', 'total_ligne_ht', 'alertes_json', 'docs_json']
  const sets = []
  const vals = []
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`)
      vals.push(key === 'line_section' ? normalizeLineSection(req.body[key]) : (key.endsWith('_json') ? JSON.stringify(req.body[key]) : req.body[key]))
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  vals.push(req.params.lineId, req.params.id)
  try {
    await db.query(`UPDATE devis_lines SET ${sets.join(', ')} WHERE id = ? AND devis_id = ?`, vals)
    // Recalculate devis total
    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_lines WHERE devis_id = ?',
      [req.params.id]
    )
    await db.query('UPDATE devis SET total_ht = ? WHERE id = ?', [sumRows[0].total, req.params.id])
    const [rows] = await db.query('SELECT * FROM devis_lines WHERE id = ?', [req.params.lineId])
    res.json(rows[0])
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// DELETE /api/devis/:id/lines/:lineId
router.delete('/:id/lines/:lineId', async (req, res) => {
  try {
    await db.query('DELETE FROM devis_lines WHERE id = ? AND devis_id = ?', [req.params.lineId, req.params.id])
    // Recalculate devis total
    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_lines WHERE devis_id = ?',
      [req.params.id]
    )
    await db.query('UPDATE devis SET total_ht = ? WHERE id = ?', [sumRows[0].total, req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error("CRASH:", err); res.status(500).json({ error: err.message })
  }
})

// ── GET /api/devis/:id/pdf — generate Playwright PDF for a devis ───────────
router.get('/:id/pdf', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID invalide' })
  try {
    const [devisRows] = await db.query('SELECT * FROM devis WHERE id = ?', [id])
    if (!devisRows.length) return res.status(404).json({ error: 'Devis introuvable' })
    const devis = devisRows[0]

    const [lines] = await db.query(
      'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY FIELD(line_section, "products", "calculations", "transport"), position ASC, id ASC',
      [id]
    )
    const versionNumber = await resolveDevisVersionNumber(id, req.query.version_id || devis.current_version_id)
    const pdfFilename = buildDevisPdfFilename(devis, versionNumber)

    // Lazy-load PDF builder to avoid Playwright startup on every server boot
    const { buildDevisNexusPdf } = await import('../devis-pdf.js')
    const { buffer, filename } = await buildDevisNexusPdf({ devis: { ...devis, pdf_filename: pdfFilename }, lines })

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': attachmentDisposition(filename),
      'Content-Length': buffer.length,
    })
    res.end(buffer)
  } catch (err) {
    console.error('devis pdf generation error:', err)
    res.status(500).json({ error: 'Erreur génération PDF', details: err.message })
  }
})

// ── GET /api/devis/sample-pdf — preview PDF with demo data (no auth needed for dev) ──
router.get('/sample-pdf', async (req, res) => {
  try {
    const { buildDevisNexusPdf } = await import('../devis-pdf.js')
    const devis = {
      id: 0,
      name: 'DEMO-2026-00',
      deal_id: 'P26-DEMO-1B',
      client_name: 'CLIENT DÉMO — DEMO LOGISTICS SAS',
      total_ht: null,
      created_at: new Date().toISOString(),
    }
    const lines = [
      {
        position: 1,
        designation: 'NEXUS CR4 — 1 VANTAIL — H 2180 × L 960 MM',
        gamme: 'CR4',
        vantail: '1V',
        hauteur_mm: 2180,
        largeur_mm: 960,
        total_ligne_ht: 5962,
        options_json: JSON.stringify([]),
        serrure_ref: 'À définir — voir GUIDE-DEVIS.md',
      },
      {
        position: 2,
        designation: 'NEXUS CR6 — 1 VANTAIL — H 2300 × L 1150 MM',
        gamme: 'CR6',
        vantail: '1V',
        hauteur_mm: 2300,
        largeur_mm: 1150,
        total_ligne_ht: 25412,
        options_json: JSON.stringify([{ label: 'FB7', prix: 8000 }]),
        serrure_ref: 'À définir — voir CR6.md',
      },
    ]
    const { buffer, filename } = await buildDevisNexusPdf({ devis, lines })
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': buffer.length,
    })
    res.end(buffer)
  } catch (err) {
    console.error('sample pdf error:', err)
    res.status(500).json({ error: 'Erreur génération PDF démo', details: err.message })
  }
})

// ── POST /api/devis/:id/validate-rules ──────────────────────────────────────
// Audite chaque ligne du devis contre TOUTES les règles métier approuvées.
// Pour chaque (ligne, règle) → verdict { status, reason, fix } via Gemma 4.
router.post('/:id/validate-rules', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID invalide' })
  try {
    const { validateDevis } = await import('../services/rules-validator.js')
    const report = await validateDevis({ devisId: id })

    // Persister le rapport dans devis.validation_json (si la colonne existe)
    try {
      await db.query('UPDATE devis SET validation_json = ? WHERE id = ?', [JSON.stringify(report), id])
    } catch { /* colonne absente → ignorer, on retourne quand même le rapport */ }

    res.json(report)
  } catch (err) {
    console.error('validate-rules error:', err)
    res.status(500).json({ error: 'Erreur validation des règles', details: err.message })
  }
})

// ── POST /api/devis/:id/rule-checks ────────────────────────────────────────
// Persiste un bilan de validation IA produit par la grille progressive.
router.post('/:id/rule-checks', async (req, res) => {
  const id = Number(req.params.id)
  const versionId = Number(req.body?.version_id)
  const report = req.body?.report
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID invalide' })
  if (!Number.isInteger(versionId) || versionId < 1) return res.status(400).json({ error: 'version_id invalide' })
  if (!report || typeof report !== 'object') return res.status(400).json({ error: 'report requis' })
  try {
    const reportWithMeta = { ...report, devis_id: id, version_id: versionId }
    await db.query(
      `INSERT INTO devis_rule_checks (version_id, report_json, summary_json, created_by)
       VALUES (?, ?, ?, ?)`,
      [versionId, JSON.stringify(reportWithMeta), JSON.stringify(reportWithMeta.summary || null), req.user?.id || null]
    )
    try {
      await db.query('UPDATE devis SET validation_json = ? WHERE id = ?', [JSON.stringify(reportWithMeta), id])
    } catch { /* colonne absente → ignorer */ }
    res.status(201).json({ success: true })
  } catch (err) {
    console.error('rule-checks persist error:', err)
    res.status(500).json({ error: 'Erreur persistance bilan IA', details: err.message })
  }
})

async function runLimited(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const count = Math.min(Math.max(Number(limit) || 1, 1), items.length || 1)
  await Promise.all(Array.from({ length: count }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }))
  return results
}

// ── POST /api/devis/validate-lines ──────────────────────────────────────────
// Variante stateless : audit d'un tableau de lignes fourni dans le body
// (pratique juste après /analyze, avant persistance en DB).
// Body : { lines: [...] }
router.post('/validate-lines', async (req, res) => {
  const { lines } = req.body
  if (!Array.isArray(lines) || !lines.length) {
    return res.status(400).json({ error: 'lines array required' })
  }
  try {
    const { getValidationKnowledgeVersion, loadApprovedRules, validateLine } = await import('../services/rules-validator.js')
    const generatedAt = new Date().toISOString()
    const knowledge = await getValidationKnowledgeVersion()
    const rules = await loadApprovedRules()
    if (!rules.length) {
      return res.json({
        generated_at: generatedAt,
        rules_count: 0,
        knowledge,
        knowledge_version: knowledge.version,
        knowledge_updated_at: knowledge.updated_at,
        lines: lines.map((line, index) => ({
          position: line.position ?? index,
          designation: line.designation || line.type || null,
          gamme: line.gamme || null,
          vantail: line.vantail || null,
          verdicts: [],
        })),
        summary: { ok: 0, warning: 0, violation: 0, na: 0 },
      })
    }
    const model = await getGlobalOllamaModel()
    const concurrency = Math.min(Math.max(Number(req.body?.concurrency || 3) || 3, 1), 5)
    const results = await runLimited(lines, concurrency, async (l, i) => {
      // Adapter le format /analyze → format DB attendu par validateLine
      const lineLike = {
        id: l.id ?? null,
        position: l.position ?? i,
        designation: l.designation || l.type || null,
        localisation: l.localisation || null,
        type_porte: l.type || null,
        gamme: l.gamme || null,
        vantail: l.vantail || null,
        hauteur_mm: l.haut_mm || l.hauteur_mm || null,
        largeur_mm: l.larg_mm || l.largeur_mm || null,
        rc: l.rc || null,
        pb: l.pb || null,
        cf: l.cf || null,
        blast: l.blast || null,
        belier: l.belier || null,
        prison: l.prison || null,
        acoustic: l.acoustic || null,
        prix_base_ht: l.prix_base_ht ?? null,
        options_json: l.options ?? null,
        serrure_ref: l.serrure?.ref ?? null,
        ferme_porte_ref: l.ferme_porte?.ref ?? null,
        equipements_json: l.equip_extra ?? null,
        equipements_resolus: l.equipements_resolus ?? null,
        alertes_json: l.alertes ?? null,
        total_ligne_ht: l.prix_total_min_ht ?? null,
      }
      const verdicts = await validateLine({ line: lineLike, rules, model }).catch(() => [])
      return {
        position: lineLike.position,
        designation: lineLike.designation,
        gamme: lineLike.gamme,
        vantail: lineLike.vantail,
        verdicts,
      }
    })
    const summary = { ok: 0, warning: 0, violation: 0, na: 0 }
    for (const result of results) {
      for (const v of result?.verdicts || []) summary[v.status] = (summary[v.status] || 0) + 1
    }
    res.json({
      generated_at: generatedAt,
      rules_count: rules.length,
      knowledge,
      knowledge_version: knowledge.version,
      knowledge_updated_at: knowledge.updated_at,
      lines: results,
      summary,
    })
  } catch (err) {
    console.error('validate-lines error:', err)
    res.status(500).json({ error: 'Erreur validation', details: err.message })
  }
})

// ── POST /api/devis/save-as-rule ──────────────────────────────────────────
// Crée une expérience "Validations individuelles R&D" pré-remplie depuis une ligne de grille.
// Body: { title, content, category? }
// Tout utilisateur authentifié peut soumettre (status=pending, un admin valide ensuite).
router.post('/save-as-rule', async (req, res) => {
  const { title, content, category } = req.body
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: 'title et content requis' })
  }
  const cat = category?.trim() || 'Validations individuelles R&D'
  try {
    const [result] = await db.query(
      `INSERT INTO experiences (user_id, title, content, category, status, created_at) VALUES (?, ?, ?, ?, 'pending', NOW())`,
      [req.user.id, title.trim(), content.trim(), cat]
    )
    const [rows] = await db.query('SELECT * FROM experiences WHERE id = ?', [result.insertId])
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ── DEVIS VERSIONS ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/devis/:id/versions
// Returns { current_version_id, versions: [...] } each version includes its comments
router.get('/:id/versions', async (req, res) => {
  const devisId = Number(req.params.id)
  if (!Number.isInteger(devisId) || devisId < 1) return res.status(400).json({ error: 'ID invalide' })
  try {
    const [[devisRow]] = await db.query('SELECT id, current_version_id FROM devis WHERE id = ?', [devisId])
    if (!devisRow) return res.status(404).json({ error: 'Devis introuvable' })

    const [versions] = await db.query(
      `SELECT v.*,
              (SELECT COUNT(*) FROM devis_version_lines vl WHERE vl.version_id = v.id) AS row_count
       FROM devis_versions v
       WHERE v.devis_id = ?
       ORDER BY v.id ASC`,
      [devisId]
    )
    const [comments] = await db.query(
      `SELECT * FROM devis_version_comments
       WHERE version_id IN (SELECT id FROM devis_versions WHERE devis_id = ?)
       ORDER BY created_at ASC`,
      [devisId]
    )
    const commentsByVersion = {}
    for (const c of comments) {
      if (!commentsByVersion[c.version_id]) commentsByVersion[c.version_id] = []
      commentsByVersion[c.version_id].push(c)
    }

    // Auto-create a default version if none exist
    if (!versions.length) {
      const [vResult] = await db.query(
        `INSERT INTO devis_versions (devis_id, version_label, branch_label, title, status, created_by)
         VALUES (?, 'v1', 'main', 'Version de travail', 'editing', ?)`,
        [devisId, req.user.id]
      )
      await db.query('UPDATE devis SET current_version_id = ? WHERE id = ?', [vResult.insertId, devisId])
      const [[newVersion]] = await db.query('SELECT * FROM devis_versions WHERE id = ?', [vResult.insertId])
      return res.json({ current_version_id: vResult.insertId, versions: [{ ...newVersion, comments: [] }] })
    }

    const currentVersionId = devisRow.current_version_id || versions[0]?.id || null
    res.json({
      current_version_id: currentVersionId,
      versions: versions.map(v => ({ ...v, comments: commentsByVersion[v.id] || [] })),
    })
  } catch (err) {
    console.error('GET versions error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/versions
// Creates a new version (optionally copies lines from source_version_id or devis_lines)
// Body: { source_version_id?, parent_version_id?, branch_label?, title?, comment?, step_key? }
router.post('/:id/versions', async (req, res) => {
  const devisId = Number(req.params.id)
  if (!Number.isInteger(devisId) || devisId < 1) return res.status(400).json({ error: 'ID invalide' })
  const { source_version_id, parent_version_id, branch_label, title, comment, step_key } = req.body
  try {
    // Compute next version label
    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM devis_versions WHERE devis_id = ?', [devisId]
    )
    const versionLabel = `v${cnt + 1}`

    // Determine parent
    const parentId = Object.prototype.hasOwnProperty.call(req.body, 'parent_version_id')
      ? (parent_version_id ? Number(parent_version_id) : null)
      : (source_version_id ? Number(source_version_id) : null)

    const [vResult] = await db.query(
      `INSERT INTO devis_versions (devis_id, parent_version_id, version_label, branch_label, title, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'editing', ?)`,
      [devisId, parentId, versionLabel, branch_label || null, title || null, req.user.id]
    )
    const newVersionId = vResult.insertId

    // Copy lines from source version or from devis_lines
    if (source_version_id) {
      const [sourceLines] = await db.query(
        'SELECT * FROM devis_version_lines WHERE version_id = ?', [Number(source_version_id)]
      )
      for (const line of sourceLines) {
        await db.query(
          `INSERT INTO devis_version_lines (version_id, source_line_id, position, line_section, grid_json, designation_pdf, total_ligne_ht)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [newVersionId, line.source_line_id, line.position, line.line_section, line.grid_json, line.designation_pdf, line.total_ligne_ht]
        )
      }
    } else {
      // Copy from master devis_lines
      const [masterLines] = await db.query(
        'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY position ASC', [devisId]
      )
      for (const line of masterLines) {
        await db.query(
          `INSERT INTO devis_version_lines (version_id, source_line_id, position, line_section, grid_json, designation_pdf, total_ligne_ht)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [newVersionId, line.id, line.position, line.line_section,
            JSON.stringify({ ...line, options_json: line.options_json ? JSON.parse(line.options_json) : null }),
            line.designation, line.total_ligne_ht]
        )
      }
    }

    // Auto-add creation comment/checkpoint
    if (comment?.trim()) {
      await db.query(
        `INSERT INTO devis_version_comments (version_id, step_key, kind, content, created_by) VALUES (?, ?, 'checkpoint', ?, ?)`,
        [newVersionId, step_key || 'versions', comment.trim(), req.user.id]
      )
    }

    const [[newVersion]] = await db.query('SELECT * FROM devis_versions WHERE id = ?', [newVersionId])
    const [newComments] = await db.query('SELECT * FROM devis_version_comments WHERE version_id = ?', [newVersionId])
    res.status(201).json({ ...newVersion, comments: newComments })
  } catch (err) {
    console.error('POST versions error:', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/devis/:id/versions/:vId
// Deletes the target version and all descendant versions.
router.delete('/:id/versions/:vId', async (req, res) => {
  const devisId = Number(req.params.id)
  const versionId = Number(req.params.vId)
  if (!Number.isInteger(devisId) || devisId < 1 || !Number.isInteger(versionId) || versionId < 1) {
    return res.status(400).json({ error: 'ID invalide' })
  }
  try {
    const [versions] = await db.query(
      'SELECT id, parent_version_id FROM devis_versions WHERE devis_id = ? ORDER BY id ASC',
      [devisId]
    )
    if (!versions.some(version => Number(version.id) === versionId)) {
      return res.status(404).json({ error: 'Version introuvable' })
    }

    const childrenByParent = new Map()
    for (const version of versions) {
      const key = Number(version.parent_version_id || 0)
      const list = childrenByParent.get(key) || []
      list.push(Number(version.id))
      childrenByParent.set(key, list)
    }
    const idsToDelete = []
    const collect = (id) => {
      idsToDelete.push(id)
      for (const childId of childrenByParent.get(id) || []) collect(childId)
    }
    collect(versionId)

    const remainingIds = versions
      .map(version => Number(version.id))
      .filter(id => !idsToDelete.includes(id))
    if (!remainingIds.length) {
      return res.status(400).json({ error: 'Impossible de supprimer toutes les versions du devis' })
    }

    const placeholders = idsToDelete.map(() => '?').join(',')
    await db.query(`DELETE FROM devis_version_comments WHERE version_id IN (${placeholders})`, idsToDelete)
    await db.query(`DELETE FROM devis_version_lines WHERE version_id IN (${placeholders})`, idsToDelete)
    await db.query(`DELETE FROM devis_versions WHERE id IN (${placeholders}) AND devis_id = ?`, [...idsToDelete, devisId])

    const [[devisRow]] = await db.query('SELECT current_version_id FROM devis WHERE id = ?', [devisId])
    const storedCurrentVersionId = Number(devisRow?.current_version_id || 0)
    const needsNewCurrent = !storedCurrentVersionId || idsToDelete.includes(storedCurrentVersionId)
    const nextCurrentVersionId = needsNewCurrent ? remainingIds[0] : storedCurrentVersionId
    if (needsNewCurrent) {
      await db.query('UPDATE devis SET current_version_id = ? WHERE id = ?', [nextCurrentVersionId, devisId])
    }

    res.json({ success: true, deleted_version_ids: idsToDelete, current_version_id: nextCurrentVersionId })
  } catch (err) {
    console.error('DELETE version error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/versions/:vId/activate
router.post('/:id/versions/:vId/activate', async (req, res) => {
  const devisId = Number(req.params.id)
  const vId = Number(req.params.vId)
  if (!Number.isInteger(devisId) || !Number.isInteger(vId)) return res.status(400).json({ error: 'ID invalide' })
  try {
    const [[version]] = await db.query('SELECT id FROM devis_versions WHERE id = ? AND devis_id = ?', [vId, devisId])
    if (!version) return res.status(404).json({ error: 'Version introuvable' })
    await db.query('UPDATE devis SET current_version_id = ? WHERE id = ?', [vId, devisId])
    res.json({ success: true, current_version_id: vId })
  } catch (err) {
    console.error('activate version error:', err)
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/devis/:id/versions/:vId — update title / status
router.patch('/:id/versions/:vId', async (req, res) => {
  const devisId = Number(req.params.id)
  const vId = Number(req.params.vId)
  if (!Number.isInteger(devisId) || !Number.isInteger(vId)) return res.status(400).json({ error: 'ID invalide' })
  const allowed = ['title', 'branch_label', 'status']
  const sets = []
  const vals = []
  for (const key of allowed) {
    if (req.body[key] !== undefined) { sets.push(`${key} = ?`); vals.push(req.body[key]) }
  }
  if (!sets.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  vals.push(vId, devisId)
  try {
    await db.query(`UPDATE devis_versions SET ${sets.join(', ')} WHERE id = ? AND devis_id = ?`, vals)
    const [[row]] = await db.query('SELECT * FROM devis_versions WHERE id = ?', [vId])
    res.json(row)
  } catch (err) {
    console.error('PATCH version error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/versions/:vId/comments
router.post('/:id/versions/:vId/comments', async (req, res) => {
  const vId = Number(req.params.vId)
  const { content, step_key, kind } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'content requis' })
  try {
    const [result] = await db.query(
      `INSERT INTO devis_version_comments (version_id, step_key, kind, content, created_by) VALUES (?, ?, ?, ?, ?)`,
      [vId, step_key || null, kind || 'comment', content.trim(), req.user.id]
    )
    const [[row]] = await db.query('SELECT * FROM devis_version_comments WHERE id = ?', [result.insertId])
    res.status(201).json(row)
  } catch (err) {
    console.error('POST comment error:', err)
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/devis/:id/versions/:vId/comments/:cId
router.patch('/:id/versions/:vId/comments/:cId', async (req, res) => {
  const { cId } = req.params
  const { content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'content requis' })
  try {
    await db.query('UPDATE devis_version_comments SET content = ? WHERE id = ?', [content.trim(), cId])
    const [[row]] = await db.query('SELECT * FROM devis_version_comments WHERE id = ?', [cId])
    res.json(row)
  } catch (err) {
    console.error('PATCH comment error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/devis/:id/versions/:vId/checkpoint
// Body: { comment?, step_key?, status? }
router.post('/:id/versions/:vId/checkpoint', async (req, res) => {
  const devisId = Number(req.params.id)
  const vId = Number(req.params.vId)
  const { comment, step_key, status } = req.body
  try {
    // Optionally update version status
    if (status) {
      await db.query('UPDATE devis_versions SET status = ? WHERE id = ? AND devis_id = ?', [status, vId, devisId])
    }
    const content = comment?.trim() || `Checkpoint — ${new Date().toLocaleString('fr-FR')}`
    const [result] = await db.query(
      `INSERT INTO devis_version_comments (version_id, step_key, kind, content, created_by) VALUES (?, ?, 'checkpoint', ?, ?)`,
      [vId, step_key || null, content, req.user.id]
    )
    const [[row]] = await db.query('SELECT * FROM devis_version_comments WHERE id = ?', [result.insertId])
    res.status(201).json(row)
  } catch (err) {
    console.error('checkpoint error:', err)
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/devis/:id/versions/:vId/pdf-labels
// Body: { labels: [{ line_id, position, line_section, designation_pdf }], comment? }
router.put('/:id/versions/:vId/pdf-labels', async (req, res) => {
  const devisId = Number(req.params.id)
  const vId = Number(req.params.vId)
  const { labels, comment } = req.body
  if (!Array.isArray(labels)) return res.status(400).json({ error: 'labels array requis' })
  try {
    for (const label of labels) {
      if (!label.line_id) continue
      // Upsert into devis_version_lines
      const [existing] = await db.query(
        'SELECT id FROM devis_version_lines WHERE version_id = ? AND source_line_id = ?',
        [vId, label.line_id]
      )
      if (existing.length) {
        await db.query(
          'UPDATE devis_version_lines SET designation_pdf = ? WHERE version_id = ? AND source_line_id = ?',
          [label.designation_pdf || null, vId, label.line_id]
        )
      } else {
        await db.query(
          `INSERT INTO devis_version_lines (version_id, source_line_id, position, line_section, grid_json, designation_pdf)
           VALUES (?, ?, ?, ?, '{}', ?)`,
          [vId, label.line_id, label.position ?? 0, label.line_section || 'products', label.designation_pdf || null]
        )
      }
      // Also update master devis_lines.designation for immediate reflect
      await db.query(
        'UPDATE devis_lines SET designation = ? WHERE id = ? AND devis_id = ?',
        [label.designation_pdf || null, label.line_id, devisId]
      )
    }
    if (comment?.trim()) {
      await db.query(
        `INSERT INTO devis_version_comments (version_id, step_key, kind, content, created_by) VALUES (?, 'pdf', 'pdf', ?, ?)`,
        [vId, comment.trim(), req.user.id]
      )
    }
    // Return updated lines
    const [lines] = await db.query(
      'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY FIELD(line_section, "products", "calculations", "transport"), position ASC, id ASC',
      [devisId]
    )
    res.json({ success: true, lines })
  } catch (err) {
    console.error('pdf-labels error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/devis/:id/send-hubspot — génère le PDF et l'envoie sur l'affaire HubSpot ──
router.post('/:id/send-hubspot', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID invalide' })
  const { deal_id, note_body, version_id } = req.body || {}
  try {
    const [rows] = await db.query('SELECT * FROM devis WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' })
    const devis = rows[0]
    const targetDealId = deal_id || devis.deal_id
    if (!targetDealId) return res.status(400).json({ error: 'deal_id requis (aucun deal lié à ce devis)' })

    // Resolve active version info for filename enrichment
    const targetVersionId = version_id || devis.current_version_id || null
    let versionRow = null
    let versionComment = null
    if (targetVersionId) {
      const [[v]] = await db.query('SELECT * FROM devis_versions WHERE id = ? AND devis_id = ?', [targetVersionId, id])
      versionRow = v || null
      if (versionRow) {
        const [[commentRow]] = await db.query(
          `SELECT content FROM devis_version_comments
           WHERE version_id = ? AND kind = 'comment' AND TRIM(content) <> ''
           ORDER BY created_at DESC, id DESC LIMIT 1`,
          [versionRow.id]
        )
        versionComment = commentRow?.content?.trim() || null
      }
    }

    const [lines] = await db.query(
      'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY FIELD(line_section,"products","calculations","transport"), position ASC, id ASC',
      [id]
    )

    const { buildDevisNexusPdf } = await import('../devis-pdf.js')
    const versionNumber = await resolveDevisVersionNumber(id, targetVersionId)
    const versionLabel = versionNumber ? `v${versionNumber}` : (versionRow?.version_label || null)
    const enrichedDevis = { ...devis, pdf_filename: buildDevisPdfFilename(devis, versionNumber) }
    const { buffer, filename } = await buildDevisNexusPdf({ devis: enrichedDevis, lines })

    const { uploadPdfToDeal, updateDeal, isHubspotConfigured } = await import('../services/hubspot.js')
    if (!isHubspotConfigured()) {
      return res.status(503).json({ error: 'HubSpot non configuré (HUBSPOT_PRIVATE_APP_TOKEN manquant)' })
    }

    let hubspotAmount = null
    if (versionRow) {
      const [[versionTotal]] = await db.query(
        'SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_version_lines WHERE version_id = ?',
        [versionRow.id]
      )
      hubspotAmount = Number(versionTotal?.total || 0)
    }
    if (!(hubspotAmount > 0)) {
      const [[devisTotal]] = await db.query(
        'SELECT COALESCE(SUM(total_ligne_ht), 0) AS total FROM devis_lines WHERE devis_id = ?',
        [id]
      )
      hubspotAmount = Number(devisTotal?.total || devis.total_ht || 0)
    }
    if (hubspotAmount > 0) {
      await updateDeal(targetDealId, { amount: hubspotAmount })
    }

    const body = note_body
      || [
        `Devis NEXUS — ${buildDevisDisplayName(devis, versionNumber)}`,
        versionComment ? `Commentaire version : ${versionComment}` : null,
      ].filter(Boolean).join('\n')
    const result = await uploadPdfToDeal({ buffer, filename, dealId: targetDealId, noteBody: body })

    // Update version row if available
    if (versionRow) {
      await db.query(
        'UPDATE devis_versions SET hubspot_note_id = ?, hubspot_file_id = ?, status = ? WHERE id = ?',
        [result.noteId, result.fileId, 'sent_hubspot', versionRow.id]
      )
    }
    await db.query(
      'UPDATE devis SET hubspot_note_id = ?, status = ? WHERE id = ?',
      [result.noteId, 'sent_hubspot', id]
    )

    res.json({ ...result, filename, amount: hubspotAmount > 0 ? hubspotAmount : null, version_id: versionRow?.id || null, version_label: versionLabel, version_comment: versionComment })
  } catch (err) {
    if (err.code === 'NO_TOKEN') return res.status(503).json({ error: err.message })
    console.error('[devis] send-hubspot error:', err)
    res.status(err.status >= 400 && err.status < 600 ? err.status : 500).json({
      error: err.message || 'Erreur envoi HubSpot',
    })
  }
})

export default router
