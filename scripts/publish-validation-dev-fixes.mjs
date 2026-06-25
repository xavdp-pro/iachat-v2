#!/usr/bin/env node
/**
 * Push DEV_FIX_NOTES to armand_roadmap_feedback as ag_status=recheck.
 * Usage: node scripts/publish-validation-dev-fixes.mjs
 */
import 'dotenv/config'
import db from '../server/db/index.js'
import { ensureDbSchema } from '../server/db/ensureSchema.js'
import { DEV_FIX_NOTES } from '../src/data/armandValidationFixes.js'
import { VALIDATION_DEV_NAME } from '../server/lib/validationActivity.js'

await ensureDbSchema()

let count = 0
for (const [itemId, note] of Object.entries(DEV_FIX_NOTES)) {
  const text = String(note || '').trim().slice(0, 4000)
  if (!text) continue
  await db.query(
    `INSERT INTO armand_roadmap_feedback (item_id, ag_status, dev_response, dev_response_at, dev_response_by, updated_by)
     VALUES (?, 'recheck', ?, CURRENT_TIMESTAMP, ?, ?)
     ON DUPLICATE KEY UPDATE
       ag_status = 'recheck',
       dev_response = VALUES(dev_response),
       dev_response_at = CURRENT_TIMESTAMP,
       dev_response_by = VALUES(dev_response_by),
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    [itemId, text, VALIDATION_DEV_NAME, VALIDATION_DEV_NAME],
  )
  count += 1
  console.log(`  ✓ ${itemId}`)
}

console.log(`Published ${count} dev fix(es) → recheck`)
process.exit(0)
