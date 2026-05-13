/**
 * Moteur de validation des règles métier sur un devis.
 *
 * Pour chaque ligne du devis, Gemma 4 sélectionne uniquement les règles
 * ou expériences pertinentes et produit des verdicts structurés JSON :
 *   { rule_id, status: 'ok'|'warning'|'violation'|'na', reason, fix? }
 *
 * Une seule requête Gemma par ligne. Les règles non applicables ne sont pas
 * renvoyées afin d'éviter le bruit dans l'analyse row par row.
 */

import db from '../db/index.js'
import { chatCompletion } from './ollama.js'
import { getGlobalOllamaModel } from './appSettings.js'
import crypto from 'crypto'

const VALIDATION_EXPERIENCE_CATEGORIES = ['Règle métier', 'Chiffrage', 'Validations individuelles R&D']

function ruleSourceMeta(rule) {
  if (!rule || rule.source === 'validation') {
    return {
      source: 'validation',
      source_id: null,
      source_label: 'Analyse IA',
      category: null,
      severity: null,
      source_type: null,
      source_ref: null,
      source_excerpt: null,
    }
  }
  const isExperience = rule.source === 'experience'
  return {
    source: isExperience ? 'experience' : 'devis_rule',
    source_id: rule.source_id ?? rule.id,
    source_label: isExperience ? 'Expérience approuvée' : 'Règle active',
    category: rule.category || null,
    severity: rule.severity || null,
    source_type: rule.source_type || (isExperience ? 'experience' : null),
    source_ref: rule.source_ref || null,
    source_excerpt: String(rule.content || '').trim().slice(0, 240) || null,
  }
}

/** Récupère toutes les règles métier approuvées en DB. */
export async function loadApprovedRules() {
  const [ruleRows] = await db.query(
    `SELECT id, rule_code, title, content, category, severity, source_type, source_ref
       FROM devis_rules
      WHERE status = 'active'
      ORDER BY rule_code ASC, id ASC`
  )
  const [experienceRows] = await db.query(
    `SELECT id, title, content, category
       FROM experiences
      WHERE status = 'approved'
        AND category IN ('Règle métier', 'Chiffrage', 'Validations individuelles R&D')
      ORDER BY id ASC`
  )
  return [
    ...ruleRows.map(row => ({ ...row, source: 'devis_rules' })),
    ...experienceRows.map(row => ({ ...row, id: 1000000 + row.id, source: 'experience', source_id: row.id })),
  ]
}

