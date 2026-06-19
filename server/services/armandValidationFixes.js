/** Dev fix notes — keep in sync with src/data/armandValidationFixes.js */
export const DEV_FIX_NOTES = {
  A7: 'Correction déployée : vider une cellule équipement (Ctrl+A + Backspace) supprime bien le poste — prix à 0, sans réinjection auto serrure / garniture / FP. Merci de retester sur la grille.',
  A9: 'Correction déployée : FB5 en saisie est chiffré en FB6 avec alerte « FB5 non au tarif → chiffré en FB6 ». Merci de confirmer sur une ligne FB5.',
  A10: 'Correction déployée : R061 (FP TS-5000 + plinthe encastrée) s’applique uniquement aux BP — plus sur châssis fixe ni guichet. L’effacement manuel reste possible (voir A7). Merci de retester BP vs châssis.',
  A5: 'Correction déployée : performance CEM (Oui/Non) dans la bandeau performances — chiffrage 990 € HT / vantail « Joints blindage CEM (électromagnétique) ». Ce n’est plus l’option « joint acoustique » provisoire. Merci de valider libellé et montant.',
  A1: 'Correction déployée : menu serrure CR6 propose 4172 et 4176 (4185 déplacée en accessoire). Prix 4176 provisoire — merci de confirmer la référence tarif exacte.',
  B4: 'Correction déployée : le poids (kg) apparaît dans le PDF devis (même désignation longue) et sur les fiches détail. Merci de générer un PDF test.',
  B5: 'Correction déployée : geste commercial saisissable en € HT ou en % (sélecteur en bas de grille). Merci de tester les deux modes.',
  C2: 'Correction déployée : bandeau rouge « taux de change à valider » visible en haut de toutes les pages admin, pas seulement l’onglet taux.',
  A6: 'Correction déployée : CR4+FB4+EI60 en H2300×L1150 est reconnu comme combinaison compatible (matrice statique + lecture des slots RC/PB/CF en « CR4 » / « FB4 » / « EI60 »). Chiffrage : base CR4 5 962 € + options EI60 + FB4 ; avis de chantier FB4+EI60 (3 700 €, une fois par devis) — pas de blocage ❌. Merci de retester sur la grille.',
}
