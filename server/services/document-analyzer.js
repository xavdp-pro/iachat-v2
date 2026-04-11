/**
 * document-analyzer.js
 * Analyse chaque page d'un document avec le modèle vLLM vision.
 * Traitement en parallèle (max CONCURRENCY pages simultanées).
 */
import { chatCompletion } from './ollama.js'

const CONCURRENCY = 3

// Prompt d'analyse par page
const PAGE_PROMPT = `Tu es un assistant d'analyse documentaire expert.
Analyse cette page de document et extrais :
1. Le type de contenu (texte, tableau, formulaire, facture, plan, schéma, etc.)
2. Les informations clés (montants, dates, noms, références, quantités)
3. Un résumé concis du contenu de la page
4. Les données structurées importantes (présente sous forme JSON si pertinent)

Sois précis et exhaustif. Si la page contient du texte OCR fourni, utilise-le en complément.`

// Prompt de synthèse finale
const SUMMARY_PROMPT = `Tu es un assistant d'analyse documentaire.
Voici l'analyse de toutes les pages d'un document.
Génère une synthèse globale structurée comprenant :
- Type et nature du document
- Informations essentielles
- Points importants à retenir
- Données clés extraites (montants, dates, références, etc.)

Analyses par page :
`

/**
 * Limiter de concurrence simple.
 */
function createLimiter(max) {
  let active = 0
  const queue = []
  function run() {
    if (active >= max || queue.length === 0) return
    active++
    const { fn, resolve, reject } = queue.shift()
    Promise.resolve()
      .then(fn)
      .then((v) => { resolve(v); active--; run() })
      .catch((e) => { reject(e); active--; run() })
  }
  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      run()
    })
  }
}

/**
 * Analyser une seule page avec le modèle vision.
 *
 * @param {object} page  { pageNumber, text, imageDataUri }
 * @param {string} model
 * @returns {Promise<string>} résultat de l'analyse
 */
async function analyzePage(page, model) {
  const contentParts = []

  // Texte OCR en complément si disponible
  const textHint = page.text?.trim()
  const promptWithOcr = textHint
    ? `${PAGE_PROMPT}\n\nTexte OCR extrait de cette page :\n"""\n${textHint.slice(0, 3000)}\n"""`
    : PAGE_PROMPT

  contentParts.push({ type: 'text', text: promptWithOcr })

  if (page.imageDataUri) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: page.imageDataUri },
    })
  }

  const messages = [
    {
      role: 'user',
      content: contentParts,
    },
  ]

  const result = await chatCompletion({ model, messages })
  return result
}

/**
 * Générer la synthèse globale à partir des analyses de pages.
 *
 * @param {Array<{ pageNumber: number, result: string }>} pageResults
 * @param {string} model
 * @returns {Promise<string>}
 */
async function generateSummary(pageResults, model) {
  const combined = pageResults
    .map((p) => `=== Page ${p.pageNumber} ===\n${p.result}`)
    .join('\n\n')

  const messages = [
    {
      role: 'user',
      content: SUMMARY_PROMPT + combined.slice(0, 12000),
    },
  ]

  return chatCompletion({ model, messages })
}

/**
 * Runner principal : analyse toutes les pages en parallèle puis génère un résumé.
 *
 * @param {object} opts
 * @param {Array<{ pageNumber: number, text: string, imageDataUri: string }>} opts.pages
 * @param {string} opts.model  Modèle vLLM à utiliser
 * @param {function} [opts.onPageDone]  Callback appelé après chaque page : (pageNumber, result) => void
 * @returns {Promise<{ pageResults: Array<{ pageNumber, result }>, summary: string }>}
 */
export async function analyzeDocument({ pages, model, onPageDone }) {
  const limit = createLimiter(CONCURRENCY)

  const pageResults = await Promise.all(
    pages.map((page) =>
      limit(async () => {
        const result = await analyzePage(page, model)
        if (typeof onPageDone === 'function') await onPageDone(page.pageNumber, result)
        return { pageNumber: page.pageNumber, result }
      })
    )
  )

  // Trier par numéro de page (ordre garanti)
  pageResults.sort((a, b) => a.pageNumber - b.pageNumber)

  const summary = await generateSummary(pageResults, model)

  return { pageResults, summary }
}
