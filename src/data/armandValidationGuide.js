/**
 * Deep links into the app + human/automated verification steps per roadmap item.
 * Used by /validation/ and validation-recette.md
 */

/** @typedef {{ appLink?: string, appLinkLabel?: string, sampleLinks?: Array<{ href: string, label: string }>, verifySteps: string[], verifyCmd?: string }} ValidationGuideEntry */

/** @type {Record<string, ValidationGuideEntry>} */
export const VALIDATION_GUIDE = {
  A1: {
    appLink: '/devis/grid?prompt=BP+1V+CR6',
    appLinkLabel: 'Grille CR6 — équipements',
    verifySteps: [
      'CR6 judas : menu propose 4450, 4452, 4455, 4456 (pas les oculus vitrage).',
      'CR5 vitrage : menu propose les oculus CR5 (4516, 4517, 4518, 4521, 4616, 4617, 4621, 4666, 4667, 4671).',
      'CR4 vitrage : menu propose les oculus CR4 (4511, 4513, 4611, 4661, 4601) — pas mélangés avec CR5.',
      'CR5 judas : 4455 et 4456 uniquement (séparés du vitrage).',
      'Trappes CR3-CR5 : 4702 à 1 361 € HT, 4705 à 575 € HT.',
      'Passe-câble : ref 3998VHB dans la colonne contact / passe-câble.',
      'Plinthe 2V : quantité ×2 sur refs 4470/4472/4474/4476 au recalcul.',
      'Garniture int. 4024…4219 : recopiée auto sur garniture ext. si vide.',
      'Éditer plinthe puis judas : les deux valeurs restent (plus de miroir vitrage).',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:equipment-matrix && npm run test:equipment-cr4',
  },
  A2: {
    appLink: '/devis/grid?prompt=BP+1V+CR6+EI60',
    appLinkLabel: 'Grille CR6+EI60',
    verifySteps: [
      'Grille : ligne BP 1V CR6 + EI60 sans combinaison obligeant un avis de chantier si non requis.',
      'Panneau contrôles statiques : pas d’alerte bloquante abusive.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:performance-compat',
  },
  A3: {
    appLink: '/devis/grid?prompt=BP+1V+ANTI-BELIER',
    appLinkLabel: 'Grille anti-bélier',
    verifySteps: [
      'Anti-bélier seul + EI60 : gamme ANTI-BÉLIER + option EI60 (+1 200 €) — sans avis ni note de calcul.',
      'Anti-bélier + FB4 : option FB4 (+1 100 €) ; si feu cumulé → avis de chantier.',
      'CR4 + bélier + EI60 : tarif sur gamme CR4 + options feu (pas table anti-bélier seule).',
      'FB7 + EI60 sur anti-bélier : alerte incompatible.',
    ],
  },
  A4: {
    appLink: '/devis/grid?prompt=BP+2V+ANTI-BELIER',
    appLinkLabel: 'Grille BP 2V + bélier',
    verifySteps: [
      'Grille : BP 2 vantaux + perf anti-bélier → blocage ou alerte explicite.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:performance-compat',
  },
  A5: {
    appLink: '/devis/grid?prompt=BP+1V+CR4+joint+acoustique',
    appLinkLabel: 'Grille joint acoustique',
    verifySteps: [
      'Grille : saisir « joint acoustique » dans options / autres.',
      'Vérifier ligne option + montant (provisoire 175 € 1V / 280 € 2V jusqu’à validation tarif).',
    ],
  },
  A6: {
    appLink: '/devis/grid?prompt=BP+1V+CR4+FB4+EI60',
    appLinkLabel: 'Grille compatibilités',
    verifySteps: [
      'Tester combinaisons CR + FB + EI sur la grille.',
      'Contrôles statiques CR/FB/EI visibles en bas de grille.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:performance-compat',
  },
  A7: {
    appLink: '/devis/grid',
    appLinkLabel: 'Grille chiffrage',
    verifySteps: [
      'Renseigner un équipement (serrure, FP…), puis vider la case.',
      'Le prix ligne doit se recalculer sans laisser l’ancien montant.',
    ],
  },
  A8: {
    appLink: '/devis/grid',
    appLinkLabel: 'Grille — ref 4476',
    verifySteps: [
      'Ligne avec plinthe ref 4476 : prix unitaire arrondi (ex. 4476 € pas 4476.32).',
    ],
  },
  A9: {
    appLink: '/devis/grid?prompt=BP+1V+FB5',
    appLinkLabel: 'Grille FB5',
    verifySteps: [
      'Si FB5 indisponible pour la gamme : bascule automatique FB6 ou alerte claire.',
    ],
  },
  A10: {
    appLink: '/devis/grid',
    appLinkLabel: 'Grille + règle R061',
    verifySteps: [
      'Règles actives : /rules → chercher R061 (FP TS-5000 + plinthe encastrée).',
      'Grille : ligne vierge → ferme-porte + plinthe ajoutés par défaut.',
      'Chat grille : demander une modif sans supprimer FP/plinthe → l’IA ne doit pas les retirer.',
      'Bouton validation lignes → audit R061 sans violation.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:performance-compat',
  },
  B1: {
    appLink: '/preview/index.html',
    appLinkLabel: 'Comparaison face à face (référence vs généré)',
    sampleLinks: [
      { href: '/validation/samples/hive-reference-605.0106.pdf', label: 'Télécharger PDF référence Armand (605.0106)' },
      { href: '/validation/samples/hive-the-hive-sample.pdf', label: 'Télécharger PDF généré (The Hive CHF)' },
      { href: '/preview/index.html', label: 'Comparaison côte à côte (navigateur)' },
    ],
    verifySteps: [
      'Ouvrir la comparaison côte à côte (lien ci-dessus) : référence Armand à gauche, PDF généré à droite.',
      'Vérifier en-tête : logo + livraison ligne 1, barres Devis n° / Facturation alignées ligne 2, liserets verticaux fixes.',
      'Vérifier tableau : colonnes séparées par traits gris fins (pas épais), fond blanc sur les lignes, position alignée avec l’original.',
      'Totaux CHF : Total HT, TVA déductible 8,1 %, Total TTC sur bandeau foncé ; filler bas de page sur dernière section.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:hive-pdf',
  },
  B2: {
    appLink: '/devis',
    appLinkLabel: 'Stepper étape 4',
    verifySteps: [
      'Étape 4 : aperçu PDF à droite, libellés mis à jour en direct quand on édite une ligne.',
    ],
  },
  B3: {
    appLink: '/validation',
    appLinkLabel: 'Page validation — échantillon PDF',
    sampleLinks: [
      { href: '/validation/samples/fiches-detail-echantillon-1v-2v.pdf', label: 'Télécharger PDF échantillon (repère A 1V + repère B 2V)' },
    ],
    verifySteps: [
      'Télécharger le PDF échantillon (lien ci-dessus) — sans parcourir tout le stepper.',
      'Repère A = 1 vantail CR4 · Repère B = 2 vantaux CR3.',
      'Comparer mise en page, schémas sens d\'ouverture, seuil, poids, avec vos modèles.',
      'Châssis fixe : modèle provisoire uniquement (F2 en attente).',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:detail-pdf',
  },
  B4: {
    appLink: '/admin?tab=data&sub=weight',
    appLinkLabel: 'Admin → Calcul poids',
    verifySteps: [
      'Admin → Calcul poids : profils importés.',
      'Générer un PDF devis : ligne produit avec « Poids approximatif - Vantail nu : … kg - Bâti : … kg » (ou 2 vantaux : service + semi-fixe + bâti).',
      'Fiche détail PDF : même libellé poids sur la carte Produit.',
    ],
  },
  B5: {
    appLink: '/devis/grid',
    appLinkLabel: 'Grille totaux',
    verifySteps: [
      'Bas de grille : Total HT, geste commercial (€ HT ou %), TVA, TTC — cohérents avec le PDF devis.',
      'Colonne Actions (mode édition) : une seule icône poubelle par ligne — plus d’icônes IA / réanalyser / reset / règle R&D.',
      'Zoom ou scroll horizontal : la poubelle reste visible (colonne fixée à droite).',
      'PDF devis : mêmes totaux en bas de page.',
    ],
  },
  C1: {
    appLink: '/admin?tab=data&sub=taux-change',
    appLinkLabel: 'Admin → Taux de change',
    verifySteps: [
      'Vérifier EUR, CHF (0,9), GBP (0,9), USD (1,2).',
      'Grille / devis : changer devise → montants recalculés.',
    ],
  },
  C2: {
    appLink: '/admin?tab=data&sub=taux-change',
    appLinkLabel: 'Admin → Taux de change',
    verifySteps: [
      'Si dernier semestre non validé : bandeau rouge en haut de l’admin.',
    ],
  },
  C3: {
    appLink: '/admin?tab=data&sub=numerotation',
    appLinkLabel: 'Admin → Numérotation',
    verifySteps: [
      'Format mensuel configurable, gestion des trous de séquence.',
      'Nouveau devis → numéro conforme au format admin.',
    ],
  },
  D1: {
    appLink: '/devis',
    appLinkLabel: 'Stepper → étape Client (recette FGS)',
    verifySteps: [
      'Étape 1 : entreprise FGS → contact Florent Renaud.',
      'Bloc « Conversations email » : les 5 emails les plus récents reçus du contact, sans badge « demande probable ».',
      'Bouton « + 5 emails plus anciens » pour charger la suite.',
      'Cliquer un email → toast « Email source enregistré ».',
      'Cocher « Pas d’email » → bloc masqué.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:mail-validation',
  },
  D2: {
    appLink: '/devis',
    appLinkLabel: 'Stepper → étape 5 Envoi',
    verifySteps: [
      'Parcours : Client FGS → grille → PDF → bouton « Envoyer vers HubSpot → ».',
      'Étape 5 : conversation client visible, choisir le mail source si besoin.',
      'Rédiger le corps, cocher PJ devis + fiches, cliquer **Préparer brouillon**.',
      'Vérifier : PDF sur deal HubSpot + brouillon Outlook **en réponse** au fil client (pas un mail neuf).',
      'Un brouillon test (PDF 605.0103-test) existe déjà sur le fil FGS — contrôler dans Outlook Brouillons.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:mail-validation && npm run test:graph-draft -- --dry-run',
  },
  D3: {
    appLink: '/devis',
    appLinkLabel: 'Stepper → contact demandeur',
    verifySteps: [
      'Étape 1 : liste déroulante **Contact demandeur (HubSpot)** sur l’entreprise sélectionnée.',
      'Le contact choisi détermine l’email des conversations (ex. f.renaud@fgs-security.ch).',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:hubspot',
  },
  D4: {
    appLink: '/devis',
    appLinkLabel: 'Stepper → deal FGS 605.0103',
    verifySteps: [
      'Créer ou ouvrir un devis sur le deal **605.0103 Nexus RC4** (entreprise FGS).',
      'Créer un nouveau deal : le libellé HubSpot doit être **`605.xxxx - [client]`** dès la création (plus « Nouveau projet »).',
      'Un devis est créé automatiquement dans le deal avec le numéro attribué.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:hubspot:crm',
  },
  F1: {
    sampleLinks: [
      { href: '/validation/samples/fiches-detail-echantillon-1v-2v.pdf', label: 'PDF échantillon — fiche 1V (repère A)' },
    ],
    verifySteps: [
      'Repère A = modèle officiel `Fiche de détail 1 vantail.pdf` (PJ mail 10/06) — champs formulaire uniquement.',
      'Repère B = 2 vantaux CR3 — comparer sens, seuil, dimensions avec votre modèle.',
    ],
  },
  F2: {
    verifySteps: [
      'Fournir modèle PDF châssis fixe (mise en page + champs obligatoires).',
    ],
  },
  F3: {
    appLink: '/admin?tab=data&sub=equipements',
    appLinkLabel: 'Admin → Équipements CR4',
    verifySteps: [
      'Arthur valide colonne par colonne la matrice RC4.',
      'Comparer avec devis pilote 605.xxxx sur la grille.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:equipment-cr4',
  },
  F4: {
    appLink: '/devis/imap-lab',
    appLinkLabel: 'Lab Mail Graph (admin)',
    verifySteps: [
      'MS_GRAPH_* configuré (Entra ID application ZERUX).',
      'Boîtes commerciales : armand.guilhot@zerux.com et arthur.milz@zerux.com.',
      'Application en lecture seule — seul « Préparer brouillon » crée un brouillon modifiable dans Outlook.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:mail-validation',
  },
}

export function guideForItem(itemId) {
  return VALIDATION_GUIDE[itemId] || { verifySteps: ['Voir la feuille de route et tester dans l’app.'] }
}

export function enrichItemWithGuide(item) {
  const guide = guideForItem(item.id)
  return {
    ...item,
    appLink: guide.appLink || null,
    appLinkLabel: guide.appLinkLabel || null,
    sampleLinks: guide.sampleLinks || null,
    verifySteps: guide.verifySteps || [],
    verifyCmd: guide.verifyCmd || null,
  }
}
