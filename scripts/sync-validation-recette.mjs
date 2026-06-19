#!/usr/bin/env node
/**
 * Regenerate public/validation/recette.md from armandValidationGuide.js
 */
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { guideForItem } from '../src/data/armandValidationGuide.js'
import { JALONS as ROADMAP_JALONS, FILES_BLOCKERS as ROADMAP_FILES, ROADMAP_META } from '../src/data/armandValidationRoadmap.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public/validation/recette.md')

function section(items, title) {
  let md = `## ${title}\n\n`
  for (const item of items) {
    const g = guideForItem(item.id)
    md += `### ${item.id} — ${item.label}\n\n`
    if (g.appLink) {
      md += `**Lien app :** [${g.appLinkLabel || 'Ouvrir'}](https://devis.zerux.com${g.appLink})\n\n`
    }
    md += '**Vérification :**\n'
    for (const step of g.verifySteps || []) md += `- ${step}\n`
    if (g.verifyCmd) md += `\n\`\`\`bash\n${g.verifyCmd}\n\`\`\`\n`
    md += '\n'
  }
  return md
}

let md = `# Recette validation Partie 2 — devis.zerux.com

> MAJ ${ROADMAP_META.updatedAt} · Page interactive : [https://devis.zerux.com/validation/](https://devis.zerux.com/validation/)

## Démarrage rapide

1. Se connecter : [https://devis.zerux.com/login](https://devis.zerux.com/login)
2. Ouvrir la page validation (lien avec token pour Armand)
3. Sur chaque ligne : **Lien app** → tester → cocher **Validé** ou **Retour** + commentaire

## Recette automatique (Xavier / CI)

\`\`\`bash
cd iachat-v2
npm run test:recette-all
\`\`\`

Couvre : compatibilités perf, matrices équipements, version tree, transport Suisse, PDF Hive, PDF détail.

---

`

for (const j of ROADMAP_JALONS) {
  md += section(j.items, `Jalon ${j.id} — ${j.label}`)
}

md += section(ROADMAP_FILES, 'Fichiers & infos manquantes')

md += `---

## Jalons à clôturer en priorité

| Jalon | Action | Lignes |
|-------|--------|--------|
| **C** | Bouton « Valider tout le jalon » sur /validation/ | C1, C2, C3 (100 % dev) |
| **A** | Valider en masse puis traiter A3, A5, A10 | 7 lignes dev fait + 3 ouvertes |

Contact Armand : ${ROADMAP_META.contact}
`

writeFileSync(out, md, 'utf8')
console.log(`Wrote ${out}`)
