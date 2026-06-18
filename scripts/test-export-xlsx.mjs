#!/usr/bin/env node
/**
 * Smoke test for grid XLSX export renderer.
 */
import { writeFile } from 'node:fs/promises'
import { renderGridXlsxBuffer } from '../server/lib/renderGridXlsx.js'

const payload = {
  filename: 'test-grid-export.xlsx',
  headers: ['#', 'Désignation', 'Localisation', 'Perfs', 'H (HT)', 'L (HT)', 'H (PL)', 'L (PL)', 'TL', 'Serrure', 'Garniture int.', 'Garniture ext.', 'Autres équipements', 'Crémone', 'Ferme-porte', 'Contact', 'Passe-câble', 'Plinthe', 'Ventouse', 'Vitrage', 'Judas', 'Paumelle', 'PU HT', 'Remise', 'Q.', 'Total HT'],
  body: [
    {
      rowType: 'main',
      cells: [
        { v: 'A', p: 'normal' }, { v: 'NEXUS CR4 — 1 VANTAIL', p: 'yellow' }, { v: 'Hall', p: 'yellow' }, { v: 'CR4', p: 'yellow' },
        { v: 2180, p: 'yellow' }, { v: 960, p: 'yellow' }, { v: 2110, p: 'yellow' }, { v: 755, p: 'yellow' },
        { v: 'RAL 7016', p: 'yellow' }, { v: 'MSL 4070', p: 'yellow' }, { v: 'Béquille 4023', p: 'yellow' }, { v: '—', p: 'yellow' }, { v: '—', p: 'yellow' },
        { v: '—', p: 'yellow' }, { v: 'TS-5000', p: 'yellow' }, { v: '—', p: 'yellow' }, { v: '—', p: 'yellow' }, { v: 'Plinthe auto', p: 'yellow' },
        { v: '—', p: 'yellow' }, { v: 'Vitrage std', p: 'yellow' }, { v: '—', p: 'yellow' }, { v: '—', p: 'yellow' },
        { v: 5962, p: 'gray' }, { v: 1, p: 'yellow' }, { v: 1, p: 'yellow' }, { v: 5962, p: 'blue' },
      ],
    },
    {
      rowType: 'sub',
      cells: [
        { v: '', p: 'subrow' }, { v: 'Références', p: 'subrow' }, { v: '', p: 'subrow' }, { v: '', p: 'subrow' },
        { v: '', p: 'subrow' }, { v: '', p: 'subrow' }, { v: '', p: 'subrow' }, { v: '', p: 'subrow' },
        { v: '209', p: 'gray' }, { v: '4070', p: 'yellow' }, { v: '4023', p: 'yellow' }, { v: '', p: 'yellow' }, { v: '', p: 'yellow' },
        { v: '', p: 'yellow' }, { v: '3660', p: 'yellow' }, { v: '', p: 'yellow' }, { v: '', p: 'yellow' }, { v: '4472', p: 'yellow' },
        { v: '', p: 'yellow' }, { v: '4803', p: 'yellow' }, { v: '', p: 'yellow' }, { v: '', p: 'yellow' },
        { v: '', p: 'subrow' }, { v: '', p: 'subrow' }, { v: '', p: 'subrow' }, { v: '', p: 'subrow' },
      ],
    },
    {
      rowType: 'sub',
      cells: [
        { v: '', p: 'subrow' }, { v: 'Prix unitaires', p: 'subrow' }, { v: '', p: 'subrow' }, { v: '', p: 'subrow' },
        { v: '', p: 'subrow' }, { v: '', p: 'subrow' }, { v: '', p: 'subrow' }, { v: '', p: 'subrow' },
        { v: 120, p: 'gray' }, { v: 450, p: 'yellow' }, { v: 80, p: 'yellow' }, { v: '', p: 'yellow' }, { v: '', p: 'yellow' },
        { v: '', p: 'yellow' }, { v: 280, p: 'yellow' }, { v: '', p: 'yellow' }, { v: '', p: 'yellow' }, { v: 350, p: 'yellow' },
        { v: '', p: 'yellow' }, { v: 0, p: 'yellow' }, { v: '', p: 'yellow' }, { v: '', p: 'yellow' },
        { v: '', p: 'subrow' }, { v: '', p: 'subrow' }, { v: '', p: 'subrow' }, { v: '', p: 'subrow' },
      ],
    },
  ],
  footer: [
    { label: 'Total général HT', value: 5962, palette: 'blue' },
    { label: 'Geste commercial', value: 0, palette: 'yellow' },
    { label: 'TVA (20.0 %)', value: 1192.4, palette: 'normal' },
    { label: 'Total TTC', value: 7154.4, palette: 'green' },
  ],
}

const out = process.argv[2] || '/tmp/test-grid-export.xlsx'
const buffer = await renderGridXlsxBuffer(payload)
await writeFile(out, buffer)
console.log(`Wrote ${out} (${buffer.length} bytes)`)
