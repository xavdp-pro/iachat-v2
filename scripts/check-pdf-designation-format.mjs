import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import { buildDevisNexusPdf } from '../server/devis-pdf.js';

const outDir = path.resolve('tmp/pdf-checks');
const outFile = path.join(outDir, 'designation-format-check.pdf');

const malformedGridDesignation = [
  'BP 2V',
  'PL H3410xL2520 mm | Réservation GO H3490xL2800 mm | EI60 (2200,00 €), Serrure CR4 (défaut) (2473,00 €), Crémone vantail semi-fixe + VAM haut (818,00 €), Garniture intérieure CR4 (défaut), Garniture extérieure CR4 (défaut) (192,00 €) | Serrure : 4120 — Serrure mécanique Dény LSS 3 points (défaut CR4 — voir SERRURES-GARNITURES.md)',
].join('\n');

const repereRegressionLines = Array.from({ length: 27 }, (_, index) => ({
  line_section: 'products',
  type_porte: 'BP 1V',
  designation: `Repère test ${index + 2}`,
  total_ligne_ht: 0,
}));

const { buffer } = await buildDevisNexusPdf({
  devis: {
    id: 6050098,
    name: '605.0098',
    quote_number: '605.0098',
    client_name: 'Dény',
    total_ht: 1234,
    created_at: new Date().toISOString(),
  },
  lines: [
    {
      line_section: 'products',
      type_porte: 'BP 2V',
      designation: malformedGridDesignation,
      hauteur_mm: 2520,
      largeur_mm: 3410,
      total_ligne_ht: 1234,
    },
    ...repereRegressionLines,
  ],
});

await mkdir(outDir, { recursive: true });
await writeFile(outFile, buffer);

const parser = new PDFParse({ data: buffer });
let text = '';
try {
  const result = await parser.getText();
  text = result.text || '';
} finally {
  await parser.destroy();
}

const hasPipeSeparatedDesignation = /\|\s*(?:Réservation|Serrure|EI\d|Remplissage|Garniture)\b/i.test(text);
const hasPricingInDesignation = /\b(?:EI\d{2,3}|Serrure|Crémone|Garniture|Remplissage)\b[^\n]*\d[\d\s]*(?:,\d{2})?\s*€/i.test(text);
const hasInternalReference = /SERRURES-GARNITURES\.md|voir\s+[^\n]*\.md/i.test(text);
const hasPackedCommaOptions = /\bSerrure\b[^\n]*,\s*Crémone\b|\bGarniture intérieure\b[^\n]*,\s*Garniture extérieure\b/i.test(text);
const hasRepereAA = /\bAA\s+REPÈRE TEST 27\b/.test(text);
const hasRepereAB = /\bAB\s+REPÈRE TEST 28\b/.test(text);
const hasNumericRepereAfterZ = /\b(?:27|28)\s+REPÈRE TEST\b/.test(text);
const expectedRows = [
  'BP 2V',
  'PL H3410xL2520 mm',
  'Réservation GO H3490xL2800 mm',
  'EI60',
  'Crémone vantail semi-fixe + VAM haut',
  'Garniture intérieure CR4',
  'Garniture extérieure CR4',
  'Serrure : 4120 — Serrure mécanique Dény LSS 3 points',
];
const missingRows = expectedRows.filter(row => !text.includes(row));

console.log(`PDF généré: ${outFile}`);
console.log('--- Extrait texte PDF ---');
console.log(text.split('\n').filter(Boolean).slice(0, 45).join('\n'));

if (hasPipeSeparatedDesignation || hasPricingInDesignation || hasInternalReference || hasPackedCommaOptions || !hasRepereAA || !hasRepereAB || hasNumericRepereAfterZ || missingRows.length) {
  console.error('Format désignation PDF invalide.');
  if (hasPipeSeparatedDesignation) console.error('Des séparateurs | restent visibles dans la désignation.');
  if (hasPricingInDesignation) console.error('Des prix restent visibles dans la désignation.');
  if (hasInternalReference) console.error('Des références internes .md restent visibles dans la désignation.');
  if (hasPackedCommaOptions) console.error('Des équipements restent compactés sur une ligne à virgules.');
  if (!hasRepereAA || !hasRepereAB) console.error('Les repères après Z ne sortent pas en AA/AB.');
  if (hasNumericRepereAfterZ) console.error('Un repère numérique apparaît après Z.');
  if (missingRows.length) console.error(`Lignes attendues absentes: ${missingRows.join(', ')}`);
  process.exit(1);
}

console.log('Format désignation PDF OK: lignes métier séparées, repères AA/AB, sans prix ni références internes.');
