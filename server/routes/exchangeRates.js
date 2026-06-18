import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { getExchangeRatesStatus, listExchangeRates, validateExchangeRates } from '../services/exchange-rates.js'

const router = Router()

router.get('/status', authenticate, async (_req, res) => {
  try {
    res.json(await getExchangeRatesStatus())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', authenticate, async (_req, res) => {
  try {
    res.json({ rates: await listExchangeRates() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/validate', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await validateExchangeRates({
      userId: req.user?.id,
      rates: Array.isArray(req.body?.rates) ? req.body.rates : null,
      confirmUnchanged: Boolean(req.body?.confirm_unchanged),
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
