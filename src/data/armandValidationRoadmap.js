/**
 * Part 2 delivery roadmap — source of truth for /validation page.
 * Sync with ressources/XLSX/2606/NEW/suivi-livraison.md
 */

export const ROADMAP_META = {
  title: 'Suivi livraison — Partie 2',
  client: 'Armand Guilhot (Zerux)',
  contact: 'armand.guilhot@zerux.com',
  project: 'devis.zerux.com',
  updatedAt: '2026-06-19',
  overallDevPct: 81,
}

export const DEV_STATUS = {
  DONE: 'done',
  IN_PROGRESS: 'in_progress',
  WAITING: 'waiting',
  QUESTION: 'question',
}

export const AG_STATUS = {
  PENDING: 'pending',
  VALIDATED: 'validated',
  RETURN: 'return',
  TO_PROVIDE: 'to_provide',
}

export const JALONS = [
  {
    id: 'A',
    label: 'Équipements & corrections tarifaires',
    contractPct: 20,
    targetDate: '2026-06-19',
    items: [
      { id: 'A1', label: 'Matrices équipements 14 perfs + filtrage onglet tarif', dev: 'done', devNote: 'CR3→EF2 importés. Arthur RC4 = référence.', ag: 'pending' },
      { id: 'A2', label: "CR6+EI60 : pas d'avis de chantier si non obligatoire", dev: 'done', devNote: 'test:performance-compat', ag: 'pending' },
      { id: 'A3', label: 'Porte bélier : cumul autres performances', dev: 'in_progress', devNote: 'Règles FB7/EI60 + avis chantier feu+PB codées — recette cas réel manquante', ag: 'pending', question: 'Peux-tu fournir un devis pilote (n° + perfs attendues) pour valider le cumul anti-bélier + EI/FB/45 dB ?', neededToFinish: 'Devis pilote Armand + confirmation règles cumul (avis chantier oui/non par combinaison)' },
      { id: 'A4', label: 'Anti-bélier bloqué si BP 2 vantaux', dev: 'done', devNote: 'Règle compatibilité', ag: 'pending' },
      { id: 'A5', label: 'Option joint acoustique', dev: 'question', devNote: 'Implémenté provisoirement : 175 € HT (1V) / 280 € HT (2V) — libellé « Joint acoustique »', ag: 'pending', question: 'Quelle référence tarif NEXUS, libellé exact et montant HT pour l’option joint acoustique ?', neededToFinish: 'Référence + libellé + prix validés par Armand (remplace le provisoire detect_nexus)' },
      { id: 'A6', label: 'Compatibilités CR / FB / EI', dev: 'done', devNote: 'Matrice + tests auto', ag: 'pending' },
      { id: 'A7', label: 'Recalcul auto si case équipement vidée', dev: 'done', ag: 'pending' },
      { id: 'A8', label: "Arrondi prix tarif à l'unité (ex. 4476)", dev: 'done', ag: 'pending' },
      { id: 'A9', label: 'FB5 → FB6 si perf indispo', dev: 'done', ag: 'pending' },
      { id: 'A10', label: 'Règle R061 (FP + plinthe) prise en compte IA', dev: 'in_progress', devNote: 'Règle en base (TS-5000 + plinthe encastrée) — audit validate-lines OK', ag: 'pending', question: 'Sur quel devis tester la règle R061 via grille / IA ? Le FP TS-5000 + plinthe auto doivent-ils toujours apparaître même si l’utilisateur les efface ?', neededToFinish: 'Recette IA sur devis réel Armand + validation comportement attendu (forçage vs suggestion)' },
    ],
  },
  {
    id: 'B',
    label: 'PDF devis & fiches détail',
    contractPct: 30,
    targetDate: '2026-06-26',
    items: [
      { id: 'B1', label: 'PDF devis ~99 % (The Hive)', dev: 'in_progress', devNote: 'PDF généré — validation visuelle', ag: 'pending', agNote: 'Comparer The Hive.pdf', question: 'Peux-tu comparer le PDF généré avec 605.0106 The Hive et lister les écarts visuels restants ?' },
      { id: 'B2', label: 'Stepper étape 4 : PDF live à droite', dev: 'done', devNote: 'Preview + libellés live', ag: 'pending' },
      { id: 'B3', label: 'Fiches détail : 1/repère, PDF unique', dev: 'in_progress', devNote: '2V OK · 1V manquant · châssis squelette', ag: 'pending', question: 'La fiche 2 vantaux te convient-elle ? Quels écarts vs ton PDF ? (F1/F2 bloquent le 1V et châssis)', neededToFinish: 'F1 Fiche 1 vantail + F2 modèle châssis fixe' },
      { id: 'B4', label: 'Poids admin + report détail PDF', dev: 'done', devNote: 'Admin + Calcul poids.xlsx', ag: 'pending' },
      { id: 'B5', label: 'Lignes fin : Total HT, remise, TVA, TTC', dev: 'done', ag: 'pending' },
    ],
  },
  {
    id: 'C',
    label: 'Multi-devise & numérotation',
    contractPct: 5,
    targetDate: '2026-07-03',
    items: [
      { id: 'C1', label: 'EUR, CHF (0,9), GBP (0,9), USD (1,2)', dev: 'done', devNote: 'Admin taux + grille', ag: 'pending' },
      { id: 'C2', label: 'Alerte taux 2×/an (janv. / juin)', dev: 'done', devNote: 'Bandeau admin', ag: 'pending' },
      { id: 'C3', label: 'Admin numérotation mensuelle', dev: 'done', devNote: 'Format + trous séquence', ag: 'pending' },
    ],
  },
  {
    id: 'D',
    label: 'HubSpot, IMAP, Envoi',
    contractPct: 20,
    targetDate: '2026-07-03',
    items: [
      { id: 'D1', label: "IMAP : 5 mails + « Pas d'email »", dev: 'done', devNote: 'Dovecot test + prod Zimbra à config', ag: 'pending' },
      { id: 'D2', label: 'Étape Envoi : aperçu, corps, PJ, brouillon', dev: 'in_progress', devNote: 'UI OK — MS_GRAPH_* manquant', ag: 'pending', question: 'Qui configure MS_GRAPH_* pour la boîte commerciale ? Délai estimé ?', neededToFinish: 'Credentials F4 (IT Zerux)' },
      { id: 'D3', label: 'Contact HubSpot dans l\'entreprise', dev: 'done', ag: 'pending' },
      { id: 'D4', label: 'Deal auto + [n° devis] - [client]', dev: 'in_progress', devNote: 'À recetter deal réel HubSpot', ag: 'pending', question: 'Quel deal HubSpot utiliser pour la recette (n° deal ou entreprise pilote) ?', neededToFinish: 'Deal pilote Armand + accès HubSpot prod' },
    ],
  },
]

