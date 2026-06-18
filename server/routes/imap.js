import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { fetchContactEmails, fetchContactThreads, isImapConfigured } from '../services/imap-inbox.js'

import { FIXTURE_CONTACTS } from '../../infra/imap-test/seed/fixtures.mjs'

const router = Router()

router.get('/status', authenticate, (_req, res) => {
  const configured = isImapConfigured()
  const isLocalTest = process.env.IMAP_HOST === '127.0.0.1' && String(process.env.IMAP_PORT || '') === '1143'
  res.json({
    configured,
    mode: isLocalTest ? 'dovecot-test' : (configured ? 'production' : 'disabled'),
    test_contacts: isLocalTest ? FIXTURE_CONTACTS : undefined,
  })
})

router.get('/test-contacts', authenticate, (_req, res) => {
  const isLocalTest = process.env.IMAP_HOST === '127.0.0.1' && String(process.env.IMAP_PORT || '') === '1143'
  res.json({ contacts: isLocalTest ? FIXTURE_CONTACTS : [] })
})

router.get('/contact-threads', authenticate, async (req, res) => {
  try {
    const email = String(req.query.email || '').trim()
    const limit = Number(req.query.limit || 50)
    const data = await fetchContactThreads({ email, limit })
    res.json(data)
  } catch (err) {
    console.error('imap contact-threads:', err)
    res.status(500).json({ error: err.message || 'Erreur IMAP' })
  }
})

router.get('/contact-emails', authenticate, async (req, res) => {
  try {
    const email = String(req.query.email || '').trim()
    const offset = Number(req.query.offset || 0)
    const limit = Number(req.query.limit || 5)
    const data = await fetchContactEmails({ email, offset, limit })
    res.json(data)
  } catch (err) {
    console.error('imap contact-emails:', err)
    res.status(500).json({ error: err.message || 'Erreur IMAP' })
  }
})

export default router
