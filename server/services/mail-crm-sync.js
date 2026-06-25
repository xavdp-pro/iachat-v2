/**
 * Background sync: HubSpot CRM contacts → Microsoft Graph inbox threads cache.
 */
import db from '../db/index.js'
import {
  getCompanyNamesByIds,
  isHubspotConfigured,
  iterateExternalCrmContacts,
} from './hubspot.js'
import { fetchContactThreadsFromGraph, isGraphInboxAvailable } from './graph-inbox.js'
import { listCommercialMailboxes } from './mailbox.js'
import {
  getCachedThreads,
  upsertCachedThreads,
  upsertCrmContactIndex,
  getContactsNeedingSync,
} from './mail-cache.js'

const SYNC_INTERVAL_MS = Number(process.env.MAIL_CRM_SYNC_INTERVAL_MS || 15 * 60 * 1000)
const SYNC_ON_START = String(process.env.MAIL_CRM_SYNC_ON_START ?? 'true').toLowerCase() !== 'false'
const SYNC_CONTACTS_PER_MAILBOX = Number(process.env.MAIL_CRM_SYNC_BATCH_SIZE || 30)
const SYNC_DELAY_MS = Number(process.env.MAIL_CRM_SYNC_DELAY_MS || 250)

let syncRunning = false
let lastRunSummary = null
let schedulerHandle = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function enrichCompanyNames(contactIds) {
  if (!contactIds.length) return new Map()
  const companyMap = new Map()

  try {
    const assocRes = await fetch('https://api.hubapi.com/crm/v3/associations/contacts/companies/batch/read', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_APP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: contactIds.map((id) => ({ id: String(id) })) }),
    }).then((r) => r.json())

    const contactToCompany = new Map()
    const companyIds = new Set()
    for (const row of assocRes.results || []) {
      const companyId = row.to?.[0]?.id
      if (companyId) {
        contactToCompany.set(String(row.from.id), String(companyId))
        companyIds.add(String(companyId))
      }
    }

    if (companyIds.size) {
      const nameById = await getCompanyNamesByIds([...companyIds])
      for (const [contactId, companyId] of contactToCompany) {
        companyMap.set(contactId, {
          companyId,
          companyName: nameById.get(companyId) || null,
        })
      }
    }
  } catch (err) {
    console.warn('[mail-crm-sync] company enrichment skipped:', err.message)
  }

  return companyMap
}

export async function indexCrmContactsFromHubspot() {
  if (!isHubspotConfigured()) return { indexed: 0, skipped: true }

  let indexed = 0
  for await (const contacts of iterateExternalCrmContacts({ pageSize: 100 })) {
    const ids = contacts.map((c) => c.id)
    const companyInfo = await enrichCompanyNames(ids)

    for (const contact of contacts) {
      const email = String(contact.properties?.email || '').trim().toLowerCase()
      if (!email) continue
      const info = companyInfo.get(String(contact.id)) || {}
      await upsertCrmContactIndex({
        hubspotContactId: contact.id,
        hubspotCompanyId: info.companyId || contact.associations?.companies?.results?.[0]?.id || null,
        email,
        firstname: contact.properties?.firstname || null,
        lastname: contact.properties?.lastname || null,
        companyName: info.companyName || null,
      })
      indexed += 1
    }
  }
  return { indexed }
}

export async function syncContactThreadsForMailbox(mailbox, email, { force = false } = {}) {
  const normalized = String(email || '').trim().toLowerCase()
  const box = String(mailbox || '').trim().toLowerCase()
  if (!normalized || !box || !isGraphInboxAvailable()) return { skipped: true }

  if (!force) {
    const cached = await getCachedThreads(box, normalized)
    if (cached && !cached.stale) {
      return { cached: true, thread_count: cached.threads?.length || 0 }
    }
  }

  const data = await fetchContactThreadsFromGraph({ mailbox: box, email: normalized, limit: 50 })
  await upsertCachedThreads(box, normalized, data.threads || [], data.total_messages || 0)
  return {
    cached: false,
    thread_count: (data.threads || []).length,
    total_messages: data.total_messages || 0,
  }
}

