import db from '../db/index.js'

const SUPPORTED = ['EUR', 'CHF', 'GBP', 'USD']
const DEFAULT_RATES = { EUR: 1.0, CHF: 0.9, GBP: 0.9, USD: 1.2 }
const DEFAULT_TVA = { EUR: 0.2, CHF: 0.081, GBP: 0, USD: 0 }

function currentSemesterKey(date = new Date()) {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  return month <= 6 ? `${year}-H1` : `${year}-H2`
}

function needsReview(date = new Date()) {
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (month === 1 && day === 1) return true
  if (month === 6 && day === 1) return true
  return false
}

export async function listExchangeRates() {
  const [rows] = await db.query(
    'SELECT currency, rate_to_eur, tva_rate, last_validated_at, validated_by FROM exchange_rates ORDER BY currency ASC'
  )
  const map = new Map(rows.map(r => [r.currency, r]))
  return SUPPORTED.map(currency => {
    const row = map.get(currency)
    return {
      currency,
      rate_to_eur: row ? Number(row.rate_to_eur) : DEFAULT_RATES[currency],
      tva_rate: row ? Number(row.tva_rate) : (DEFAULT_TVA[currency] ?? 0.2),
      last_validated_at: row?.last_validated_at || null,
      validated_by: row?.validated_by || null,
    }
  })
}

export async function getExchangeRatesStatus() {
  const rates = await listExchangeRates()
  const semester = currentSemesterKey()
  const [[validation]] = await db.query(
    'SELECT semester_key, validated_at, validated_by FROM exchange_rate_validations WHERE semester_key = ? LIMIT 1',
    [semester]
  )
  const alertActive = needsReview() && !validation
  return {
    semester,
    alert_active: alertActive,
    needs_review: needsReview(),
    validated: Boolean(validation),
    validated_at: validation?.validated_at || null,
    rates,
  }
}

export async function validateExchangeRates({ userId, rates = null, confirmUnchanged = false } = {}) {
  const semester = currentSemesterKey()
  const current = await listExchangeRates()
  const nextRates = rates || current
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    for (const item of nextRates) {
      if (!SUPPORTED.includes(item.currency)) continue
      await conn.query(
        `INSERT INTO exchange_rates (currency, rate_to_eur, tva_rate, last_validated_at, validated_by)
         VALUES (?, ?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE rate_to_eur = VALUES(rate_to_eur), tva_rate = VALUES(tva_rate),
           last_validated_at = NOW(), validated_by = VALUES(validated_by)`,
        [
          item.currency,
          Number(item.rate_to_eur) || DEFAULT_RATES[item.currency],
          Number(item.tva_rate ?? DEFAULT_TVA[item.currency] ?? 0.2),
          userId || null,
        ]
      )
    }
    await conn.query(
      `INSERT INTO exchange_rate_validations (semester_key, validated_at, validated_by, unchanged)
       VALUES (?, NOW(), ?, ?)
       ON DUPLICATE KEY UPDATE validated_at = NOW(), validated_by = VALUES(validated_by), unchanged = VALUES(unchanged)`,
      [semester, userId || null, confirmUnchanged ? 1 : 0]
    )
    await conn.commit()
    return getExchangeRatesStatus()
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

export function convertFromEur(amountEur, currency, ratesMap) {
  const rate = ratesMap?.[currency] ?? DEFAULT_RATES[currency] ?? 1
  if (currency === 'EUR') return Number(amountEur) || 0
  return (Number(amountEur) || 0) * rate
}

export { SUPPORTED, DEFAULT_RATES, DEFAULT_TVA, currentSemesterKey, needsReview }
