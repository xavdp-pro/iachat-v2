/**
 * Deep links into the app + human/automated verification steps per roadmap item.
 * Used by /validation/ and validation-recette.md
 */

/** @typedef {{ appLink?: string, appLinkLabel?: string, verifySteps: string[], verifyCmd?: string }} ValidationGuideEntry */

/** @type {Record<string, ValidationGuideEntry>} */
export const VALIDATION_GUIDE = {
  A1: {
    appLink: '/admin?tab=data&sub=equipements',
    appLinkLabel: 'Admin → Équipements',
    verifySteps: [
      'Admin → Données métier → Équipements : sélectionner une perf (ex. CR4, EI60).',
      'Vérifier que la matrice affiche les refs filtrées (pas toutes les perfs mélangées).',
      'Grille : ouvrir un devis RC4, onglet tarif équipement → options cohérentes avec la perf ligne.',
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
      'Grille : porte anti-bélier + option EI60 / FB4 / 45 dB selon devis pilote Armand.',
      'Vérifier cumul tarif + alertes avis de chantier (feu + pare-balles).',
      'Comparer montants avec tarif ANTI-BELIER.md.',
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
    appLink: '/devis',
    appLinkLabel: 'Stepper → étape PDF',
    verifySteps: [
      'Nouveau devis ou devis test → étape 4 « Préparer PDF ».',
      'Télécharger PDF et comparer visuellement avec 605.0106 The Hive.pdf.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:hive-pdf /tmp/hive-sample.pdf',
  },
  B2: {
    appLink: '/devis',
    appLinkLabel: 'Stepper étape 4',
    verifySteps: [
      'Étape 4 : aperçu PDF à droite, libellés mis à jour en direct quand on édite une ligne.',
    ],
  },
  B3: {
    appLink: '/devis',
    appLinkLabel: 'Stepper → fiches détail',
    verifySteps: [
      'Étape 4 : générer fiche détail par repère (2V OK).',
      'Comparer avec PDF Armand ; 1V et châssis fixe bloqués sans F1/F2.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:detail-pdf /tmp/detail-sample.pdf',
  },
  B4: {
    appLink: '/admin?tab=data&sub=weight',
    appLinkLabel: 'Admin → Calcul poids',
    verifySteps: [
      'Admin → Calcul poids : profils importés.',
      'Fiche détail PDF : poids approximatif reporté sur la ligne.',
    ],
  },
  B5: {
    appLink: '/devis/grid',
    appLinkLabel: 'Grille totaux',
    verifySteps: [
      'Grille : section calculs — Total HT, remise, TVA, TTC cohérents.',
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
    appLink: '/devis/imap-lab',
    appLinkLabel: 'Lab IMAP',
    verifySteps: [
      'Lab IMAP : 5 mails seed + option « Pas d’email » sur stepper.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:imap',
  },
  D2: {
    appLink: '/devis',
    appLinkLabel: 'Stepper → étape Envoi',
    verifySteps: [
      'Étape 5 Envoi : aperçu mail, corps éditable, PJ devis + fiches.',
      'Brouillon Outlook réel nécessite MS_GRAPH_* (F4).',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:graph-draft',
  },
  D3: {
    appLink: '/devis',
    appLinkLabel: 'Stepper → client',
    verifySteps: [
      'Étape 1 : sélection entreprise HubSpot → contacts de l’entreprise listés.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:hubspot',
  },
  D4: {
    appLink: '/prospects',
    appLinkLabel: 'Prospects HubSpot',
    verifySteps: [
      'Créer / ouvrir devis lié deal HubSpot.',
      'Titre deal auto : [n° devis] - [client].',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:hubspot:crm',
  },
  F1: {
    verifySteps: [
      'Déposer Fiche de détail 1 vantail.pdf dans ressources/ ou confirmer chemin OneDrive.',
      'Puis retester B3 génération 1V.',
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
    appLink: '/admin?tab=maintenance',
    appLinkLabel: 'Admin (config IT)',
    verifySteps: [
      'IT Zerux : renseigner MS_GRAPH_TENANT_ID, CLIENT_ID, CLIENT_SECRET, MAILBOX dans .env.',
      'Puis retester D2 brouillon Outlook.',
    ],
    verifyCmd: 'cd iachat-v2 && npm run test:graph-draft',
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
    verifySteps: guide.verifySteps || [],
    verifyCmd: guide.verifyCmd || null,
  }
}
