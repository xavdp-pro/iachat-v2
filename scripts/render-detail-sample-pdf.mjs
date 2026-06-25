#!/usr/bin/env node
/**
 * Generate sample detail sheets PDF (1V + 2V) for Armand validation.
 * Usage: node scripts/render-detail-sample-pdf.mjs [output.pdf]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDetailSheetsPdf } from '../server/devis-detail-pdf.js'

const out = resolve(process.argv[2] || 'public/validation/samples/fiches-detail-echantillon-1v-2v.pdf')
mkdirSync(dirname(out), { recursive: true })

const devis = {
  id: 106,
  quote_number: '605.0106',
  name: 'The Hive — échantillon validation',
  client_name: 'AAV Contractors SA',
  analysis_json: JSON.stringify({ affaire: 'The Hive' }),
}

const lines = [
  {
    line_section: 'products',
    designation: 'BLOC-PORTE "NEXUS" UN VANTAIL\nTeinte RAL 7016\nEquipement fourni-posé :\n- Serrure Dény LSS 5 pts — réf. 4150\n- Ferme-porte TS-5000 bras glissière',
    localisation: 'Hall principal — Type A',
    type_porte: 'BP 1V',
    gamme: 'CR4',
    vantail: '1V',
    hauteur_mm: 2300,
    largeur_mm: 1150,
    weight_kg: 185,
    serrure_ref: '4150',
    ferme_porte_ref: 'TS-5000',
    raw_json: JSON.stringify({
      opening_sense: 'A',
      barre_seuil: 'avec',
      exposition_intemperies: false,
    }),
  },
  {
    line_section: 'products',
    designation: 'BLOC-PORTE PYROPLUS 60 DEUX VANTAUX\nSens B\nSans barre de seuil',
    localisation: 'Cuisine — Type B',
    type_porte: 'BP 2V',
    gamme: 'CR3',
    vantail: '2V',
    hauteur_mm: 2779,
    largeur_mm: 2024,
    weight_kg: 312,
    serrure_ref: 'KEL 166',
    ferme_porte_ref: 'TS-5000',
    raw_json: JSON.stringify({
      opening_sense: 'B',
      barre_seuil: 'sans',
      exposition_intemperies: false,
    }),
  },
]

const { buffer, filename } = await buildDetailSheetsPdf({ devis, lines })
writeFileSync(out, buffer)
console.log(`Wrote ${out} (${buffer.length} bytes) — ${filename}`)
