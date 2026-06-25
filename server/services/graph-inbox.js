/**
 * Read-only Microsoft Graph inbox — contact history for devis stepper.
 */
import { groupMessagesIntoThreads } from './imap-threads.js'
import {
  fetchGraphMessageAttachments,
  fetchGraphMessagesFromContact,
  isGraphConfigured,
} from './microsoftGraph.js'

function mapGraphMessage(msg) {
  const from = msg.from?.emailAddress || {}
  return {
    uid: msg.id,
    graph_id: msg.id,
    message_id: msg.internetMessageId || null,
    conversation_id: msg.conversationId || null,
    in_reply_to: null,
    references: [],
    subject: msg.subject || '(sans objet)',
    from: from.address || '',
    from_name: from.name || '',
    date: msg.receivedDateTime || msg.sentDateTime || null,
    preview: String(msg.bodyPreview || '').trim(),
    body_text: String(msg.body?.content || msg.bodyPreview || '').trim().slice(0, 12000),
    has_attachments: Boolean(msg.hasAttachments),
    attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
  }
}

export function isGraphInboxAvailable() {
  return isGraphConfigured()
}

export async function fetchContactEmailsFromGraph({ mailbox, email, offset = 0, limit = 5 } = {}) {
  if (!mailbox) throw new Error('mailbox requis')
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) {
    return { configured: true, mode: 'graph', mailbox, messages: [], total_hint: 0, read_only: true }
  }

  const take = Math.min(Math.max(Number(limit) || 5, 1), 20)
  const skip = Math.max(Number(offset) || 0, 0)
  const { messages: raw, total_hint, has_more } = await fetchGraphMessagesFromContact({
    mailbox,
    contactEmail: normalized,
    top: take,
    skip,
  })
  const mapped = raw.map(mapGraphMessage)
  return {
    configured: true,
    mode: 'graph',
    mailbox,
    messages: mapped,
    total_hint,
    has_more,
    read_only: true,
  }
}

export async function fetchContactThreadsFromGraph({ mailbox, email, limit = 50 } = {}) {
  if (!mailbox) throw new Error('mailbox requis')
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) {
    return { configured: true, mode: 'graph', mailbox, threads: [], total_messages: 0, contact_email: email, read_only: true }
  }

  const max = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const { messages: raw, total_hint } = await fetchGraphMessagesFromContact({
    mailbox,
    contactEmail: normalized,
    top: max,
  })
  const messages = raw.map(mapGraphMessage)
  const threads = groupMessagesIntoThreads(messages)
  return {
    configured: true,
    mode: 'graph',
    mailbox,
    threads,
    total_messages: total_hint,
    contact_email: normalized,
    read_only: true,
  }
}

export async function fetchMessageAttachmentsFromGraph({ mailbox, graphId } = {}) {
  if (!mailbox || !graphId) throw new Error('mailbox et graphId requis')
  const attachments = await fetchGraphMessageAttachments({ mailbox, messageId: graphId })
  return {
    configured: true,
    mode: 'graph',
    mailbox,
    read_only: true,
    attachments,
  }
}
