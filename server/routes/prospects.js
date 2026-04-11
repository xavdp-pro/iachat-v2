import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import {
  listCompanies,
  searchCompanies,
  getCompanyDetail,
  isHubspotConfigured,
} from '../services/hubspot.js'

const router = Router()
router.use(authenticate)

// GET /api/prospects/companies?q=&after=&limit=
router.get('/companies', async (req, res) => {
  try {
    if (!isHubspotConfigured()) {
      return res
        .status(503)
        .json({ error: 'HubSpot is not configured (set HUBSPOT_PRIVATE_APP_TOKEN in server env)' })
    }
    const { after, limit, q } = req.query
    const data = q
      ? await searchCompanies({ q, after, limit })
      : await listCompanies({ after, limit })
    res.json(data)
  } catch (err) {
    if (err.code === 'NO_TOKEN') {
      return res.status(503).json({ error: err.message })
    }
    console.error('[prospects] GET /companies', err)
    res.status(err.status >= 400 && err.status < 600 ? err.status : 500).json({
      error: err.message || 'HubSpot request failed',
    })
  }
})

// GET /api/prospects/companies/:id — company + contacts + deals
router.get('/companies/:id', async (req, res) => {
  try {
    if (!isHubspotConfigured()) {
      return res
        .status(503)
        .json({ error: 'HubSpot is not configured (set HUBSPOT_PRIVATE_APP_TOKEN in server env)' })
    }
    const data = await getCompanyDetail(req.params.id)
    res.json(data)
  } catch (err) {
    if (err.code === 'NO_TOKEN') {
      return res.status(503).json({ error: err.message })
    }
    console.error('[prospects] GET /companies/:id', err)
    res.status(err.status >= 400 && err.status < 600 ? err.status : 500).json({
      error: err.message || 'HubSpot request failed',
    })
  }
})

export default router
