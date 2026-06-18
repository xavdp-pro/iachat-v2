#!/usr/bin/env node
/**
 * Generate sample detail sheets PDF for preview.
 * Usage: node scripts/render-detail-sample-pdf.mjs [output.pdf]
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildDetailSheetsPdf } from '../server/devis-detail-pdf.js'

const out = resolve(process.argv[2] || '/tmp/detail-sample.pdf')

const devis = {
  id: 106,
  quote_number: '605.0106',
  name: 'The Hive',
  client_name: 'AAV Contractors SA',
  analysis_json: JSON.stringify({ affaire: 'The Hive' }),
}

const lines = [
  {
    line_section: 'products',
    designation: 'BLOC-PORTE PYROPLUS 60 DEUX VANTAUX\nSens B\nSans barre de seuil',
    localisation: 'Type 1',
    type_porte: 'BP 2V',
    gamme: 'CR3',
    vantail: '2V',
    hauteur_mm: 2779,
    largeur_mm: 2024,
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
