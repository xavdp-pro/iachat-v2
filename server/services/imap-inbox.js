import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { groupMessagesIntoThreads } from './imap-threads.js'

function imapConfig() {
  const host = process.env.IMAP_HOST
  const user = process.env.IMAP_USER
  const pass = process.env.IMAP_PASS
  if (!host || !user || !pass) return null
  return {
    host,
    port: Number(process.env.IMAP_PORT || 993),
    secure: process.env.IMAP_SECURE !== '0',
    auth: { user, pass },
    logger: false,
  }
}

export function isImapConfigured() {
  return Boolean(imapConfig())
}

async function parseImapMessage(msg, normalizedFrom) {
  let preview = ''
  let bodyText = ''
  let inReplyTo = null
  let references = []
  let fromName = ''
  try {
    const parsed = await simpleParser(msg.source)
    preview = String(parsed.text || parsed.html || '').replace(/\s+/g, ' ').trim().slice(0, 240)
    bodyText = String(parsed.text || '').trim()
    inReplyTo = parsed.inReplyTo || null
    references = Array.isArray(parsed.references) ? parsed.references : (parsed.references ? [parsed.references] : [])
    fromName = parsed.from?.value?.[0]?.name || ''
  } catch {
    preview = ''
  }
  return {
    uid: msg.uid,
    message_id: msg.envelope?.messageId || null,
    in_reply_to: inReplyTo,
    references,
    subject: msg.envelope?.subject || '(sans objet)',
    from: msg.envelope?.from?.[0]?.address || normalizedFrom,
    from_name: fromName || msg.envelope?.from?.[0]?.name || '',
    date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
    preview,
    body_text: bodyText.slice(0, 12000),
  }
}

async function fetchContactMessagesFromInbox({ email, offset = 0, limit = 5, fetchAll = false } = {}) {
  const config = imapConfig()
  if (!config) {
    return { configured: false, messages: [], total_hint: 0 }
  }
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return { configured: true, messages: [], total_hint: 0 }

  const client = new ImapFlow(config)
  const take = fetchAll ? Math.min(Math.max(Number(limit) || 50, 1), 100) : Math.min(Math.max(Number(limit) || 5, 1), 20)
  const skip = Math.max(Number(offset) || 0, 0)
  const messages = []

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const uids = await client.search({ from: normalized }, { uid: true })
      const sorted = [...uids].sort((a, b) => b - a)
      const slice = fetchAll ? sorted : sorted.slice(skip, skip + take)
      for await (const msg of client.fetch(slice, { envelope: true, source: true, uid: true })) {
        messages.push(await parseImapMessage(msg, normalized))
      }
      if (!fetchAll) {
        messages.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      }
      return { configured: true, messages, total_hint: sorted.length }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

/**
 * Fetch recent messages from a contact email address (inbox search).
 */
export async function fetchContactEmails(options = {}) {
  return fetchContactMessagesFromInbox(options)
}

/**
 * Fetch all messages from a contact and group into conversation threads.
 */
export async function fetchContactThreads({ email, limit = 50 } = {}) {
  const { configured, messages, total_hint } = await fetchContactMessagesFromInbox({
    email,
    limit,
    fetchAll: true,
  })
  const threads = groupMessagesIntoThreads(messages)
  return { configured, threads, total_messages: total_hint, contact_email: email }
}
