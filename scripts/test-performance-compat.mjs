#!/usr/bin/env node
/**
 * Unit tests for CR/FB/EI performance compatibility audit.
 */
import { auditPerformanceCompatibility, collectLinePerformances } from '../server/lib/performanceCompatibility.js'

const cases = [
  {
    name: 'FB7 + EI60',
    line: { designation: 'BP CR6 FB7 EI60 1V', gamme: 'CR6', _raw: [null, null, null, 6, 7, 60] },
    expectViolation: true,
  },
  {
    name: 'CR4 seul',
    line: { designation: 'BP CR4 1V', gamme: 'CR4', _raw: [null, null, null, 4] },
    expectViolation: false,
  },
  {
    name: 'Anti-bélier 2V',
    line: { designation: 'BP CR4 2 vantaux anti-bélier', vantail: '2V', _raw: [null, null, null, 4, null, null, null, '4t'] },
    expectViolation: true,
  },
  {
    name: 'CR6 FB7 sans feu',
    line: { designation: 'BP CR6 FB7', _raw: [null, null, null, 6, 7] },
    expectViolation: true,
  },
  {
    name: 'CR4 + FB4 + EI60 (tokens grille H2300×L1150)',
    line: {
      gamme: 'CR4',
      designation: 'BP 1V',
      haut_mm: 2300,
      larg_mm: 1150,
      _raw: ['BP 1V', 1150, 2300, 'CR4', 'FB4', 'EI60'],
    },
    expectViolation: false,
    expectPerfs: ['CR4', 'FB4', 'EI60'],
  },
  {
    name: 'CR4 + FB4 + EI60 (slots numériques)',
    line: { gamme: 'CR4', _raw: [null, 1150, 2300, 4, 4, 60] },
    expectViolation: false,
    expectPerfs: ['CR4', 'FB4', 'EI60'],
  },
]

let failed = 0
for (const testCase of cases) {
  const issues = auditPerformanceCompatibility([testCase.line], () => 'A')
  const hasViolation = issues.some(item => item.status === 'violation')
  const perfs = [...collectLinePerformances(testCase.line)]
  const ok = hasViolation === testCase.expectViolation
    && (!testCase.expectPerfs || testCase.expectPerfs.every(perf => perfs.includes(perf)))
  console.log(`${ok ? '✓' : '✗'} ${testCase.name} — perfs=[${perfs.join(', ')}] issues=${issues.length}`)
  if (!ok) {
    failed += 1
    console.log('  ', issues)
    if (testCase.expectPerfs) console.log('   expected perfs:', testCase.expectPerfs)
  }
}

if (failed) {
  console.error(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\nAll performance compatibility tests passed')
