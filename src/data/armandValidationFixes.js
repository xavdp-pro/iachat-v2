/**
 * Dev fix notes for items corrected after Armand feedback — used to prefill re-validation requests.
 */
export const DEV_FIX_NOTES = {
  A7: 'Correction déployée : vider une cellule équipement (Ctrl+A + Backspace) supprime bien le poste — prix à 0, sans réinjection auto serrure / garniture / FP. Merci de retester sur la grille.',
  A9: 'Correction déployée : FB5 en saisie est chiffré en FB6 avec alerte « FB5 non au tarif → chiffré en FB6 ». Merci de confirmer sur une ligne FB5.',
  A10: 'Correction déployée : R061 (FP TS-5000 + plinthe encastrée) s’applique uniquement aux BP — plus sur châssis fixe ni guichet. L’effacement manuel reste possible (voir A7). Merci de retester BP vs châssis.',
  A5: 'Correction déployée : performance CEM (Oui/Non) — libellé tarif « Joints blindage électromagnétique CEM » affiché dans le détail ligne + chiffrage 990 € HT / vantail. Merci de valider.',
  A1: 'Correction déployée (26/06, maj Arthur CR5) : listes CR5 alignées sur le mail Arthur — serrures 4152/4156/…/4203, garniture int. 4180/4211/4219, vitrage CR5 (4516…4671, plus les oculus CR4), judas 4455/4456 séparés du vitrage, colonne Divers vidée. Merci de retester CR5 colonne par colonne (F5).',
  B4: 'Correction déployée (26/06) : ordre désignation PDF conforme Excel — poids après réservation gros-œuvre, avant finition. Merci de regénérer un PDF test.',
  B5: 'Merci pour le retour — les totaux en bas de grille étaient déjà OK. Correction déployée : les 4 icônes par ligne (analyse IA, réanalyser, réinitialiser, règle R&D) ont été retirées ; seule la poubelle reste. La colonne Actions est fixée à droite (sticky) pour rester visible même quand toutes les colonnes équipements tiennent à l’écran / au zoom. Merci de re-tester sur /devis/grid (F5).',
  C2: 'Correction déployée : bandeau rouge « taux de change à valider » visible en haut de toutes les pages admin, pas seulement l’onglet taux.',
  A6: 'Correction déployée : CR4+FB4+EI60 compatible et chiffrable sans avis de chantier automatique (retour Armand 23/06). Merci de retester sur la grille H2300×L1150.',
  A3: 'Correction déployée : anti-bélier + EI30/EI60 → option tarif seule (plus d’avis de chantier ni note de calcul explosion). Avis conservé uniquement sur cumul feu + pare-balles (FB4/FB6). Merci de recetter anti-bélier seul + EI60.',
  B1: 'Template Hive calé sur 605.0106 — écarts layout < 4 pt (scripts compare + measure). Filler bas de page corrigé sur multi-pages. Comparaison : /preview/index.html — PDF : /preview/hive-sample.pdf',
  B3: 'Correction déployée (26/06) : fiches sur template PDF officiel Armand — uniquement les champs du formulaire (affaire, repère, localisation, dimensions, teinte, sens, seuil, intempéries, n° offre). Plus de listes équipements au milieu de la page. Échantillon : /validation/samples/fiches-detail-echantillon-1v-2v.pdf',
  F1: 'Fiche 1 vantail : modèle officiel `Fiche de détail 1 vantail.pdf` en prod. Échantillon repère A : /validation/samples/fiches-detail-echantillon-1v-2v.pdf',
  D4: 'Correction déployée : création deal HubSpot avec libellé `[n° devis] - [client]` dès la création (plus « Nouveau projet »). Devis créé automatiquement dans le deal.',
  D1: 'Correction déployée (26/06) : le contact demandeur et l’email source choisis à l’étape Client sont conservés à la création du devis — plus besoin de re-sélectionner à l’envoi. Merci de retester : client → contact + email → créer devis → étape Envoi.',
  D2: 'Correction déployée (26/06) : à « Préparer brouillon », ouverture prioritaire Outlook bureau Classic (`outlook:`) — plus d’ouverture automatique OWA / Outlook New. Lien navigateur en secours sous le message de succès. Merci de retester sur votre poste.',
  D3: 'Contact demandeur HubSpot : sélection à l’étape 1, lié au fil email du contact. Recette : FGS / Florent Renaud. Merci de confirmer.',
  F4: 'Correction déployée (26/06) : même correctif que D2 — brouillon Outlook Classic bureau en priorité, pas OWA / Outlook New.',
}

export const DEV_FIX_ITEM_IDS = Object.keys(DEV_FIX_NOTES)
