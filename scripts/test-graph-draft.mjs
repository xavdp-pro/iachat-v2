#!/usr/bin/env node
import '../server/env.js'
import {
  getOutlookIntegrationStatus,
  isGraphConfigured,
  createReplyDraftWithAttachments,
} from '../server/services/microsoftGraph.js'

const messageId = process.argv[2]
const dryRun = process.argv.includes('--dry-run')

const status = await getOutlookIntegrationStatus()
console.log('Outlook integration:', JSON.stringify(status, null, 2))

if (!isGraphConfigured()) {
  console.log('\nSkip: Microsoft Graph not configured (set MS_GRAPH_* in .env)')
  process.exit(0)
}

if (!status.auth_ok) {
  console.error('\nGraph auth failed:', status.error || 'unknown')
  process.exit(1)
}

if (!messageId) {
  console.log('\nUsage: npm run test:graph-draft -- "<message-id@domain>" [--dry-run]')
  console.log('Pass the RFC822 Message-ID from the selected IMAP source email.')
  process.exit(0)
}

if (dryRun) {
  console.log(`\nDry run OK — would create reply draft for: ${messageId}`)
  process.exit(0)
}

const draft = await createReplyDraftWithAttachments({
  mailbox: process.env.MS_GRAPH_PREVIEW_MAILBOX || process.env.MS_GRAPH_MAILBOX || 'armand.guilhot@zerux.com',
  internetMessageId: messageId,
  bodyText: 'Test brouillon Zerux (script test:graph-draft)',
  attachments: [],
})

console.log('\nDraft created:', JSON.stringify(draft, null, 2))
