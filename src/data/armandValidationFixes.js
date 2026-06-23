/**
 * Dev fix notes for items corrected after Armand feedback — used to prefill re-validation requests.
 */
export const DEV_FIX_NOTES = {
  A7: 'Correction déployée : vider une cellule équipement (Ctrl+A + Backspace) supprime bien le poste — prix à 0, sans réinjection auto serrure / garniture / FP. Merci de retester sur la grille.',
  A9: 'Correction déployée : FB5 en saisie est chiffré en FB6 avec alerte « FB5 non au tarif → chiffré en FB6 ». Merci de confirmer sur une ligne FB5.',
  A10: 'Correction déployée : R061 (FP TS-5000 + plinthe encastrée) s’applique uniquement aux BP — plus sur châssis fixe ni guichet. L’effacement manuel reste possible (voir A7). Merci de retester BP vs châssis.',
  A5: 'Correction déployée : performance CEM (Oui/Non) — libellé tarif « Joints blindage électromagnétique CEM » affiché dans le détail ligne + chiffrage 990 € HT / vantail. Merci de valider.',
  A1: 'Correction déployée : menu serrure CR6 propose 4172 et 4176 (4185 déplacée en accessoire). Prix 4176 provisoire — merci de confirmer la référence tarif exacte.',
  B4: 'Correction déployée : le poids (kg) apparaît dans le PDF devis (même désignation longue) et sur les fiches détail. Merci de générer un PDF test.',
  B5: 'Correction déployée : geste commercial saisissable en € HT ou en % (sélecteur en bas de grille). Merci de tester les deux modes.',
  C2: 'Correction déployée : bandeau rouge « taux de change à valider » visible en haut de toutes les pages admin, pas seulement l’onglet taux.',
  A6: 'Correction déployée : CR4+FB4+EI60 compatible et chiffrable sans avis de chantier automatique (retour Armand 23/06). Merci de retester sur la grille H2300×L1150.',
}

export const DEV_FIX_ITEM_IDS = Object.keys(DEV_FIX_NOTES)
