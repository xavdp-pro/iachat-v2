/**
 * Microsoft Graph — read-only inbox + reply drafts (never sends mail).
 * Requires app registration with Mail.Read (+ Mail.ReadWrite for drafts).
 */

import { buildOutlookDraftLinks } from '../lib/outlook-links.js'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const TOKEN_URL = (tenantId) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

let cachedToken = null
let cachedTokenExpiresAt = 0

export function getGraphCredentials() {
  const tenantId = process.env.MS_GRAPH_TENANT_ID?.trim()
  const clientId = process.env.MS_GRAPH_CLIENT_ID?.trim()
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET?.trim()
  if (!tenantId || !clientId || !clientSecret) return null
  return { tenantId, clientId, clientSecret }
}

/** @deprecated use getGraphCredentials — mailbox is resolved per user */
function getGraphConfig(mailbox) {
  const creds = getGraphCredentials()
  const resolvedMailbox = mailbox?.trim()
    || process.env.MS_GRAPH_MAILBOX?.trim()
    || null
  if (!creds || !resolvedMailbox) return null
  return { ...creds, mailbox: resolvedMailbox }
}

export function isGraphConfigured() {
  return Boolean(getGraphCredentials())
}

export function getGraphMailbox() {
  return process.env.MS_GRAPH_MAILBOX?.trim() || null
}

function normalizeInternetMessageId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('<') && raw.endsWith('>')) return raw
  return `<${raw.replace(/^<|>$/g, '')}>`
}