export async function runMailCrmSyncCycle({ reason = 'scheduled' } = {}) {
  if (syncRunning) {
    return { skipped: true, reason: 'already_running', lastRunSummary }
  }
  if (!isHubspotConfigured() || !isGraphInboxAvailable()) {
    return { skipped: true, reason: 'not_configured' }
  }

  syncRunning = true
  const startedAt = new Date()
  const errors = []
  let contactsIndexed = 0
  let threadsSynced = 0

  const [logResult] = await db.query(
    `INSERT INTO mail_sync_log (started_at, status) VALUES (?, 'running')`,
    [startedAt],
  )
  const logId = logResult.insertId

  try {
    const indexResult = await indexCrmContactsFromHubspot()
    contactsIndexed = indexResult.indexed || 0

    const mailboxes = listCommercialMailboxes().map((m) => m.mailbox)
    for (const box of mailboxes) {
      await db.query(
        `DELETE m FROM mail_thread_cache m
         LEFT JOIN crm_contacts_index c ON c.email = m.contact_email
         WHERE m.mailbox = ? AND c.id IS NULL`,
        [box],
      )
      const emails = await getContactsNeedingSync(box, { limit: SYNC_CONTACTS_PER_MAILBOX })
      for (const email of emails) {
        try {
          const result = await syncContactThreadsForMailbox(box, email, { force: true })
          if (!result.skipped) threadsSynced += 1
          await sleep(SYNC_DELAY_MS)
        } catch (err) {
          errors.push({ mailbox: box, email, error: err.message })
          console.warn(`[mail-crm-sync] ${box} / ${email}:`, err.message)
        }
      }
    }

    const status = errors.length ? (threadsSynced ? 'partial' : 'error') : 'success'
    await db.query(
      `UPDATE mail_sync_log
       SET finished_at = NOW(), status = ?, contacts_indexed = ?, threads_synced = ?, errors_json = ?
       WHERE id = ?`,
      [status, contactsIndexed, threadsSynced, errors.length ? JSON.stringify(errors) : null, logId],
    )

    lastRunSummary = {
      reason,
      status,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      contacts_indexed: contactsIndexed,
      threads_synced: threadsSynced,
      errors: errors.length,
    }
    console.log(`[mail-crm-sync] ${status} — indexed ${contactsIndexed}, synced ${threadsSynced} contacts`)
    return lastRunSummary
  } catch (err) {
    await db.query(
      `UPDATE mail_sync_log
       SET finished_at = NOW(), status = 'error', contacts_indexed = ?, threads_synced = ?, errors_json = ?
       WHERE id = ?`,
      [contactsIndexed, threadsSynced, JSON.stringify([{ error: err.message }]), logId],
    )
    throw err
  } finally {
    syncRunning = false
  }
}

export async function getMailSyncStatus() {
  const [rows] = await db.query(
    `SELECT id, started_at, finished_at, status, contacts_indexed, threads_synced, errors_json
     FROM mail_sync_log
     ORDER BY id DESC
     LIMIT 1`,
  )
  const [countRows] = await db.query('SELECT COUNT(*) AS count FROM crm_contacts_index')
  const [cacheRows] = await db.query('SELECT COUNT(*) AS count FROM mail_thread_cache')

  return {
    running: syncRunning,
    last_run: lastRunSummary,
    last_log: rows[0] || null,
    crm_contacts_indexed: Number(countRows[0]?.count || 0),
    mail_cache_entries: Number(cacheRows[0]?.count || 0),
    sync_interval_ms: SYNC_INTERVAL_MS,
  }
}

export function startMailCrmSyncScheduler() {
  if (schedulerHandle) return
  if (!isHubspotConfigured() || !isGraphInboxAvailable()) {
    console.log('[mail-crm-sync] scheduler disabled (HubSpot or Graph not configured)')
    return
  }

  const tick = () => {
    runMailCrmSyncCycle({ reason: 'interval' }).catch((err) => {
      console.error('[mail-crm-sync] cycle failed:', err.message)
    })
  }

  if (SYNC_ON_START) {
    setTimeout(tick, 5000)
  }
  schedulerHandle = setInterval(tick, SYNC_INTERVAL_MS)
  console.log(`[mail-crm-sync] scheduler started (every ${Math.round(SYNC_INTERVAL_MS / 60000)} min)`)
}
