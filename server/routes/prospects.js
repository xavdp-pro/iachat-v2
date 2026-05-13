import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import {
  listCompanies,
  searchCompanies,
  getCompanyDetail,
  createDealForCompany,
  updateDeal,
  deleteDeal,
  listUsers,
  isHubspotConfigured,
} from '../services/hubspot.js'

const router = Router()
router.use(authenticate)

// GET /api/prospects/users?after=&limit= — HubSpot CRM users
router.get('/users', async (req, res) => {
  try {
    if (!isHubspotConfigured()) {
      return res
        .status(503)
        .json({ error: 'HubSpot is not configured (set HUBSPOT_PRIVATE_APP_TOKEN in server env)' })
    }
    const { after, limit } = req.query
    const data = await listUsers({ after, limit })
    res.json(data)
  } catch (err) {
    if (err.code === 'NO_TOKEN') {
      return res.status(503).json({ error: err.message })
    }
    console.error('[prospects] GET /users', err)
    res.status(err.status >= 400 && err.status < 600 ? err.status : 500).json({
      error: err.message || 'HubSpot request failed',
      details: err.body || undefined,
    })
  }
})

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

// POST /api/prospects/companies/:id/deals — create a new deal linked to the company
router.post('/companies/:id/deals', async (req, res) => {
  try {
    if (!isHubspotConfigured()) {
      return res
        .status(503)
        .json({ error: 'HubSpot is not configured (set HUBSPOT_PRIVATE_APP_TOKEN in server env)' })
    }

    const { dealname, amount, pipeline, dealstage } = req.body || {}
    const deal = await createDealForCompany({
      companyId: req.params.id,
      dealname,
      amount,
      pipeline,
      dealstage,
    })

    res.status(201).json(deal)
  } catch (err) {
    if (err.code === 'NO_TOKEN') {
      return res.status(503).json({ error: err.message })
    }
    console.error('[prospects] POST /companies/:id/deals', err)
    res.status(err.status >= 400 && err.status < 600 ? err.status : 500).json({
      error: err.message || 'HubSpot request failed',
    })
  }
})

// PATCH /api/prospects/deals/:dealId — update a deal (rename, change amount, etc.)
router.patch('/deals/:dealId', async (req, res) => {
  try {
    if (!isHubspotConfigured()) {
      return res
        .status(503)
        .json({ error: 'HubSpot is not configured (set HUBSPOT_PRIVATE_APP_TOKEN in server env)' })
    }

    const { dealname, amount, pipeline, dealstage } = req.body || {}
    const deal = await updateDeal(req.params.dealId, { dealname, amount, pipeline, dealstage })

    res.json(deal)
  } catch (err) {
    if (err.code === 'NO_TOKEN') {
      return res.status(503).json({ error: err.message })
    }
    console.error('[prospects] PATCH /deals/:dealId', err)
    res.status(err.status >= 400 && err.status < 600 ? err.status : 500).json({
      error: err.message || 'HubSpot request failed',
    })
  }
})

// DELETE /api/prospects/deals/:dealId — archive/delete a HubSpot deal
router.delete('/deals/:dealId', async (req, res) => {
  try {
    if (!isHubspotConfigured()) {
      return res
        .status(503)
        .json({ error: 'HubSpot is not configured (set HUBSPOT_PRIVATE_APP_TOKEN in server env)' })
    }

    const result = await deleteDeal(req.params.dealId)
    res.json(result)
  } catch (err) {
    if (err.code === 'NO_TOKEN') {
      return res.status(503).json({ error: err.message })
    }
    console.error('[prospects] DELETE /deals/:dealId', err)
    res.status(err.status >= 400 && err.status < 600 ? err.status : 500).json({
      error: err.message || 'HubSpot request failed',
    })
  }
})

export default router