function toIso(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

/** Version courte de la base utilisée par les validations IA. */
export async function getValidationKnowledgeVersion() {
  const [ruleRows] = await db.query(
    `SELECT id, rule_code, title, content, category, severity, updated_at
       FROM devis_rules
      WHERE status = 'active'
      ORDER BY id ASC`
  )
  const [experienceRows] = await db.query(
    `SELECT id, title, content, category, updated_at
       FROM experiences
      WHERE status = 'approved'
        AND category IN ('Règle métier', 'Chiffrage', 'Validations individuelles R&D')
      ORDER BY id ASC`
  )
  const updatedAt = [...ruleRows, ...experienceRows]
    .map(row => toIso(row.updated_at))
    .filter(Boolean)
    .sort()
    .at(-1) || null
  const fingerprint = crypto
    .createHash('sha1')
    .update(JSON.stringify({
      rules: ruleRows.map(row => ({ ...row, updated_at: toIso(row.updated_at) })),
      experiences: experienceRows.map(row => ({ ...row, updated_at: toIso(row.updated_at) })),
    }))
    .digest('hex')
    .slice(0, 16)

  return {
    version: `${updatedAt || 'empty'}:${ruleRows.length}:${experienceRows.length}:${fingerprint}`,
    updated_at: updatedAt,
    rules_count: ruleRows.length + experienceRows.length,
    active_rules_count: ruleRows.length,
    approved_experiences_count: experienceRows.length,
    categories: VALIDATION_EXPERIENCE_CATEGORIES,
  }
}

/** Construit le prompt de validation pour une ligne de devis. */
function buildPrompt(line, rules) {
  const rulesList = rules
    .map((r, i) => {
      const source = ruleSourceMeta(r)
      return `Source ${i + 1}
ID_SOURCE: ${r.id}
CODE: ${r.rule_code || ''}
TITRE: "${r.title}"
Source: ${source.source_label}${source.category ? ` · ${source.category}` : ''}${source.severity ? ` · ${source.severity}` : ''}
${r.content}`
    })
    .join('\n\n---\n\n')

  const lineSummary = {
    designation: line.designation,
    type_porte: line.type_porte,
    gamme: line.gamme,
    vantail: line.vantail,
    hauteur_mm: line.hauteur_mm,
    largeur_mm: line.largeur_mm,
    performances: {
      rc: line.rc,
      pb: line.pb,
      cf: line.cf,
      blast: line.blast,
      belier: line.belier,
      prison: line.prison,
      acoustic: line.acoustic,
    },
    prix_base_ht: line.prix_base_ht,
    ref_base: line.ref_base,
    options: safeJson(line.options_json),
    serrure_ref: line.serrure_ref,
    ferme_porte_ref: line.ferme_porte_ref,
    equipements: safeJson(line.equipements_json),
    equipements_resolus: safeJson(line.equipements_resolus),
    alertes: safeJson(line.alertes_json),
    total_ligne_ht: line.total_ligne_ht,
  }

  const system =
    "Tu es un auditeur qualité NEXUS. Tu reçois une ligne de devis et une liste de règles métier. " +
    "Tu dois sélectionner UNIQUEMENT les règles ou expériences réellement pertinentes pour CETTE ligne. " +
    "Ne renvoie jamais les sources hors sujet ou non applicables. " +
    "Réponds UNIQUEMENT par un JSON valide, sans texte autour, au format strict :\n" +
    `{ "verdicts": [ { "rule_id": <ID_SOURCE int>, "rule_code": "R001", "rule_title": "<titre>", "status": "ok"|"warning"|"violation", "reason": "<phrase courte>", "fix": "<correctif suggéré ou null>" } ] }\n\n` +
    "Si aucune règle ou expérience ne s'applique directement à cette ligne, renvoie exactement : { \"verdicts\": [] }.\n\n" +
    "Critère de pertinence : la source doit concerner explicitement au moins un élément présent dans la ligne (type, gamme, vantail, dimension, performance, équipement, prix, référence, alerte, validation R&D exacte). " +
    "Une règle générale n'est pertinente que si elle permet de confirmer ou détecter quelque chose sur cette ligne précise. " +
    "Ne mets pas warning par prudence : si ce n'est pas clairement applicable, omets la source. " +
    "Retourne au maximum 8 verdicts, les plus importants.\n\n" +
    "Statuts :\n" +
    "- 'ok'         : la ligne respecte clairement la règle\n" +
    "- 'warning'    : la ligne pourrait poser problème, à vérifier manuellement\n" +
    "- 'violation'  : la ligne ne respecte pas la règle (à corriger)\n\n" +
    "Sois concis (reason et fix < 200 caractères chacun)."

  const user =
    `LIGNE DE DEVIS À AUDITER :\n` +
    "```json\n" + JSON.stringify(lineSummary, null, 2) + "\n```\n\n" +
    `BASE DE RÈGLES / EXPÉRIENCES DISPONIBLE (${rules.length}) :\n\n${rulesList}\n\n` +
    `Renvoie seulement les verdicts pertinents pour cette ligne.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

function safeJson(s) {
  if (s == null) return null
  if (typeof s === 'object') return s
  try { return JSON.parse(s) } catch { return s }
}

/** Extrait le JSON d'une réponse (gère les ```json ... ``` éventuels). */
function extractJson(text) {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end >= 0) {
    try { return JSON.parse(candidate.slice(start, end + 1)) } catch { /* try array fallback below */ }
  }
  const arrayStart = candidate.indexOf('[')
  const arrayEnd = candidate.lastIndexOf(']')
  if (arrayStart >= 0 && arrayEnd >= 0) {
    try {
      const arr = JSON.parse(candidate.slice(arrayStart, arrayEnd + 1))
      if (Array.isArray(arr)) return { verdicts: arr }
    } catch { /* noop */ }
  }
  if (/aucune|pas\s+de\s+r[èe]gle|not\s+applicable|non\s+applicable/i.test(candidate)) return { verdicts: [] }
  return null
}

function buildRepairPrompt(rawText) {
  const raw = String(rawText || '').slice(0, 6000)
  return [
    {
      role: 'system',
      content:
        'Tu convertis une réponse d audit en JSON strict. Réponds uniquement par un objet JSON valide au format {"verdicts":[]} ou {"verdicts":[...]}.' +
        ' Ne crée aucune nouvelle règle. Si la réponse ne contient pas de verdict clair, renvoie {"verdicts":[]}.',
    },
    {
      role: 'user',
      content: `Réponse à convertir en JSON strict :\n\n${raw}`,
    },
  ]
}

function validationSystemVerdict(reason) {
  return {
    rule_id: null,
    rule_code: null,
    rule_title: 'Analyse IA de la ligne',
    ...ruleSourceMeta({ source: 'validation' }),
    status: 'warning',
    reason: String(reason || 'Analyse IA non exploitable').slice(0, 400),
    fix: 'Relancer l’analyse IA ou vérifier la configuration du modèle.',
  }
}

function normalizeVerdicts(verdicts, rules) {
  const byId = new Map(rules.map(rule => [Number(rule.id), rule]))
  const byCode = new Map(rules.filter(rule => rule.rule_code).map(rule => [String(rule.rule_code).toUpperCase(), rule]))
  const byTitle = new Map(rules.map(rule => [String(rule.title || '').trim().toLowerCase(), rule]).filter(([title]) => title))
  const normalized = []
  const seen = new Set()

  for (const raw of verdicts.slice(0, 12)) {
    const status = ['ok', 'warning', 'violation'].includes(raw?.status) ? raw.status : null
    if (!status) continue

    const rawId = Number(raw.rule_id)
    let rule = Number.isFinite(rawId) ? byId.get(rawId) : null
    if (!rule && Number.isInteger(rawId) && rawId >= 1 && rawId <= rules.length) rule = rules[rawId - 1]
    if (!rule && raw?.rule_code) rule = byCode.get(String(raw.rule_code).toUpperCase())
    if (!rule && raw?.rule_title) rule = byTitle.get(String(raw.rule_title).trim().toLowerCase())
    if (!rule) continue

    const key = String(rule.id)
    if (seen.has(key)) continue
    seen.add(key)

    normalized.push({
      rule_id: rule.id,
      rule_code: rule.rule_code || null,
      rule_title: rule.title,
      ...ruleSourceMeta(rule),
      status,
      reason: typeof raw.reason === 'string' && raw.reason.trim()
        ? raw.reason.trim().slice(0, 400)
        : (status === 'ok' ? 'Source pertinente, ligne conforme.' : 'Point à vérifier sur cette ligne.'),
      fix: typeof raw.fix === 'string' && raw.fix.trim() ? raw.fix.trim().slice(0, 400) : null,
    })
  }

  return normalized
}

/** Valide une ligne et retourne uniquement les verdicts pertinents. */
export async function validateLine({ line, rules, model }) {
  if (!rules.length) return []
  const messages = buildPrompt(line, rules)
  let raw
  try {
    try {
      raw = await chatCompletion({
        model,
        messages,
        responseFormat: { type: 'json_object' },
        temperature: 0.0,
        maxTokens: 1200,
      })
    } catch {
      // Fallback sans response_format si le modèle ne le supporte pas
      raw = await chatCompletion({ model, messages, temperature: 0.0, maxTokens: 1200 })
    }
  } catch (err) {
    return [validationSystemVerdict(`Erreur IA : ${err.message || err}`)]
  }
  const parsed = extractJson(raw)
  let repaired = parsed
  if (!repaired || !Array.isArray(repaired.verdicts)) {
    try {
      const repairedRaw = await chatCompletion({
        model,
        messages: buildRepairPrompt(raw),
        responseFormat: { type: 'json_object' },
        temperature: 0.0,
        maxTokens: 500,
      })
      repaired = extractJson(repairedRaw)
    } catch { /* keep fallback below */ }
  }
  if (!repaired || !Array.isArray(repaired.verdicts)) {
    return [validationSystemVerdict('Réponse IA non exploitable pour cette ligne.')]
  }
  return normalizeVerdicts(repaired.verdicts, rules)
}

/** Valide toutes les lignes d'un devis. Retourne le rapport complet. */
export async function validateDevis({ devisId }) {
  const [devisRows] = await db.query('SELECT * FROM devis WHERE id = ?', [devisId])
  if (!devisRows.length) throw new Error('Devis introuvable')

  const [lines] = await db.query(
    'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY position ASC',
    [devisId]
  )
  const rules = await loadApprovedRules()
  const knowledge = await getValidationKnowledgeVersion()
  if (!rules.length) {
    return {
      devis_id: devisId,
      generated_at: new Date().toISOString(),
      rules_count: 0,
      knowledge,
      knowledge_version: knowledge.version,
      knowledge_updated_at: knowledge.updated_at,
      lines: [],
      summary: { ok: 0, warning: 0, violation: 0, na: 0 },
    }
  }

  const model = await getGlobalOllamaModel()

  const results = []
  const summary = { ok: 0, warning: 0, violation: 0, na: 0 }

  // Validation séquentielle (vLLM mono-instance, évite la saturation)
  for (const line of lines) {
    const verdicts = await validateLine({ line, rules, model }).catch((err) => {
      console.error(`validateLine error (line ${line.id}):`, err.message)
      return [validationSystemVerdict(`Erreur IA : ${err.message}`)]
    })
    for (const v of verdicts) summary[v.status] = (summary[v.status] || 0) + 1
    results.push({
      line_id: line.id,
      position: line.position,
      designation: line.designation,
      gamme: line.gamme,
      vantail: line.vantail,
      verdicts,
    })
  }

  return {
    devis_id: devisId,
    generated_at: new Date().toISOString(),
    rules_count: rules.length,
    knowledge,
    knowledge_version: knowledge.version,
    knowledge_updated_at: knowledge.updated_at,
    lines: results,
    summary,
  }
}
