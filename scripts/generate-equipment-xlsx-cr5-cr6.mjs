#!/usr/bin/env node
/**
 * Generate Equipements de portes - CR5/CR6/EI/FB/BLAST.xlsx from the CR4 template.
 * CR5/CR6 serrure columns follow CR5.md / CR6.md + SERRURES-GARNITURES.md.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const NEW_DIR = join(__dirname, '../../ressources/XLSX/2606/NEW')
const TEMPLATE = join(NEW_DIR, 'Equipements de portes - CR4.xlsx')

const GENERATOR_PY = `
import json, shutil, sys
from pathlib import Path
import openpyxl

template = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
targets = json.loads(sys.argv[3])

COLUMN_INDEX = {
    'serrure': (1, 2),
    'garniture_int': (3, 4),
    'garniture_ext': (5, 6),
    'cremone': (7, 8),
    'fp': (9, 10),
    'contact': (11, 12),
    'plinthe': (13, 14),
    'vitrage': (15, 16),
    'protection': (17, 18),
    'options_serrure': (19, 20),
    'autres': (21, 22),
}

SEEDS = {
    'CR5': {
        'serrure': [
            ('section', None, 'Serrures Dény LSS profil européen (en applique)'),
            ('item', '4120', 'Dény LSS méca — 3 pts + cyl. européen'),
            ('item', '4122', 'Dény LSS auto — 3 pts sortie libre'),
            ('item', '4185', 'Option contacts de position'),
            ('item', '4126', 'Dény LSS motorisée — sortie libre'),
            ('item', '4128', 'Dény LSS motorisée — sortie contrôlée DAS'),
            ('section', None, 'Serrures Dény LSS profil rond (en applique) — CR5'),
            ('item', '4150', 'Dény LSS méca — 5 points + cyl. rond (défaut CR5)'),
            ('item', '4140', 'Dény LSS méca — 4 pts + cyl. rond'),
            ('item', '4142', 'Dény LSS auto — 4 pts sortie libre + cyl. rond'),
            ('item', '4146', 'Dény LSS motorisée — sortie libre + cyl. rond'),
            ('item', '4148', 'Dény LSS motorisée — sortie contrôlée DAS + cyl. rond'),
        ],
        'autres_add': [
            ('item', None, 'FB4 (pare-balles) — + 1 100 € TG'),
            ('item', None, 'FB6 (pare-balles) — + 3 850 € TG'),
            ('item', None, 'Joints blindage CEM — + 990 € TG / vantail'),
            ('item', None, '45 dB — + 350 € TG + réf. 4472/4476'),
        ],
    },
    'CR6': {
        'serrure': [
            ('section', None, 'Serrures Dény LSS 7 points (obligatoire CR6)'),
            ('item', '4172', 'Dény LSS méca 7 pts — modèle Satyx, cyl. européen (défaut CR6)'),
            ('item', '4185', 'Option contacts de position'),
        ],
        'autres_add': [
            ('item', None, 'EI² 30 (max L 1340 H 2600) — + 1 500 € TG'),
            ('item', None, 'EI² 60 (max L 1240 H 2300) — + 2 000 € TG'),
            ('item', None, 'FB4 (pare-balles) — + 1 100 € TG (compatible feu)'),
            ('item', None, 'FB6 (pare-balles) — + 3 300 € TG (compatible feu)'),
            ('item', None, 'FB7 (pare-balles) — + 8 000 € TG (non compatible feu)'),
            ('item', None, 'Joints blindage CEM — + 990 € TG / vantail'),
            ('item', None, '45 dB — + 350 € TG + réf. 4472/4476'),
        ],
    },
    'EI60': {
        'serrure': [
            ('section', None, 'Serrures MSL encastrées (recommandées EI60)'),
            ('item', '4074', 'MSL auto — sortie libre, poignée fixe'),
            ('item', '4076', 'MSL auto — sortie libre, béquille ext.'),
            ('item', '4078', 'MSL motorisée — sans contacts'),
            ('item', '4080', 'MSL motorisée — avec contacts AWS'),
            ('section', None, 'Serrures Dény LSS (applique)'),
            ('item', '4122', 'LSS auto 3 pts sortie libre'),
            ('item', '4126', 'LSS motorisée sortie libre'),
            ('item', '4128', 'LSS motorisée sortie contrôlée DAS'),
            ('section', None, 'Serrures Abloy KEL (encastrées)'),
            ('item', '4102', 'KEL 166 auto 3 pts + cyl.'),
            ('item', '4104', 'KEL 566 électrique contrôle béquille'),
            ('item', '4106', 'KEL 567 sortie contrôlée DAS'),
            ('item', '4108', 'KMP 520 motorisée'),
        ],
        'autres_add': [
            ('item', None, 'Option CR3 — + 315 € TG + équipements gamme CR3'),
            ('item', None, 'FB4 (pare-balles) — + 1 100 € TG'),
            ('item', None, 'Joints blindage CEM — + 990 € TG / vantail'),
            ('item', None, '45 dB — + 350 € TG + réf. 4472/4476'),
        ],
    },
    'EI120': {
        'serrure': [
            ('section', None, 'Serrures MSL + rallonges (EI120)'),
            ('item', '4074', 'MSL auto — sortie libre, poignée fixe'),
            ('item', '4076', 'MSL auto — sortie libre, béquille ext.'),
            ('item', '4078', 'MSL motorisée — sans contacts'),
            ('item', '4080', 'MSL motorisée — avec contacts AWS'),
            ('item', '4085', 'Rallonge 350 mm'),
            ('item', '4086', 'Rallonge 550 mm'),
            ('item', '4087', 'Rallonge 800 mm'),
            ('item', '4088', 'Rallonge 1000 mm'),
        ],
        'autres_add': [
            ('item', None, 'Option CR3 — + 385 € TG + équipements gamme CR3'),
            ('item', None, 'CR4 — se reporter au tarif CR4 + option EI120'),
            ('item', None, 'FB4 — + 1 900 € TG'),
            ('item', None, 'Joints blindage CEM — + 990 € TG / vantail'),
            ('item', None, '45 dB — + 630 € TG'),
        ],
    },
    'FB6': {
        'serrure': [
            ('section', None, 'Serrures MSL encastrées (FB6)'),
            ('item', '4070', 'MSL méca — 1 pt + 3 dormants + cyl.'),
            ('item', '4072', 'MSL méca — 3 pts + 3 dormants + cyl.'),
            ('item', '4074', 'MSL auto — sortie libre, poignée fixe'),
            ('item', '4076', 'MSL auto — sortie libre, béquille ext.'),
            ('item', '4078', 'MSL motorisée — sans contacts'),
            ('item', '4080', 'MSL motorisée — avec contacts AWS'),
            ('section', None, 'Serrures Dény LSS profil européen (FB6)'),
            ('item', '4120', 'LSS méca 3 pts + cyl. européen'),
            ('item', '4122', 'LSS auto 3 pts sortie libre'),
            ('item', '4185', 'Option contacts de position'),
            ('item', '4126', 'LSS motorisée sortie libre'),
            ('item', '4128', 'LSS motorisée sortie contrôlée DAS'),
            ('section', None, 'Serrures Abloy KEL (encastrées)'),
            ('item', '4102', 'KEL 166 auto 3 pts + cyl. européen'),
            ('item', '4104', 'KEL 566 électrique contrôle béquille + cyl.'),
            ('item', '4106', 'KEL 567 électrique sortie contrôlée DAS + cyl.'),
            ('item', '4108', 'KMP 520 motorisée + cyl.'),
        ],
        'autres_add': [
            ('item', None, 'CR4 (anti-effraction) — + 600 € TG + serrure gamme CR4'),
            ('item', None, 'CR5 — partir sur NEXUS CR5 avec option FB6'),
            ('item', None, 'EI 30 — + 1 700 € TG + avis de chantier'),
            ('item', None, 'EI 60 — + 2 200 € TG + avis de chantier'),
            ('item', None, 'EI 120 — + 3 000 € TG + avis de chantier'),
            ('item', None, 'Joints blindage CEM — + 990 € TG / vantail'),
            ('item', None, '45 dB — + 350 € TG + réf. 4472/4476'),
        ],
    },
    'FB7': {
        'serrure': [
            ('section', None, 'Serrures MSL encastrées (FB7)'),
            ('item', '4070', 'MSL méca — 1 pt + 3 dormants + cyl.'),
            ('item', '4072', 'MSL méca — 3 pts + 3 dormants + cyl.'),
            ('item', '4074', 'MSL auto — sortie libre, poignée fixe'),
            ('item', '4076', 'MSL auto — sortie libre, béquille ext.'),
            ('item', '4078', 'MSL motorisée — sans contacts'),
            ('item', '4080', 'MSL motorisée — avec contacts AWS'),
            ('section', None, 'Serrures Dény LSS profil européen (FB7)'),
            ('item', '4120', 'LSS méca 3 pts + cyl. européen'),
            ('item', '4122', 'LSS auto 3 pts sortie libre'),
            ('item', '4185', 'Option contacts de position'),
            ('item', '4126', 'LSS motorisée sortie libre'),
            ('item', '4128', 'LSS motorisée sortie contrôlée DAS'),
        ],
        'autres_add': [
            ('item', None, 'Classement CR3 automatique si serrure gamme CR3 montée'),
            ('item', None, 'EI 30/60/120 — avis de chantier selon tarif FB'),
            ('item', None, 'Joints blindage CEM — + 990 € TG / vantail'),
            ('item', None, '45 dB — + 350 € TG + réf. 4472/4476'),
        ],
    },
    'BLAST': {
        'serrure': [
            ('section', None, 'Serrures Blast (LSS 4 pts minimum sur vantail de service)'),
            ('item', '4132', 'Serrure automatique Dény LSS 4 points sortie libre (défaut Blast)'),
            ('item', '4120', 'LSS méca 3 pts + cyl. européen'),
            ('item', '4122', 'LSS auto 3 pts sortie libre'),
            ('item', '4126', 'LSS motorisée sortie libre'),
            ('item', '4128', 'LSS motorisée sortie contrôlée DAS'),
            ('item', '4140', 'LSS méca 4 pts + cyl. rond'),
            ('item', '4142', 'LSS auto 4 pts sortie libre + cyl. rond'),
        ],
        'autres_add': [
            ('item', '4401', 'Crémone de sécurité sortie libre (vantail semi-fixe Blast)'),
            ('item', '4402', 'Crémone de sécurité sans sortie libre (vantail semi-fixe)'),
            ('item', None, 'Blast 0,5 t/m² — option sur BP existant'),
            ('item', None, 'Note de calcul explosion (Blast ≥ 2t) — 9 300 € HT non remisable'),
            ('item', None, 'EI 60 — + 1 000 € TG + avis de chantier'),
            ('item', None, 'EI 120 — + 2 500 € TG + avis de chantier'),
            ('item', None, 'CR3 — + 315 € TG'),
            ('item', None, 'CR4 — + 1 500 € TG'),
            ('item', None, 'FB4 — + 1 100 € TG'),
            ('item', None, 'FB6 — + 3 000 € TG'),
            ('item', '4850', 'Vitrage anti-explosion ER1-NS'),
        ],
    },
    'EI30': {
        'serrure': [
            ('section', None, 'Serrures MSL encastrées (EI30)'),
            ('item', '4074', 'MSL auto — sortie libre, poignée fixe'),
            ('item', '4076', 'MSL auto — sortie libre, béquille ext.'),
            ('item', '4078', 'MSL motorisée — sans contacts'),
            ('item', '4080', 'MSL motorisée — avec contacts AWS'),
        ],
        'autres_add': [
            ('item', None, 'Option CR3 — + 315 € TG'),
            ('item', None, 'FB4 (pare-balles) — + 1 100 € TG'),
            ('item', None, 'Joints blindage CEM — + 990 € TG / vantail'),
        ],
    },
    'FB4': {
        'serrure': [
            ('section', None, 'Serrures MSL encastrées (FB4)'),
            ('item', '4070', 'MSL méca — 1 pt + 3 dormants + cyl. (défaut FB)'),
            ('item', '4072', 'MSL méca — 3 pts + 3 dormants + cyl.'),
            ('item', '4074', 'MSL auto — sortie libre, poignée fixe'),
            ('item', '4076', 'MSL auto — sortie libre, béquille ext.'),
            ('section', None, 'Serrures Dény LSS (applique)'),
            ('item', '4120', 'LSS méca 3 pts + cyl. européen'),
            ('item', '4122', 'LSS auto 3 pts sortie libre'),
        ],
        'autres_add': [
            ('item', None, 'CR3 — classement automatique si serrure CR3 montée'),
            ('item', None, 'EI 30/60/120 — avis de chantier selon tarif FB'),
            ('item', None, 'Joints blindage CEM — + 990 € TG / vantail'),
        ],
    },
    'PRISON': {
        'serrure': [
            ('section', None, 'Serrures Prison / pénitentiaire'),
            ('item', '4304', 'Réservation serrure mécanique Dény 46198NV (défaut)'),
        ],
        'garniture_int': [
            ('section', None, 'Garnitures intérieures'),
            ('item', None, 'Aucune garniture intérieure (standard)'),
        ],
        'garniture_ext': [
            ('section', None, 'Garnitures extérieures'),
            ('item', '4030', 'Poignée de tirage extérieure inox courte 150 mm'),
        ],
        'autres_add': [
            ('item', None, 'Ferme-porte obligatoire si performance coupe-feu'),
            ('item', None, 'Joints blindage CEM — + 990 € TG'),
        ],
    },
    'ANTI-BELIER': {
        'serrure': [
            ('section', None, 'Serrures Anti-bélier'),
            ('item', '4304', 'Réservation serrure mécanique Dény 46198NV (défaut)'),
        ],
        'garniture_ext': [
            ('section', None, 'Garnitures extérieures'),
            ('item', '4030', 'Poignée de tirage extérieure inox courte 150 mm'),
        ],
        'autres_add': [
            ('item', None, 'Non cumulable avec BP 2 vantaux au tarif'),
        ],
    },
    'EF2': {
        'serrure': [
            ('section', None, 'Serrures EF2'),
            ('item', '4150', 'Serrure mécanique Dény LSS 5 points (défaut EF2)'),
            ('item', '4120', 'LSS méca 3 pts + cyl. européen'),
            ('item', '4122', 'LSS auto 3 pts sortie libre'),
            ('item', '4126', 'LSS motorisée sortie libre'),
        ],
        'garniture_int': [
            ('section', None, 'Garniture intérieure'),
            ('item', '4181', 'Béquille intérieure inox pour serrure LSS'),
        ],
        'garniture_ext': [
            ('section', None, 'Garniture extérieure'),
            ('item', '4032', 'Poignée de tirage extérieure inox 350 mm'),
        ],
        'autres_add': [
            ('item', None, 'Joints blindage CEM — + 990 € TG / vantail'),
        ],
    },
}

def clear_column(ws, ref_col, label_col, start_row=2):
    for row in range(start_row, ws.max_row + 1):
        ws.cell(row, ref_col).value = None
        ws.cell(row, label_col).value = None

def write_column(ws, ref_col, label_col, entries, start_row=2):
    row = start_row
    for kind, ref, label in entries:
        if kind == 'section':
            ws.cell(row, ref_col).value = None
            ws.cell(row, label_col).value = label
        else:
            ws.cell(row, ref_col).value = ref or '_'
            ws.cell(row, label_col).value = label
        row += 1
    return row

def append_autres(ws, entries):
    ref_col, label_col = COLUMN_INDEX['autres']
    row = ws.max_row + 1
    while row > 2 and not ws.cell(row - 1, label_col).value and not ws.cell(row - 1, ref_col).value:
        row -= 1
    if ws.cell(row, label_col).value or ws.cell(row, ref_col).value:
        row += 1
    write_column(ws, ref_col, label_col, entries, start_row=row)

results = []
for perf in targets:
    seed = SEEDS.get(perf)
    if not seed:
        results.append({'performance': perf, 'error': 'no_seed'})
        continue
    out_path = out_dir / f'Equipements de portes - {perf}.xlsx'
    shutil.copy2(template, out_path)
    wb = openpyxl.load_workbook(out_path)
    ws = wb.active
    ref_col, label_col = COLUMN_INDEX['serrure']
    clear_column(ws, ref_col, label_col)
    write_column(ws, ref_col, label_col, seed['serrure'])
    for extra_col in ('garniture_int', 'garniture_ext'):
        if seed.get(extra_col):
            c_ref, c_lbl = COLUMN_INDEX[extra_col]
            clear_column(ws, c_ref, c_lbl)
            write_column(ws, c_ref, c_lbl, seed[extra_col])
    if seed.get('autres_add'):
        append_autres(ws, seed['autres_add'])
    wb.save(out_path)
    results.append({'performance': perf, 'file': str(out_path)})

print(json.dumps(results, ensure_ascii=False))
`

const BOOTSTRAP_PERFORMANCES = ['CR5', 'CR6', 'EI30', 'EI60', 'EI120', 'FB4', 'FB6', 'FB7', 'BLAST', 'PRISON', 'ANTI-BELIER', 'EF2']

async function main() {
  const targets = process.argv.slice(2).length
    ? process.argv.slice(2).map(p => String(p).toUpperCase().replace(/^RC/, 'CR'))
    : BOOTSTRAP_PERFORMANCES

  if (!existsSync(TEMPLATE)) {
    console.error(`Template missing: ${TEMPLATE}`)
    process.exit(1)
  }

  const { stdout } = await execFileAsync(
    'python3',
    ['-c', GENERATOR_PY, TEMPLATE, NEW_DIR, JSON.stringify(targets)],
    { maxBuffer: 2 * 1024 * 1024 },
  )
  const results = JSON.parse(stdout || '[]')
  console.log('Generated equipment XLSX:')
  for (const row of results) console.log(`- ${row.performance}: ${row.file}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
