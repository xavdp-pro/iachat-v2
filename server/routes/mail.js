import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import {
  getDefaultPreviewMailbox,
  listCommercialMailboxes,
  resolveMailbox,
} from '../services/mailbox.js'
import {
  fetchContactEmailsFromGraph,
  fetchContactThreadsFromGraph,
  fetchMessageAttachmentsFromGraph,
  isGraphInboxAvailable,
} from '../services/graph-inbox.js'
import { fetchContactEmails, fetchContactThreads, isImapConfigured } from '../services/imap-inbox.js'
import { getOutlookIntegrationStatus } from '../services/microsoftGraph.js'
import { FIXTURE_CONTACTS } from '../../infra/imap-test/seed/fixtures.mjs'
import {
  assertCrmContactEmail,
  getCachedThreads,
  listCrmContactsForPicker,
  upsertCachedThreads,
} from '../services/mail-cache.js'
import {
  getMailSyncStatus,
  runMailCrmSyncCycle,
  syncContactThreadsForMailbox,
} from '../services/mail-crm-sync.js'
import { isHubspotConfigured } from '../services/hubspot.js'

const router = Router()

function isLocalImapTest() {
  return process.env.IMAP_HOST === '127.0.0.1' && String(process.env.IMAP_PORT || '') === '1143'
}

function shouldEnforceCrmFilter() {
  return isHubspotConfigured()
}

function resolveContext(req) {
  const previewMailbox = req.query.preview_mailbox || req.body?.preview_mailbox || null
  return resolveMailbox(req.user, { previewMailbox })
}

async function loadContactThreads({ mailbox, email, limit, preferCache = true }) {
  if (isGraphInboxAvailable() && preferCache) {
    const cached = await getCachedThreads(mailbox, email)
    if (cached && !cached.stale) {
      return {
        configured: true,
        mode: 'graph',
        mailbox,
        threads: cached.threads,
        total_messages: cached.total_messages,
        contact_email: email,
        read_only: true,
        cache_source: 'cache',
        synced_at: cached.synced_at,
      }
    }
  }

  if (isGraphInboxAvailable()) {
    const data = await fetchContactThreadsFromGraph({ mailbox, email, limit })
    await upsertCachedThreads(mailbox, email, data.threads || [], data.total_messages || 0)
    return {
      ...data,
      cache_source: 'live',
      synced_at: new Date().toISOString(),
    }
  }

  return fetchContactThreads({ email, limit })
}

router.get('/status', authenticate, async (req, res) => {
  try {
    const ctx = resolveContext(req)
    const graphOk = isGraphInboxAvailable()
    const imapOk = isImapConfigured()
    const outlook = await getOutlookIntegrationStatus({ mailbox: ctx.mailbox })
    const syncStatus = await getMailSyncStatus().catch(() => null)
    res.json({
      configured: graphOk || imapOk,
      mode: graphOk ? 'graph' : (isLocalImapTest() ? 'dovecot-test' : (imapOk ? 'imap' : 'disabled')),
      mailbox: ctx.mailbox,
      mailbox_mode: ctx.mode,
      read_only: ctx.read_only,
      preview_as: ctx.preview_as || null,
      graph: outlook,
      commercial_mailboxes: listCommercialMailboxes(),
      default_preview_mailbox: getDefaultPreviewMailbox(),
      crm_filter: isHubspotConfigured(),
      mail_sync: syncStatus,
      test_contacts: isLocalImapTest() ? FIXTURE_CONTACTS : undefined,
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur statut mail' })
  }
})

router.get('/sync-status', authenticate, requireAdmin, async (req, res) => {
  try {
    res.json(await getMailSyncStatus())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/sync', authenticate, requireAdmin, async (req, res) => {
  try {
    const summary = await runMailCrmSyncCycle({ reason: 'manual' })
    res.json(summary)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/crm-contacts', authenticate, async (req, res) => {
  try {
    if (!isHubspotConfigured()) {
      return res.status(503).json({ error: 'HubSpot non configuré' })
    }
    const ctx = resolveContext(req)
    const q = String(req.query.q || '').trim()
    const withThreads = String(req.query.with_threads || '') === '1'
    const limit = Number(req.query.limit || 50)
    const contacts = await listCrmContactsForPicker({
      q,
      mailbox: ctx.mailbox,
      withThreads,
      limit,
    })
    res.json({
      contacts,
      mailbox: ctx.mailbox,
      total: contacts.length,
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur liste contacts CRM' })
  }
})

router.get('/contact-threads', authenticate, async (req, res) => {
  try {
    const email = String(req.query.email || '').trim()
    const limit = Number(req.query.limit || 50)
    const ctx = resolveContext(req)

    if (shouldEnforceCrmFilter()) {
      await assertCrmContactEmail(email)
    }

    const data = await loadContactThreads({
      mailbox: ctx.mailbox,
      email: email.toLowerCase(),
      limit,
      preferCache: true,
    })
    return res.json({ ...data, mailbox_mode: ctx.mode, read_only: ctx.read_only })
  } catch (err) {
    console.error('mail contact-threads:', err)
    res.status(err.status || 500).json({ error: err.message || 'Erreur chargement conversations' })
  }
})

router.get('/contact-emails', authenticate, async (req, res) => {
  try {
    const email = String(req.query.email || '').trim()
    const offset = Number(req.query.offset || 0)
    const limit = Number(req.query.limit || 5)
    const ctx = resolveContext(req)

    if (shouldEnforceCrmFilter()) {
      await assertCrmContactEmail(email)
    }

    if (isGraphInboxAvailable()) {
      const data = await fetchContactEmailsFromGraph({ mailbox: ctx.mailbox, email, offset, limit })
      syncContactThreadsForMailbox(ctx.mailbox, email).catch(() => {})
      return res.json({ ...data, mailbox_mode: ctx.mode, read_only: ctx.read_only })
    }

    const data = await fetchContactEmails({ email, offset, limit })
    res.json({ ...data, mode: isLocalImapTest() ? 'dovecot-test' : 'imap', read_only: true })
  } catch (err) {
    console.error('mail contact-emails:', err)
    res.status(err.status || 500).json({ error: err.message || 'Erreur chargement emails' })
  }
})

router.get('/messages/:graphId/attachments', authenticate, async (req, res) => {
  try {
    const graphId = String(req.params.graphId || '').trim()
    const ctx = resolveContext(req)
    if (!isGraphInboxAvailable()) {
      return res.json({ configured: false, attachments: [], read_only: true })
    }
    const data = await fetchMessageAttachmentsFromGraph({ mailbox: ctx.mailbox, graphId })
    res.json({ ...data, mailbox_mode: ctx.mode })
  } catch (err) {
    console.error('mail attachments:', err)
    res.status(err.status || 500).json({ error: err.message || 'Erreur pièces jointes' })
  }
})

export default router
