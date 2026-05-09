#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { storeDesignationExamples, searchDesignationExamples } from '../server/services/memory.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

const inputPath = path.resolve(ROOT, argValue('--input', 'tmp/pdf_designations.json'))
const sampleQuery = argValue('--sample-query', 'BLOC-PORTE NEXUS UN VANTAIL CR4 EI60 Dimensions L 1200 H 2700 ferme-porte bras compas')

const raw = await fs.readFile(inputPath, 'utf8')
const payload = JSON.parse(raw)
const examples = Array.isArray(payload.records) ? payload.records : []

const result = await storeDesignationExamples({ examples })
const hits = await searchDesignationExamples({ text: sampleQuery, topK: 3, minScore: 0 })

console.log(JSON.stringify({
  input: inputPath,
  examples: examples.length,
  stored: result.stored,
  sample_query: sampleQuery,
  sample_hits: hits.map((hit) => ({
    score: Number(hit.score?.toFixed?.(4) ?? hit.score),
    source_pdf: hit.source_pdf,
    repere: hit.repere,
    title: hit.title,
    dimensions: hit.dimensions?.slice?.(0, 2) ?? [],
  })),
}, null, 2))
