/**
 * Local cache for CRM contact emails and Graph inbox threads.
 */
import db from '../db/index.js'
import {
  findContactByEmail,
  isHubspotConfigured,
  isInternalCrmEmail,
} from './hubspot.js'

const DEFAULT_CACHE_MAX_AGE_MS = Number(process.env.MAIL_CRM_CACHE_MAX_AGE_MS || 20 * 60 * 1000)

export function getCacheMaxAgeMs() {
  return DEFAULT_CACHE_MAX_AGE_MS
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export async function isCrmContactEmail(email) {
  const normalized = normalizeEmail(email)
  if (!normalized || isInternalCrmEmail(normalized)) return false

  const [rows] = await db.query(
    'SELECT id FROM crm_contacts_index WHERE email = ? LIMIT 1',
    [normalized],
  )
  if (rows.length) return true

  if (!isHubspotConfigured()) return false
  const contact = await findContactByEmail(normalized)
  if (!contact) return false

  await upsertCrmContactIndex({
    hubspotContactId: contact.id,
    email: normalized,
    firstname: contact.properties?.firstname || null,
    lastname: contact.properties?.lastname || null,
    companyId: contact.associations?.companies?.results?.[0]?.id || null,
    companyName: null,
  })
  return true
}

export async function assertCrmContactEmail(email) {
  const normalized = normalizeEmail(email)
  if (!normalized) {
    const err = new Error('Email contact requis')
    err.status = 400
    throw err
  }
  if (isInternalCrmEmail(normalized)) {
    const err = new Error('Email interne — seuls les contacts HubSpot externes sont autorisés')
    err.status = 403
    err.code = 'CRM_EMAIL_FORBIDDEN'
    throw err
  }
  const ok = await isCrmContactEmail(normalized)
  if (!ok) {
    const err = new Error('Cet email n\'est pas un contact HubSpot CRM')
    err.status = 403
    err.code = 'CRM_EMAIL_NOT_FOUND'
    throw err
  }
  return normalized
}

export async function upsertCrmContactIndex({
  hubspotContactId,
  hubspotCompanyId = null,
  email,
  firstname = null,
  lastname = null,
  companyName = null,
}) {
  const normalized = normalizeEmail(email)
  if (!normalized) return

  await db.query(
    `INSERT INTO crm_contacts_index
      (hubspot_contact_id, hubspot_company_id, email, firstname, lastname, company_name)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      hubspot_contact_id = VALUES(hubspot_contact_id),
      hubspot_company_id = COALESCE(VALUES(hubspot_company_id), hubspot_company_id),
      firstname = COALESCE(VALUES(firstname), firstname),
      lastname = COALESCE(VALUES(lastname), lastname),
      company_name = COALESCE(VALUES(company_name), company_name),
      indexed_at = CURRENT_TIMESTAMP`,
    [
      String(hubspotContactId),
      hubspotCompanyId ? String(hubspotCompanyId) : null,
      normalized,
      firstname,
      lastname,
      companyName,
    ],
  )
}

export async function getCachedThreads(mailbox, email) {
  const normalized = normalizeEmail(email)
  const box = String(mailbox || '').trim().toLowerCase()
  if (!normalized || !box) return null

  const [rows] = await db.query(
    `SELECT threads_json, total_messages, synced_at
     FROM mail_thread_cache
     WHERE mailbox = ? AND contact_email = ?
     LIMIT 1`,
    [box, normalized],
  )
  if (!rows.length) return null

  const row = rows[0]
  let threads = []
  try {
    threads = typeof row.threads_json === 'string'
      ? JSON.parse(row.threads_json)
      : (row.threads_json || [])
  } catch {
    threads = []
  }

  const syncedAt = row.synced_at ? new Date(row.synced_at) : null
  const ageMs = syncedAt ? Date.now() - syncedAt.getTime() : Infinity
  const stale = ageMs > DEFAULT_CACHE_MAX_AGE_MS

  return {
    threads,
    total_messages: Number(row.total_messages || 0),
    synced_at: syncedAt?.toISOString() || null,
    stale,
    cache_source: 'cache',
  }
}

export async function upsertCachedThreads(mailbox, email, threads, totalMessages = 0) {
  const normalized = normalizeEmail(email)
  const box = String(mailbox || '').trim().toLowerCase()
  if (!normalized || !box) return

  await db.query(
    `INSERT INTO mail_thread_cache (mailbox, contact_email, threads_json, total_messages, synced_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      threads_json = VALUES(threads_json),
      total_messages = VALUES(total_messages),
      synced_at = NOW()`,
    [box, normalized, JSON.stringify(threads || []), Number(totalMessages || 0)],
  )
}

export async function listCrmContactsForPicker({ q, mailbox, withThreads = false, limit = 50 } = {}) {
  const term = String(q || '').trim()
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const box = String(mailbox || '').trim().toLowerCase()

  let rows
  if (term) {
    const like = `%${term.replace(/[%_]/g, '')}%`
    ;[rows] = await db.query(
      `SELECT c.hubspot_contact_id, c.hubspot_company_id, c.email, c.firstname, c.lastname, c.company_name,
              c.indexed_at,
              m.total_messages, m.synced_at AS threads_synced_at
       FROM crm_contacts_index c
       LEFT JOIN mail_thread_cache m ON m.contact_email = c.email AND m.mailbox = ?
       WHERE c.email LIKE ? OR c.firstname LIKE ? OR c.lastname LIKE ? OR c.company_name LIKE ?
       ORDER BY COALESCE(m.synced_at, c.indexed_at) DESC
       LIMIT ?`,
      [box || '', like, like, like, like, lim],
    )
  } else if (withThreads && box) {
    ;[rows] = await db.query(
      `SELECT c.hubspot_contact_id, c.hubspot_company_id, c.email, c.firstname, c.lastname, c.company_name,
              c.indexed_at,
              m.total_messages, m.synced_at AS threads_synced_at
       FROM crm_contacts_index c
       INNER JOIN mail_thread_cache m ON m.contact_email = c.email AND m.mailbox = ?
       WHERE m.total_messages > 0
       ORDER BY m.synced_at DESC
       LIMIT ?`,
      [box, lim],
    )
  } else {
    ;[rows] = await db.query(
      `SELECT c.hubspot_contact_id, c.hubspot_company_id, c.email, c.firstname, c.lastname, c.company_name,
              c.indexed_at,
              m.total_messages, m.synced_at AS threads_synced_at
       FROM crm_contacts_index c
       LEFT JOIN mail_thread_cache m ON m.contact_email = c.email AND m.mailbox = ?
       ORDER BY COALESCE(m.synced_at, c.indexed_at) DESC
       LIMIT ?`,
      [box || '', lim],
    )
  }

  return rows.map((row) => ({
    hubspot_contact_id: row.hubspot_contact_id,
    hubspot_company_id: row.hubspot_company_id,
    email: row.email,
    firstname: row.firstname,
    lastname: row.lastname,
    company_name: row.company_name,
    label: [
      [row.firstname, row.lastname].filter(Boolean).join(' ') || row.email,
      row.company_name,
      row.email,
    ].filter(Boolean).join(' — '),
    thread_count: Number(row.total_messages || 0),
    threads_synced_at: row.threads_synced_at || null,
    indexed_at: row.indexed_at || null,
  }))
}

export async function getContactsNeedingSync(mailbox, { limit = 40 } = {}) {
  const box = String(mailbox || '').trim().toLowerCase()
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 200)
  const maxAgeMinutes = Math.ceil(DEFAULT_CACHE_MAX_AGE_MS / 60000)

  const [rows] = await db.query(
    `SELECT c.email
     FROM crm_contacts_index c
     LEFT JOIN mail_thread_cache m ON m.contact_email = c.email AND m.mailbox = ?
     WHERE m.id IS NULL
        OR m.synced_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
     ORDER BY COALESCE(m.synced_at, '1970-01-01') ASC, c.indexed_at DESC
     LIMIT ?`,
    [box, maxAgeMinutes, lim],
  )
  return rows.map((r) => r.email)
}
