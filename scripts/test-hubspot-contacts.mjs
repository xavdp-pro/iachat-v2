/**
 * Descriptive connectivity test for HubSpot CRM Contacts API (prospects = contacts in HubSpot).
 *
 * Docs: https://developers.hubspot.com/docs/api/crm/contacts
 * Auth: Private app token → Authorization: Bearer <token>
 * Private app scopes (project): crm.schemas.deals.read, crm.objects.companies.read,
 *   crm.objects.deals.read, crm.objects.deals.write, crm.objects.contacts.read
 * This script only needs: crm.objects.contacts.read
 *
 * Setup:
 *   1. HubSpot: Settings → Integrations → Private Apps → Create (or Legacy private apps per HubSpot UI)
 *   2. Copy the access token, set in .env:
 *        HUBSPOT_PRIVATE_APP_TOKEN=pat-na1-xxxx
 *   3. Run: npm run test:hubspot
 *
 * Usage: cd iachat-v2 && npm run test:hubspot
 */
import 'dotenv/config'

const BASE = 'https://api.hubapi.com'
const PATH = '/crm/v3/objects/contacts'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim()
if (!token) {
  console.error('Missing HUBSPOT_PRIVATE_APP_TOKEN in environment (.env at project root or iachat-v2).')
  process.exit(1)
}

// Common contact properties; adjust or add via ?properties= in URL if needed
const params = new URLSearchParams({
  limit: String(process.env.HUBSPOT_CONTACTS_LIMIT || '10'),
  archived: 'false',
})
for (const p of ['email', 'firstname', 'lastname', 'company', 'phone']) {
  params.append('properties', p)
}

const url = `${BASE}${PATH}?${params.toString()}`

const ac = new AbortController()
const t = setTimeout(() => ac.abort(), 30000)

try {
  console.log('HubSpot CRM — list contacts (prospects)')
  console.log(`GET ${PATH}`)
  console.log(`Limit: ${params.get('limit')}`)
  console.log('---')

  const res = await fetch(url, {
    signal: ac.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  const text = await res.text()
  console.log(`HTTP: ${res.status} ${res.statusText}`)

  if (!res.ok) {
    console.error('Response body:', text.slice(0, 1200))
    process.exit(1)
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    console.error('Non-JSON body:', text.slice(0, 400))
    process.exit(1)
  }

  const results = data.results ?? []
  const total = results.length
  console.log(`Contacts returned: ${total}`)
  if (data.paging?.next?.after) {
    console.log('Pagination: more pages available (use ?after=<cursor> for next page)')
  }

  for (let i = 0; i < Math.min(total, 10); i++) {
    const row = results[i]
    const props = row.properties || {}
    const label = [props.firstname, props.lastname].filter(Boolean).join(' ') || '(no name)'
    console.log(`  ${i + 1}. id=${row.id} | ${label} | ${props.email || '—'} | ${props.company || '—'}`)
  }
  if (total > 10) {
    console.log(`  ... and ${total - 10} more on this page`)
  }

  console.log('---')
  console.log('OK: API reachable and contacts list retrieved.')
} catch (err) {
  console.error('REQUEST FAILED:', err.message)
  if (err.cause) console.error('Cause:', err.cause)
  process.exit(1)
} finally {
  clearTimeout(t)
}
