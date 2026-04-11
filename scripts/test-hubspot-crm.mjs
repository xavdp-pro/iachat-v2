/**
 * Smoke test for HubSpot CRM APIs aligned with these Private App scopes:
 *   - crm.schemas.deals.read
 *   - crm.objects.companies.read
 *   - crm.objects.deals.read
 *   - crm.objects.deals.write  (not exercised here — avoid mutating production data)
 *   - crm.objects.contacts.read
 *
 * Calls:
 *   GET /crm/v3/objects/contacts
 *   GET /crm/v3/objects/companies
 *   GET /crm/v3/objects/deals
 *   GET /crm/v3/properties/deals   (schema / property definitions; needs crm.schemas.deals.read)
 *
 * Docs: https://developers.hubspot.com/docs/api/crm/understanding-the-crm
 *
 * Setup: HUBSPOT_PRIVATE_APP_TOKEN in .env
 * Usage: cd iachat-v2 && npm run test:hubspot:crm
 */
import 'dotenv/config'

const BASE = 'https://api.hubapi.com'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim()
if (!token) {
  console.error('Missing HUBSPOT_PRIVATE_APP_TOKEN in environment (.env).')
  process.exit(1)
}

const limit = String(process.env.HUBSPOT_PAGE_LIMIT || '5')

const ac = new AbortController()
const t = setTimeout(() => ac.abort(), 60000)

async function getJson(path, searchParams) {
  const qs = searchParams ? `?${searchParams}` : ''
  const url = `${BASE}${path}${qs}`
  const res = await fetch(url, {
    signal: ac.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { _raw: text }
  }
  return { path, url, status: res.status, ok: res.ok, body }
}

function printObjectRows(label, data, summarize) {
  const results = data.results ?? []
  console.log(`${label}: ${results.length} row(s) on this page`)
  for (let i = 0; i < Math.min(results.length, 5); i++) {
    console.log(`  ${summarize(results[i], i)}`)
  }
  if (results.length > 5) console.log(`  ... (${results.length - 5} more)`)
}

try {
  console.log('HubSpot CRM — scope smoke test')
  console.log('Scopes: crm.schemas.deals.read, crm.objects.companies.read, crm.objects.deals.read, crm.objects.deals.write (not used), crm.objects.contacts.read')
  console.log('---')

  // Contacts
  const contactParams = new URLSearchParams({ limit, archived: 'false' })
  for (const p of ['email', 'firstname', 'lastname', 'company']) {
    contactParams.append('properties', p)
  }
  const contacts = await getJson('/crm/v3/objects/contacts', contactParams.toString())
  console.log(`GET /crm/v3/objects/contacts → ${contacts.status}`)
  if (!contacts.ok) {
    console.error(JSON.stringify(contacts.body).slice(0, 800))
    process.exit(1)
  }
  printObjectRows('Contacts', contacts.body, (row) => {
    const props = row.properties || {}
    const name = [props.firstname, props.lastname].filter(Boolean).join(' ') || '(no name)'
    return `${name} | ${props.email || '—'}`
  })

  // Companies
  const companyParams = new URLSearchParams({ limit, archived: 'false' })
  for (const p of ['name', 'domain', 'city']) {
    companyParams.append('properties', p)
  }
  const companies = await getJson('/crm/v3/objects/companies', companyParams.toString())
  console.log(`GET /crm/v3/objects/companies → ${companies.status}`)
  if (!companies.ok) {
    console.error(JSON.stringify(companies.body).slice(0, 800))
    process.exit(1)
  }
  printObjectRows('Companies', companies.body, (row) => {
    const props = row.properties || {}
    return `${props.name || '(no name)'} | ${props.domain || '—'}`
  })

  // Deals
  const dealParams = new URLSearchParams({ limit, archived: 'false' })
  for (const p of ['dealname', 'amount', 'dealstage', 'pipeline']) {
    dealParams.append('properties', p)
  }
  const deals = await getJson('/crm/v3/objects/deals', dealParams.toString())
  console.log(`GET /crm/v3/objects/deals → ${deals.status}`)
  if (!deals.ok) {
    console.error(JSON.stringify(deals.body).slice(0, 800))
    process.exit(1)
  }
  printObjectRows('Deals', deals.body, (row) => {
    const props = row.properties || {}
    return `${props.dealname || '(no name)'} | ${props.amount ?? '—'} | stage ${props.dealstage || '—'}`
  })

  // Deal properties (schema) — crm.schemas.deals.read
  const propsDeals = await getJson('/crm/v3/properties/deals')
  console.log(`GET /crm/v3/properties/deals → ${propsDeals.status}`)
  if (!propsDeals.ok) {
    console.error(JSON.stringify(propsDeals.body).slice(0, 800))
    process.exit(1)
  }
  const propList = propsDeals.body.results ?? propsDeals.body
  const n = Array.isArray(propList) ? propList.length : 0
  console.log(`Deal property definitions: ${n} (schema read OK)`)
  if (n > 0 && propList[0]?.name) {
    console.log(`  e.g. first property: ${propList[0].name} (${propList[0].label || '—'})`)
  }

  console.log('---')
  console.log('OK: contacts, companies, deals, and deal schemas reachable.')
  console.log('Note: crm.objects.deals.write is not tested here (no PATCH/POST).')
} catch (err) {
  console.error('REQUEST FAILED:', err.message)
  if (err.cause) console.error('Cause:', err.cause)
  process.exit(1)
} finally {
  clearTimeout(t)
}
