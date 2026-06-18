#!/usr/bin/env node
import {
  buildVersionNumberMap,
  buildVersionTree,
  getVersionRelationship,
  versionRelationshipLabel,
} from '../server/lib/versionTree.js'

const versions = [
  { id: 1, parent_version_id: null, version_label: 'v1', title: 'Base' },
  { id: 2, parent_version_id: 1, version_label: 'v2', title: 'Option A' },
  { id: 3, parent_version_id: 1, version_label: 'v3', title: 'Option B' },
  { id: 4, parent_version_id: 3, version_label: 'v4', title: 'Option B.1' },
]

const numbers = buildVersionNumberMap(versions)
const tree = buildVersionTree(versions)

const checks = [
  [numbers.get(1), '1'],
  [numbers.get(2), '1.1'],
  [numbers.get(4), '1.2.1'],
  [getVersionRelationship(1, 4, versions), 'ancestor_descendant'],
  [getVersionRelationship(2, 3, versions), 'siblings'],
  [getVersionRelationship(3, 4, versions), 'parent_child'],
  [versionRelationshipLabel('siblings'), 'Versions sœurs (même parent)'],
  [tree.length, 1],
  [tree[0].children.length, 2],
]

let failed = 0
for (const [actual, expected] of checks) {
  if (actual !== expected) {
    console.error(`FAIL expected ${expected}, got ${actual}`)
    failed += 1
  }
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}

console.log('version tree helpers OK')
console.log(JSON.stringify(tree, null, 2))
