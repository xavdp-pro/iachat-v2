#!/usr/bin/env node
/**
 * Regenerate public/validation/data.json from armandValidationRoadmap.js
 */
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  ROADMAP_META,
  JALONS,
  FILES_BLOCKERS,
  MEETING_AGENDA,
  jalonStats,
  openQuestions,
} from '../src/data/armandValidationRoadmap.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public/validation/data.json')

import { enrichItemWithGuide } from '../src/data/armandValidationGuide.js'

const mergeGuide = (item) => enrichItemWithGuide(item)

const payload = {
  meta: ROADMAP_META,
  jalons: JALONS.map((j) => ({
    ...j,
    items: j.items.map(mergeGuide),
    stats: jalonStats(j),
  })),
  files: FILES_BLOCKERS.map(mergeGuide),
  agenda: MEETING_AGENDA,
  openQuestions: openQuestions(),
}

writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`Wrote ${out} (${payload.openQuestions.length} open questions)`)