export const FILES_BLOCKERS = [
  { id: 'F1', label: 'Fiche de détail 1 vantail.pdf', dev: 'waiting', devNote: 'PJ mail 10/06', ag: 'to_provide', question: 'Armand : déposer ou confirmer' },
  { id: 'F2', label: 'Modèle PDF fiche châssis fixe', dev: 'waiting', devNote: 'Squelette dev seulement', ag: 'to_provide', question: 'Armand : PDF modèle' },
  { id: 'F3', label: 'Matrice RC4 Arthur colonne par colonne', dev: 'waiting', devNote: 'Bootstrap CR4 en place', ag: 'to_provide', question: 'Arthur / Armand' },
  { id: 'F4', label: 'Credentials MS_GRAPH_* boîte commerciale', dev: 'waiting', devNote: 'IT Zerux — bloque D2', ag: 'to_provide', question: 'Armand / IT' },
]

export const MEETING_AGENDA = [
  'A5 — référence tarif joint acoustique (réponse directe ci-dessous)',
  'A3 — devis pilote anti-bélier + perfs cumulées',
  'A10 — recette R061 sur devis réel (FP + plinthe IA)',
  'Fichiers F1, F2, F3 — dépôt aujourd\'hui ?',
  'B1 — comparer The Hive côte à côte (5 min)',
  'B3 — fiche 2 vantaux OK ? écarts ?',
  'D2 / F4 — qui configure Outlook Graph ?',
  'Cocher Validé AG ou Retour ligne par ligne',
]

/** Items with an open question for Armand — shown prominently on /validation/ */
export function openQuestions() {
  const fromItems = allItems()
    .filter((i) => i.question)
    .map((i) => ({
      id: i.id,
      label: i.label,
      dev: i.dev,
      question: i.question,
      neededToFinish: i.neededToFinish || null,
      jalonId: i.jalonId,
    }))
  const fromFiles = FILES_BLOCKERS.map((f) => ({
    id: f.id,
    label: f.label,
    dev: f.dev,
    question: f.question,
    neededToFinish: f.devNote || null,
    jalonId: 'F',
  }))
  return [...fromItems, ...fromFiles]
}

export function jalonStats(jalon) {
  const items = jalon.items
  const done = items.filter((i) => i.dev === 'done').length
  const inProgress = items.filter((i) => i.dev === 'in_progress').length
  const waiting = items.filter((i) => i.dev === 'waiting' || i.dev === 'question').length
  const agValidated = items.filter((i) => i.ag === 'validated').length
  const devPct = Math.round(((done + inProgress * 0.5) / items.length) * 100)
  return { done, inProgress, waiting, agValidated, total: items.length, devPct }
}

export function allItems() {
  return JALONS.flatMap((j) => j.items.map((i) => ({ ...i, jalonId: j.id, jalonLabel: j.label })))
}
