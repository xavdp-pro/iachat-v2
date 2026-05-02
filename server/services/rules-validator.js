/**
 * Moteur de validation des règles métier sur un devis.
 *
 * Pour chaque ligne du devis × chaque règle métier approuvée,
 * Gemma 4 produit un verdict structuré JSON :
 *   { rule_id, status: 'ok'|'warning'|'violation'|'na', reason, fix? }
 *
 * Une seule requête Gemma par ligne (toutes les règles ensemble en JSON).
 */

import db from '../db/index.js'
import { chatCompletion } from './ollama.js'
import { getGlobalOllamaModel } from './appSettings.js'

/** Récupère toutes les règles métier approuvées en DB. */
export async function loadApprovedRules() {
  const [rows] = await db.query(
    `SELECT id, title, content, category
       FROM experiences
      WHERE status = 'approved'
        AND category IN ('Règle métier', 'Chiffrage')
      ORDER BY id ASC`
  )
  return rows
}

/** Construit le prompt de validation pour une ligne de devis. */
function buildPrompt(line, rules) {
  const rulesList = rules
    .map((r, i) => `Règle ${i + 1} (id=${r.id}) — "${r.title}":\n${r.content}`)
    .join('\n\n---\n\n')

  const lineSummary = {
    designation: line.designation,
    type_porte: line.type_porte,
    gamme: line.gamme,
    vantail: line.vantail,
    hauteur_mm: line.hauteur_mm,
    largeur_mm: line.largeur_mm,
    prix_base_ht: line.prix_base_ht,
    ref_base: line.ref_base,
    options: safeJson(line.options_json),
    serrure_ref: line.serrure_ref,
    ferme_porte_ref: line.ferme_porte_ref,
    equipements: safeJson(line.equipements_json),
    alertes: safeJson(line.alertes_json),
    total_ligne_ht: line.total_ligne_ht,
  }

  const system =
    "Tu es un auditeur qualité NEXUS. Tu reçois une ligne de devis et une liste de règles métier. " +
    "Pour CHAQUE règle, tu dois indiquer si la ligne est conforme. " +
    "Réponds UNIQUEMENT par un JSON valide, sans texte autour, au format strict :\n" +
    `{ "verdicts": [ { "rule_id": <int>, "rule_title": "<titre>", "status": "ok"|"warning"|"violation"|"na", "reason": "<phrase courte>", "fix": "<correctif suggéré ou null>" } ] }\n\n` +
    "Statuts :\n" +
    "- 'ok'         : la ligne respecte clairement la règle\n" +
    "- 'warning'    : la ligne pourrait poser problème, à vérifier manuellement\n" +
    "- 'violation'  : la ligne ne respecte pas la règle (à corriger)\n" +
    "- 'na'         : la règle ne s'applique pas à cette ligne\n\n" +
    "Sois concis (reason et fix < 200 caractères chacun)."

  const user =
    `LIGNE DE DEVIS À AUDITER :\n` +
    "```json\n" + JSON.stringify(lineSummary, null, 2) + "\n```\n\n" +
    `RÈGLES À VÉRIFIER (${rules.length}) :\n\n${rulesList}\n\n` +
    `Renvoie le JSON des verdicts.`

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
  if (start < 0 || end < 0) return null
  try { return JSON.parse(candidate.slice(start, end + 1)) } catch { return null }
}

/** Valide une ligne contre toutes les règles. Retourne un tableau de verdicts. */
export async function validateLine({ line, rules, model }) {
  if (!rules.length) return []
  const messages = buildPrompt(line, rules)
  let raw
  try {
    raw = await chatCompletion({
      model,
      messages,
      responseFormat: { type: 'json_object' },
      temperature: 0.0,
      maxTokens: 1500,
    })
  } catch (err) {
    // Fallback sans response_format si le modèle ne le supporte pas
    raw = await chatCompletion({ model, messages, temperature: 0.0, maxTokens: 1500 })
  }
  const parsed = extractJson(raw)
  const verdicts = Array.isArray(parsed?.verdicts) ? parsed.verdicts : []

  // Compléter / nettoyer les verdicts (s'assurer qu'on a une entrée par règle)
  const byId = new Map(verdicts.map(v => [Number(v.rule_id), v]))
  return rules.map((r) => {
    const v = byId.get(r.id) || {}
    const status = ['ok', 'warning', 'violation', 'na'].includes(v.status) ? v.status : 'warning'
    return {
      rule_id: r.id,
      rule_title: r.title,
      status,
      reason: typeof v.reason === 'string' ? v.reason.slice(0, 400) : '',
      fix: typeof v.fix === 'string' ? v.fix.slice(0, 400) : null,
    }
  })
}

/** Valide toutes les lignes d'un devis. Retourne le rapport complet. */
export async function validateDevis({ devisId }) {
  const [devisRows] = await db.query('SELECT * FROM devis WHERE id = ?', [devisId])
  if (!devisRows.length) throw new Error('Devis introuvable')
  const devis = devisRows[0]

  const [lines] = await db.query(
    'SELECT * FROM devis_lines WHERE devis_id = ? ORDER BY position ASC',
    [devisId]
  )
  const rules = await loadApprovedRules()
  if (!rules.length) {
    return {
      devis_id: devisId,
      generated_at: new Date().toISOString(),
      rules_count: 0,
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
      return rules.map((r) => ({
        rule_id: r.id,
        rule_title: r.title,
        status: 'warning',
        reason: `Erreur Gemma : ${err.message}`,
        fix: null,
      }))
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
    lines: results,
    summary,
  }
}
