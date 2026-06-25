#!/usr/bin/env node
/**
 * Automated checks for jalon D (mail / Graph / CRM) — used by validation page.
 */
import '../server/env.js'
import db from '../server/db/index.js'
import { isGraphConfigured, getOutlookIntegrationStatus } from '../server/services/microsoftGraph.js'
import { isHubspotConfigured } from '../server/services/hubspot.js'
import { isGraphInboxAvailable } from '../server/services/graph-inbox.js'
import { listCrmContactsForPicker } from '../server/services/mail-cache.js'
import { getMailSyncStatus } from '../server/services/mail-crm-sync.js'

const mailbox = process.env.MS_GRAPH_PREVIEW_MAILBOX || 'armand.guilhot@zerux.com'
let failed = 0

function ok(label) {
  console.log(`  ✓ ${label}`)
}

function fail(label, detail = '') {
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  failed += 1
}

console.log('=== Test validation mail (jalon D) ===\n')

if (!isGraphConfigured()) fail('MS_GRAPH_* configuré')
else ok('MS_GRAPH_* configuré')

const outlook = await getOutlookIntegrationStatus({ mailbox })
if (!outlook.auth_ok) fail('Graph auth', outlook.error || '')
else ok(`Graph auth OK (${mailbox})`)

if (!isHubspotConfigured()) fail('HUBSPOT_PRIVATE_APP_TOKEN')
else ok('HubSpot configuré')

if (!isGraphInboxAvailable()) fail('Graph inbox disponible')
else ok('Graph inbox disponible')

const sync = await getMailSyncStatus()
if (sync.crm_contacts_indexed < 1) fail('Index CRM contacts', String(sync.crm_contacts_indexed))
else ok(`Index CRM : ${sync.crm_contacts_indexed} contacts`)

const withThreads = await listCrmContactsForPicker({ mailbox, withThreads: true, limit: 5 })
if (!withThreads.length) fail('Au moins 1 contact CRM avec mails en cache')
else {
  ok(`Contacts CRM avec mails : ${withThreads.length} (ex. ${withThreads[0].email})`)
}

const [devisCols] = await db.query(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis'
   AND COLUMN_NAME IN ('source_email_json', 'email_draft_body', 'requester_contact_id')`
)
const colSet = new Set(devisCols.map((r) => r.COLUMN_NAME))
for (const c of ['source_email_json', 'email_draft_body', 'requester_contact_id']) {
  if (!colSet.has(c)) fail(`Colonne devis.${c}`)
  else ok(`Colonne devis.${c}`)
}

console.log('')
if (failed) {
  console.error(`ÉCHEC : ${failed} contrôle(s)`)
  process.exit(1)
}
console.log('OK — prêt pour recette Armand (jalon D)')
process.exit(0)
