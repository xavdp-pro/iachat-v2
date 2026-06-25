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
  overallDevPct: 96,
  phase: 'recette_client',
}

/** Visible banner on /validation — keep Armand & team informed. */
export const STATUS_BULLETIN = {
  title: 'Point dev — 19 juin 2026',
  headline: 'Développement Partie 2 à ~96 % — phase recette client',
  intro: 'Le gros du lot est livré côté dev. Il reste 3 points bloqués (réponses Armand / Arthur). Merci de valider ligne par ligne ci-dessous : cocher **Validé AG** ou **Retour** avec commentaire.',
  devDone: [
    'B1 — PDF devis The Hive calé sur 605.0106 (écarts layout < 4 pt) · /preview/index.html',
    'F1 — Fiche détail 1 vantail : modèle officiel Armand en prod (PJ mail 10/06)',
    'D4 — Deal HubSpot créé en `[n° devis] - [client]` dès la création (plus « Nouveau projet »)',
    'B3/B4/B5 — Fiches détail, poids PDF, grille (poubelle seule sticky)',
    'D1/D2/F4 — Mail Graph, brouillon Outlook Classic, credentials Entra ID',
    'Jalons A (sauf A5), C et D — dev terminé, en attente de votre validation',
  ],
  recheckPriority: [
    { id: 'B1', label: 'Comparer PDF Hive (référence + généré)', link: '/preview/index.html' },
    { id: 'F1', label: 'Fiche 1 vantail repère A', link: '/validation/samples/fiches-detail-echantillon-1v-2v.pdf' },
    { id: 'D4', label: 'Créer un deal → libellé 605.xxxx - Client', link: '/devis' },
    { id: 'A1', label: 'CR5/CR6 équipements (recette Arthur)', link: '/devis/grid?prompt=BP+1V+CR6' },
    { id: 'B5', label: 'Grille — poubelle seule, colonne sticky', link: '/devis/grid' },
    { id: 'D1', label: 'Email source conservé à la création devis', link: '/devis' },
    { id: 'D2', label: 'Brouillon Outlook bureau (pas OWA auto)', link: '/devis' },
  ],
  devBlocked: [
    { id: 'A5', label: 'Joint acoustique — référence + tarif NEXUS à confirmer (provisoire 175 € / 280 € HT)' },
    { id: 'F2', label: 'PDF modèle fiche châssis fixe — à fournir par Armand' },
    { id: 'F3', label: 'Matrice RC4 — recette colonne par colonne (Arthur)' },
  ],
  howTo: 'Lignes marquées « Corrigé — à re-confirmer » : correction déployée, merci de retester puis valider ou signaler un retour. Échantillons PDF téléchargeables ci-dessous.',
}

