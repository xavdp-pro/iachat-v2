#!/usr/bin/env node
/**
 * Generate a sample PDF aligned with 605.0106 - The Hive reference.
 * Usage: node scripts/render-hive-sample-pdf.mjs [output.pdf]
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildDevisNexusPdf } from '../server/devis-pdf.js'

const out = resolve(process.argv[2] || '/tmp/hive-sample.pdf')

const lineA = `BLOC-PORTE PYROPLUS 60 DEUX VANTAUX
Performances coupe-feu EI² 60 minutes recto-verso
Coefficient de transmission thermique Uw = 1,4 W/m².K
Affaiblissement phonique Rw = 51 dB (-2;-6)
Classement anti-effraction niveau CR3 selon normes EN 1627 - 1630
Vantail en tôle épaisseur 20/10° double face
Dimensions sur mesure : L 1800 H 2700 Passage libre à 90°
Vantaux égaux soit 2 vantaux largeur 974,5
Soit dimensions hors-tout : L 2024 H 2779
Réservation gros oeuvre prévoir : L 2034 H 2789
Poids approximatif - Vantail de service nu : 150 kg - Vantail semi-fixe nu : 150 kg - Bâti : 45 kg
Finition : acier galvanisé + thermolaquage classement C5 teinte RAL au choix
Equipement fourni-posé :
- Serrure 3 points modèle Abloy KEL 166 à sortie libre (manœuvre ext par clé uniquement)
- Béquille int / Poignée palière ext sur plaque blindée aluminium - argent
- Cylindre PZ de chantier longueur 55+45 CP
- Crémone automatique renforcée à tringles encastrées sur semi-fixe - inox
- Ferme-porte bras glissière modèle TS-5000 sur chaque vantail - argent
- Sélecteur de fermeture à bandeau pour ferme-porte TS-3000V ou TS-5000 - argent
- Barre de seuil + plinthe automatique encastrée
- Pions antidégondage
- 3 paumelles avec butée à bille inox
Localisation : Type 1`

const lineB = `BLOC-PORTE PYROPLUS 60 UN VANTAIL
Performances coupe-feu EI² 60 minutes recto-verso
Coefficient de transmission thermique Uw = 1,4 W/m².K
Affaiblissement phonique Rw = 52 dB (-1;-5)
Classement anti-effraction niveau CR3 selon normes EN 1627 - 1630
Vantail en tôle épaisseur 20/10° double face
Dimensions sur mesure : L 950 H 2700 Passage libre à 90°
Soit dimensions hors-tout : L 1100 H 2779
Réservation gros oeuvre prévoir : L 1110 H 2789
Poids approximatif - Vantail nu : 110 kg - Bâti 39 kg
Finition : acier galvanisé + thermolaquage classement C5 teinte RAL au choix
Equipement fourni-posé :
- Serrure 3 points modèle Abloy KEL 166 à sortie libre (manœuvre ext par clé uniquement)
- Béquille int / Poignée palière ext sur plaque blindée aluminium - argent
- Cylindre PZ de chantier longueur 55+45 CP
- Ferme-porte bras glissière modèle TS-5000 - argent
- Sélecteur de fermeture à bandeau pour ferme-porte TS-5000V ou TS-5000 - argent
- Barre de seuil + plinthe automatique encastrée
- Pions antidégondage
- 4 paumelles avec boite à bille inox
Localisation : Type 2`

const devis = {
  id: 106,
  quote_number: '605.0106',
  name: 'The Hive',
  client_name: 'AAV Contractors SA',
  currency: 'CHF',
  tva_rate: 0.081,
  commercial_discount_ht: 0,
  total_ht: 37693,
  created_at: '2026-05-29T10:00:00.000Z',
  analysis_json: JSON.stringify({
    affaire: 'The Hive',
    delivery_address: 'AAV Contractors SA\nChemin du Tourbillon 6\n1228 Plan-les-Ouates\nSuisse',
    billing_address: 'AAV Contractors SA\nM. Claude Burnat\nChemin du Tourbillon 6\n1228 Plan-les-Ouates\nSuisse',
  }),
}

const lines = [
  {
    line_section: 'products',
    designation: lineA,
    localisation: 'Type 1',
    gamme: 'CR3',
    vantail: '2V',
    hauteur_mm: 2779,
    largeur_mm: 2024,
    total_ligne_ht: 11983,
    prix_base_ht: 11983,
    qty: 1,
  },
  {
    line_section: 'products',
    designation: lineB,
    localisation: 'Type 2',
    gamme: 'CR3',
    vantail: '1V',
    hauteur_mm: 2779,
    largeur_mm: 1100,
    total_ligne_ht: 6863,
    prix_base_ht: 6863,
    qty: 1,
  },
  {
    line_section: 'products',
    designation: lineB.replace('Localisation : Type 2', 'Localisation : Type 3').replace('Vantail nu : 110 kg', 'Vantail nu : 161 kg'),
    localisation: 'Type 3',
    gamme: 'CR3',
    vantail: '1V',
    hauteur_mm: 2779,
    largeur_mm: 1100,
    total_ligne_ht: 6863,
    prix_base_ht: 6863,
    qty: 1,
    raw_json: JSON.stringify({ pdf_page_break_before: true }),
  },
  {
    line_section: 'products',
    designation: lineA.replace('Localisation : Type 1', 'Localisation : Type 4'),
    localisation: 'Type 4',
    gamme: 'CR3',
    vantail: '2V',
    hauteur_mm: 2779,
    largeur_mm: 2024,
    total_ligne_ht: 11983,
    prix_base_ht: 11983,
    qty: 1,
  },
  {
    line_section: 'transport',
    designation: 'FORFAIT PORT (1228 - PLAN-LES-OUATES)',
    total_ligne_ht: 450,
    prix_base_ht: 450,
    qty: 1,
    raw_json: JSON.stringify({
      delivery_address: 'AAV Contractors SA\nChemin du Tourbillon 6\n1228 Plan-les-Ouates\nSuisse',
    }),
  },
  {
    line_section: 'note',
    designation: "NOTA\nSeul le bloc-porte Doortal Pyroplus 120 est référencé à l'AEAI ; homologation individuelle à réaliser pour Pyroplus 60",
  },
]

const { buffer, filename } = await buildDevisNexusPdf({ devis, lines })
writeFileSync(out, buffer)
console.log(`Wrote ${out} (${buffer.length} bytes) — ${filename}`)
