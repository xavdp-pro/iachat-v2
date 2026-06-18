#!/usr/bin/env node
/**
 * Run all autonomous recette scripts (no human visual validation).
 * Usage: npm run test:recette-all
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const steps = [
  ['test:performance-compat', []],
  ['test:equipment-performance', []],
  ['test:version-tree', []],
  ['test:equipment-matrix', ['--', '--all']],
  ['test:recette-suisse', []],
  ['test:hive-pdf', ['/tmp/hive-recette.pdf']],
  ['test:detail-pdf', ['/tmp/detail-recette.pdf']],
]

let failed = 0
for (const [script, args] of steps) {
  console.log(`\n▶ npm run ${script}${args.length ? ` ${args.join(' ')}` : ''}`)
  const result = spawnSync('npm', ['run', script, ...args], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`✗ ${script} failed`)
    failed += 1
  } else {
    console.log(`✓ ${script}`)
  }
}

if (failed) {
  console.error(`\n${failed} recette step(s) failed`)
  process.exit(1)
}
console.log('\nAll autonomous recette steps passed')
