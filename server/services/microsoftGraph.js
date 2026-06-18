/**
 * Microsoft Graph — Outlook reply drafts (server-side only).
 * Requires app registration with Mail.ReadWrite (application) on the commercial mailbox.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const TOKEN_URL = (tenantId) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

let cachedToken = null
let cachedTokenExpiresAt = 0

function getGraphConfig() {
  const tenantId = process.env.MS_GRAPH_TENANT_ID?.trim()
  const clientId = process.env.MS_GRAPH_CLIENT_ID?.trim()
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET?.trim()
  const mailbox = process.env.MS_GRAPH_MAILBOX?.trim()
    || process.env.IMAP_USER?.trim()
    || null
  if (!tenantId || !clientId || !clientSecret || !mailbox) return null
  return { tenantId, clientId, clientSecret, mailbox }
}

export function isGraphConfigured() {
  return Boolean(getGraphConfig())
}

export function getGraphMailbox() {
  return getGraphConfig()?.mailbox || null
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

async function graphFetch(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.body-content-type="text"',
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

async function getAccessToken(config = getGraphConfig()) {
  if (!config) {
    const err = new Error('Microsoft Graph is not configured')
    err.code = 'NO_GRAPH'
    throw err
  }
  const now = Date.now()
  if (cachedToken && cachedTokenExpiresAt > now + 60_000) return cachedToken

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const res = await fetch(TOKEN_URL(config.tenantId), {
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

/**
 * Create an Outlook reply draft in the commercial mailbox, threaded to the source message.
 * @param {{ internetMessageId: string, bodyText?: string, attachments?: Array<{ filename: string, buffer: Buffer }> }} options
 */
export async function createReplyDraftWithAttachments({
  internetMessageId,
  bodyText = '',
  attachments = [],
} = {}) {
  const config = getGraphConfig()
  if (!config) {
    const err = new Error('Microsoft Graph non configuré (MS_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET / MAILBOX)')
    err.code = 'NO_GRAPH'
    throw err
  }

  const token = await getAccessToken(config)
  const source = await findMessageByInternetId(token, config.mailbox, internetMessageId)
  if (!source?.id) {
    const err = new Error(`Email source introuvable dans ${config.mailbox}`)
    err.code = 'GRAPH_MESSAGE_NOT_FOUND'
    throw err
  }

  const draft = await graphFetch(
    `/users/${encodeURIComponent(config.mailbox)}/messages/${encodeURIComponent(source.id)}/createReply`,
    {
      method: 'POST',
      token,
      body: { comment: String(bodyText || '') },
    },
  )

  for (const file of attachments) {
    if (!file?.buffer || !file?.filename) continue
    await graphFetch(
      `/users/${encodeURIComponent(config.mailbox)}/messages/${encodeURIComponent(draft.id)}/attachments`,
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

  return {
    draftId: draft.id,
    webLink: draft.webLink || null,
    mailbox: config.mailbox,
    sourceInternetMessageId: normalizeInternetMessageId(internetMessageId),
    attachmentCount: attachments.filter(file => file?.buffer && file?.filename).length,
  }
}

export async function getOutlookIntegrationStatus() {
  const configured = isGraphConfigured()
  if (!configured) {
    return {
      configured: false,
      mailbox: null,
      mode: 'mailto',
    }
  }
  try {
    await getAccessToken()
    return {
      configured: true,
      mailbox: getGraphMailbox(),
      mode: 'graph',
      auth_ok: true,
    }
  } catch (err) {
    return {
      configured: true,
      mailbox: getGraphMailbox(),
      mode: 'graph',
      auth_ok: false,
      error: err.message,
    }
  }
}