function escapeODataString(value) {
  return String(value || '').replace(/'/g, "''")
}

async function graphFetch(pathOrUrl, { method = 'GET', body, token, headers: extraHeaders = {} } = {}) {
  const url = String(pathOrUrl || '').startsWith('http')
    ? pathOrUrl
    : `${GRAPH_BASE}${pathOrUrl}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.body-content-type="text"',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const detail = data?.error?.message || data?.error?.code || text || res.statusText
    const err = new Error(`Microsoft Graph ${res.status}: ${detail}`)
    err.status = res.status
    err.graph = data?.error || null
    throw err
  }
  return data
}

async function getAccessToken(credentials = getGraphCredentials()) {
  if (!credentials) {
    const err = new Error('Microsoft Graph is not configured')
    err.code = 'NO_GRAPH'
    throw err
  }
  const now = Date.now()
  if (cachedToken && cachedTokenExpiresAt > now + 60_000) return cachedToken

  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const res = await fetch(TOKEN_URL(credentials.tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error_description || data?.error || 'Graph token request failed')
    err.code = 'GRAPH_AUTH'
    err.status = res.status
    throw err
  }
  cachedToken = data.access_token
  cachedTokenExpiresAt = now + Number(data.expires_in || 3600) * 1000
  return cachedToken
}

async function findMessageByInternetId(token, mailbox, internetMessageId) {
  const normalized = normalizeInternetMessageId(internetMessageId)
  if (!normalized) return null
  const filter = `internetMessageId eq '${escapeODataString(normalized)}'`
  const path = `/users/${encodeURIComponent(mailbox)}/messages?$filter=${encodeURIComponent(filter)}&$select=id,subject,internetMessageId,webLink&$top=1`
  const data = await graphFetch(path, { token })
  return data?.value?.[0] || null
}

const MESSAGE_SELECT = [
  'id', 'subject', 'from', 'receivedDateTime', 'sentDateTime', 'internetMessageId',
  'conversationId', 'bodyPreview', 'body', 'hasAttachments',
].join(',')

function sortMessagesNewestFirst(messages = []) {
  return [...messages].sort((a, b) => {
    const da = new Date(a.receivedDateTime || a.sentDateTime || 0).getTime()
    const db = new Date(b.receivedDateTime || b.sentDateTime || 0).getTime()
    return db - da
  })
}

function normalizeContactEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function messageFromContact(msg, contactEmail) {
  const from = normalizeContactEmail(msg?.from?.emailAddress?.address)
  return from === contactEmail
}

/**
 * Collect messages received FROM a contact (all folders, not inbox-only).
 */
async function collectIncomingFromContact(token, mailbox, contactEmail, minCount) {
  const want = Math.min(Math.max(Number(minCount) || 5, 1), 100)
  const collected = []
  const eventual = { ConsistencyLevel: 'eventual' }
  const select = `$select=${encodeURIComponent(MESSAGE_SELECT)}`

  const trySearch = async (query) => {
    let url = `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/messages`
      + `?$search=${encodeURIComponent(`"${query}"`)}`
      + `&${select}`
      + `&$top=${Math.min(want, 50)}`
    while (url && collected.length < want) {
      const data = await graphFetch(url, { token, headers: eventual })
      for (const msg of data?.value || []) {
        if (messageFromContact(msg, contactEmail)) collected.push(msg)
      }
      if (collected.length >= want) break
      url = data?.['@odata.nextLink'] || null
    }
  }

  try {
    await trySearch(`from:${contactEmail}`)
  } catch (searchErr) {
    console.warn('Graph $search from contact failed, trying $filter:', searchErr.message)
  }

  if (collected.length < want) {
    try {
      const filter = `from/emailAddress/address eq '${escapeODataString(contactEmail)}'`
      let url = `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/messages`
        + `?$filter=${encodeURIComponent(filter)}`
        + `&$orderby=${encodeURIComponent('receivedDateTime desc')}`
        + `&${select}`
        + `&$top=${Math.min(want, 50)}`
      while (url && collected.length < want) {
        const data = await graphFetch(url, { token, headers: eventual })
        for (const msg of data?.value || []) {
          if (!collected.some((item) => item.id === msg.id)) collected.push(msg)
        }
        if (collected.length >= want) break
        url = data?.['@odata.nextLink'] || null
      }
    } catch (filterErr) {
      console.warn('Graph $filter from contact failed, trying inbox folder:', filterErr.message)
      const filter = `from/emailAddress/address eq '${escapeODataString(contactEmail)}'`
      const path = `/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages`
        + `?$filter=${encodeURIComponent(filter)}`
        + `&${select}`
        + `&$top=${want}`
      const data = await graphFetch(path, { token })
      for (const msg of data?.value || []) {
        if (!collected.some((item) => item.id === msg.id)) collected.push(msg)
      }
    }
  }

  return sortMessagesNewestFirst(collected)
}

/**
 * Read-only: messages received from a CRM contact in a commercial mailbox.
 */
export async function fetchGraphMessagesFromContact({ mailbox, contactEmail, top = 50, skip = 0 } = {}) {
  const creds = getGraphCredentials()
  if (!creds) throw new Error('Microsoft Graph non configuré')
  const normalized = normalizeContactEmail(contactEmail)
  if (!normalized || !mailbox) return { messages: [], total_hint: 0, has_more: false }

  const take = Math.min(Math.max(Number(top) || 50, 1), 100)
  const offset = Math.max(Number(skip) || 0, 0)
  const token = await getAccessToken(creds)

  // Fetch one extra row to know if more pages exist.
  const raw = await collectIncomingFromContact(token, mailbox, normalized, offset + take + 1)
  const messages = raw.slice(offset, offset + take)
  return {
    messages,
    total_hint: raw.length,
    has_more: raw.length > offset + take,
  }
}

/**
 * Read-only: list attachment metadata for a message (no download).
 */
export async function fetchGraphMessageAttachments({ mailbox, messageId } = {}) {
  const creds = getGraphCredentials()
  if (!creds || !mailbox || !messageId) return []
  const token = await getAccessToken(creds)
  const path = `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments`
    + `?$select=id,name,contentType,size,isInline`
  const data = await graphFetch(path, { token })
  return (data?.value || []).map(att => ({
    id: att.id,
    name: att.name || 'pièce jointe',
    content_type: att.contentType || null,
    size: att.size ?? null,
    is_inline: Boolean(att.isInline),
  }))
}

/**
 * Create an Outlook reply draft — does NOT send; commercial edits and sends in Outlook.
 */
export async function createReplyDraftWithAttachments({
  mailbox,
  internetMessageId,
  bodyText = '',
  attachments = [],
} = {}) {
  const resolvedMailbox = mailbox?.trim()
    || process.env.MS_GRAPH_MAILBOX?.trim()
    || null
  const creds = getGraphCredentials()
  if (!creds || !resolvedMailbox) {
    const err = new Error('Microsoft Graph non configuré (MS_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET / mailbox)')
    err.code = 'NO_GRAPH'
    throw err
  }

  const token = await getAccessToken(creds)
  const source = await findMessageByInternetId(token, resolvedMailbox, internetMessageId)
  if (!source?.id) {
    const err = new Error(`Email source introuvable dans ${resolvedMailbox}`)
    err.code = 'GRAPH_MESSAGE_NOT_FOUND'
    throw err
  }

  const draft = await graphFetch(
    `/users/${encodeURIComponent(resolvedMailbox)}/messages/${encodeURIComponent(source.id)}/createReply`,
    {
      method: 'POST',
      token,
      body: { comment: String(bodyText || '') },
    },
  )

  for (const file of attachments) {
    if (!file?.buffer || !file?.filename) continue
    await graphFetch(
      `/users/${encodeURIComponent(resolvedMailbox)}/messages/${encodeURIComponent(draft.id)}/attachments`,
      {
        method: 'POST',
        token,
        body: {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: file.filename,
          contentBytes: Buffer.from(file.buffer).toString('base64'),
        },
      },
    )
  }

  const links = buildOutlookDraftLinks({
    draftId: draft.id,
    mailbox: resolvedMailbox,
    webLink: draft.webLink || null,
  })

  return {
    draftId: draft.id,
    webLink: links.webLink,
    desktopLink: links.desktopLink,
    composeWebLink: links.composeWebLink,
    composeLink: links.composeLink,
    openLink: links.openLink,
    mailbox: resolvedMailbox,
    sourceInternetMessageId: normalizeInternetMessageId(internetMessageId),
    attachmentCount: attachments.filter(file => file?.buffer && file?.filename).length,
  }
}

export async function getOutlookIntegrationStatus({ mailbox = null } = {}) {
  const configured = isGraphConfigured()
  if (!configured) {
    return { configured: false, mailbox: null, mode: 'mailto' }
  }
  try {
    await getAccessToken()
    return {
      configured: true,
      mailbox: mailbox || getGraphMailbox(),
      mode: 'graph',
      auth_ok: true,
      read_only_note: 'Lecture inbox : aucun envoi automatique — brouillon uniquement sur action explicite.',
    }
  } catch (err) {
    return {
      configured: true,
      mailbox: mailbox || getGraphMailbox(),
      mode: 'graph',
      auth_ok: false,
      error: err.message,
    }
  }
}