/** PDFs & assets for Armand validation — served from /validation/samples/ */
export const VALIDATION_DOWNLOADS = [
  {
    id: 'hive-ref',
    jalon: 'B1',
    label: '605.0106 — The Hive (référence Armand)',
    description: 'PDF cible client — comparer avec le généré',
    href: '/validation/samples/hive-reference-605.0106.pdf',
    filename: '605.0106 - The Hive.pdf',
  },
  {
    id: 'hive-gen',
    jalon: 'B1',
    label: '605.0106 — The Hive (PDF généré devis.zerux.com)',
    description: 'Échantillon CHF regénéré à partir des lignes The Hive',
    href: '/validation/samples/hive-the-hive-sample.pdf',
    filename: 'hive-the-hive-sample.pdf',
  },
  {
    id: 'fiches-detail',
    jalon: 'B3 / F1',
    label: 'Fiches de détail — repère A (1V) + repère B (2V)',
    description: 'Modèle officiel 1 vantail + 2 vantaux remplis',
    href: '/validation/samples/fiches-detail-echantillon-1v-2v.pdf',
    filename: 'fiches-detail-echantillon-1v-2v.pdf',
  },
  {
    id: 'hive-compare',
    jalon: 'B1',
    label: 'Comparaison côte à côte (navigateur)',
    description: 'Référence vs généré — page interactive',
    href: '/preview/index.html',
    external: true,
  },
]

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
      { id: 'A1', label: 'Matrices équipements 14 perfs + filtrage onglet tarif', dev: 'done', devNote: 'Règles Arthur 24/06 (CR3→EF2) + corrections mail 25/06 (trappes, judas CR6, judas≠vitrage CR5, plinthe, garniture, passe-câble).', ag: 'pending', agNote: 'Recette Arthur : CR5 et CR6 colonne par colonne' },
      { id: 'A2', label: "CR6+EI60 : pas d'avis de chantier si non obligatoire", dev: 'done', devNote: 'test:performance-compat', ag: 'pending' },
      { id: 'A3', label: 'Porte bélier : cumul autres performances', dev: 'done', devNote: 'Table ANTI-BÉLIER + options EI/FB cumulées (ANTI-BELIER.md). CR+bélier : tarif gamme RC + alerte.', ag: 'pending', question: 'Merci de valider sur un cas réel : anti-bélier seul + EI60, et CR4 + bélier + FB4 si applicable.', neededToFinish: 'Recette Armand sur devis pilote' },
      { id: 'A4', label: 'Anti-bélier bloqué si BP 2 vantaux', dev: 'done', devNote: 'Règle compatibilité', ag: 'pending' },
      { id: 'A5', label: 'Option joint acoustique', dev: 'question', devNote: 'Implémenté provisoirement : 175 € HT (1V) / 280 € HT (2V) — libellé « Joint acoustique »', ag: 'pending', question: 'Quelle référence tarif NEXUS, libellé exact et montant HT pour l’option joint acoustique ?', neededToFinish: 'Référence + libellé + prix validés par Armand (remplace le provisoire detect_nexus)' },
      { id: 'A6', label: 'Compatibilités CR / FB / EI', dev: 'done', devNote: 'Matrice + tests auto', ag: 'pending' },
      { id: 'A7', label: 'Recalcul auto si case équipement vidée', dev: 'done', ag: 'pending' },
      { id: 'A8', label: "Arrondi prix tarif à l'unité (ex. 4476)", dev: 'done', ag: 'pending' },
      { id: 'A9', label: 'FB5 → FB6 si perf indispo', dev: 'done', ag: 'pending' },
      { id: 'A10', label: 'Règle R061 (FP + plinthe) prise en compte IA', dev: 'done', devNote: 'Règle en base (TS-5000 + plinthe encastrée) — BP uniquement, audit validate-lines OK', ag: 'pending', question: 'Le FP TS-5000 + plinthe auto doivent-ils toujours réapparaître si l’utilisateur les efface ?', neededToFinish: 'Recette IA sur devis réel Armand + validation comportement attendu (forçage vs suggestion)' },
    ],
  },
  {
    id: 'B',
    label: 'PDF devis & fiches détail',
    contractPct: 30,
    targetDate: '2026-06-26',
    items: [
      { id: 'B1', label: 'PDF devis ~99 % (The Hive)', dev: 'done', devNote: 'Template Hive calé sur 605.0106 — compare/measure < 4 pt, filler dernière page multi-pages. Preview : /preview/index.html', ag: 'pending', agNote: 'Comparer The Hive.pdf', question: 'Peux-tu comparer le PDF généré avec 605.0106 The Hive et valider visuellement ?' },
      { id: 'B2', label: 'Stepper étape 4 : PDF live à droite', dev: 'done', devNote: 'Preview + libellés live', ag: 'pending' },
      { id: 'B3', label: 'Fiches détail : 1/repère, PDF unique', dev: 'done', devNote: 'Modèles 1V + 2V — PDF échantillon sur /validation', ag: 'pending', question: 'Comparer le PDF échantillon (lien ci-dessous) avec vos modèles. Châssis fixe toujours en attente F2.', neededToFinish: 'Validation visuelle Armand + modèle châssis F2' },
      { id: 'B4', label: 'Poids admin + report détail PDF', dev: 'done', devNote: 'Format Hive vantail+bâti + enrich auto PDF', ag: 'pending', agNote: 'Retour Armand : poids pas OK — recette après correctif format' },
      { id: 'B5', label: 'Lignes fin : Total HT, remise, TVA, TTC', dev: 'done', devNote: 'Totaux + geste €/% · colonne Actions = poubelle seule (sticky)', ag: 'pending', agNote: 'Totaux OK — retirer 4 icônes ligne (IA, réanalyser, reset, règle R&D) + poubelle visible au zoom' },
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
      { id: 'D1', label: 'Mail client : conversations CRM + « Pas d\'email »', dev: 'done', devNote: 'Liste plate : 5 emails reçus du contact + bouton « +5 » (sans scoring « demande probable »).', ag: 'pending', agNote: 'Recette pilote FGS / Florent Renaud' },
      { id: 'D2', label: 'Étape Envoi : conversation, corps, PJ, brouillon Outlook', dev: 'done', devNote: 'Graph createReply + brouillon test FGS créé', ag: 'pending', agNote: 'Vérifier Brouillons Outlook + parcours étape 5' },
      { id: 'D3', label: 'Contact HubSpot demandeur + lien email', dev: 'done', devNote: 'Étape 1 stepper', ag: 'pending' },
      { id: 'D4', label: 'Deal auto + [n° devis] - [client]', dev: 'done', devNote: 'Création deal : numéro devis alloué d’abord, libellé HubSpot `[n°] - [client]` dès la création (plus « Nouveau projet »).', ag: 'pending', question: 'Valider sur deal pilote FGS 605.0103', neededToFinish: 'Recette création deal + libellé initial' },
    ],
  },
]

export const FILES_BLOCKERS = [
  { id: 'F1', label: 'Fiche de détail 1 vantail.pdf', dev: 'done', devNote: 'Modèle officiel 1V en prod (PJ mail 10/06) · échantillon repère A sur /validation', ag: 'pending', question: 'Comparer repère A du PDF échantillon avec votre modèle 1 vantail' },
  { id: 'F2', label: 'Modèle PDF fiche châssis fixe', dev: 'waiting', devNote: 'Squelette dev seulement', ag: 'to_provide', question: 'Armand : PDF modèle' },
  { id: 'F3', label: 'Matrice RC4 Arthur colonne par colonne', dev: 'waiting', devNote: 'Bootstrap CR4 en place', ag: 'to_provide', question: 'Arthur / Armand' },
  { id: 'F4', label: 'Credentials MS_GRAPH_* (Entra ID ZERUX)', dev: 'done', devNote: 'Configuré — boîtes Armand + Arthur', ag: 'pending', question: 'Armand / IT : confirmer périmètre lecture seule OK' },
]

export const MEETING_AGENDA = [
  '📋 Lire le bulletin du 19/06 en haut de page (96 % dev livré)',
  'B1 — comparer The Hive : /preview/index.html (5 min)',
  'F1 — PDF échantillon fiche 1V repère A vs modèle Armand',
  'D4 — créer deal test : libellé `605.xxxx - [client]` sans « Nouveau projet »',
  'A1 — recette Arthur CR5/CR6 (judas ≠ vitrage, trappes, passe-câble)',
  'B5 / D1 / D2 — grille poubelle, mail source, brouillon Outlook',
  'A5 — réponse tarif joint acoustique (question ouverte)',
  'F2 / F3 — dépôt PDF châssis + recette RC4 Arthur',
  'Cocher Validé AG ou Retour sur chaque ligne testée',
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
