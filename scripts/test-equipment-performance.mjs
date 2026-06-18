#!/usr/bin/env node
import { resolveEquipmentCatalogPerformance } from '../server/lib/equipmentPerformance.js'

const available = ['CR3', 'CR4', 'CR5', 'CR6', 'EI60', 'FB6', 'BLAST']

const checks = [
  [resolveEquipmentCatalogPerformance(['CR4', 'BLAST'], available), 'CR4'],
  [resolveEquipmentCatalogPerformance(['EI60', 'CR3'], available, 'NEXUS EI60'), 'EI60'],
  [resolveEquipmentCatalogPerformance(['FB6', 'EI60'], available, 'NEXUS FB6'), 'FB6'],
  [resolveEquipmentCatalogPerformance(['BLAST'], available, 'NEXUS Blast 2t'), 'BLAST'],
  [resolveEquipmentCatalogPerformance(['CR5', 'EI60'], available, 'CR5EI60'), 'CR5'],
]

let failed = 0
for (const [actual, expected] of checks) {
  if (actual !== expected) {
    console.error(`FAIL expected ${expected}, got ${actual}`)
    failed += 1
  }
}

if (failed) process.exit(1)
console.log('equipment performance resolver OK')
