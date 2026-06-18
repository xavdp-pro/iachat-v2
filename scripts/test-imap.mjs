#!/usr/bin/env node
import '../server/env.js'
import { fetchContactEmails, isImapConfigured } from '../server/services/imap-inbox.js'

const email = process.argv[2] || 'sophie.martin@thehive-paris.fr'

if (!isImapConfigured()) {
  console.error('IMAP non configuré — lancez: npm run imap:test:up')
  process.exit(1)
}

const result = await fetchContactEmails({ email, limit: 5 })
console.log(`Contact: ${email}`)
console.log(`Messages: ${result.messages.length} / ${result.total_hint}`)
for (const msg of result.messages) {
  console.log(`- [${msg.date}] ${msg.subject}`)
  console.log(`  ${msg.preview?.slice(0, 120)}...`)
}
