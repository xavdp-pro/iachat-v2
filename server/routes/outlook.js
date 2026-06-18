import { Router } from 'express'
import { getOutlookIntegrationStatus } from '../services/microsoftGraph.js'

const router = Router()

router.get('/status', async (_req, res) => {
  try {
    const status = await getOutlookIntegrationStatus()
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur statut Outlook' })
  }
})

export default router
