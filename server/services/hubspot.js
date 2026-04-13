/**
 * HubSpot CRM helpers (server-side only; token from env).
 * Scopes: crm.objects.companies.read, crm.objects.contacts.read, crm.objects.deals.read
 */

const BASE = 'https://api.hubapi.com'

const COMPANY_PROPS = [
  'name',
  'domain',
  'website',
  'phone',
  'city',
  'country',
  'zip',
  'industry',
  'numberofemployees',
  'description',
  'annualrevenue',
  'hs_lastmodifieddate',
  'createdate',
]

const CONTACT_PROPS = [
  'email',
  'firstname',
  'lastname',
  'phone',
  'jobtitle',
  'lifecyclestage',
  'hs_lead_status',
]

const DEAL_PROPS = [
  'dealname',
  'amount',
  'dealstage',
  'pipeline',
  'closedate',
  'createdate',
  'hs_priority',
]

function getToken() {
  return process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim() || null
}

async function hubspotFetch(path, { method = 'GET', body, query } = {}) {
  const token = getToken()
  if (!token) {
    const err = new Error('HUBSPOT_PRIVATE_APP_TOKEN is not configured')
    err.code = 'NO_TOKEN'
    throw err
  }
  let url = `${BASE}${path}`
  if (query && Object.keys(query).length) {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      if (Array.isArray(v)) v.forEach((item) => sp.append(k, item))
      else sp.append(k, String(v))
    }
    url += `?${sp.toString()}`
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { _raw: text }
  }
  if (!res.ok) {
    const msg =
      data.message ||
      data.errors?.[0]?.message ||
      data.error ||
      (typeof data === 'string' ? data : res.statusText)
    const err = new Error(msg || `HubSpot HTTP ${res.status}`)
    err.status = res.status
    err.body = data
    throw err
  }
  return data
}

/**
 * List companies (cursor pagination).
 */
export async function listCompanies({ after, limit = 25 }) {
  const lim = Math.min(Math.max(Number(limit) || 25, 1), 100)
  const query = {
    limit: lim,
    archived: 'false',
    properties: COMPANY_PROPS,
    associations: ['deals']
  }
  if (after) query.after = after

  return hubspotFetch('/crm/v3/objects/companies', { query })
}

/**
 * Search companies by name/domain token (HubSpot CRM search).
 */
export async function searchCompanies({ q, after, limit = 25 }) {
  const term = String(q || '')
    .trim()
    .slice(0, 200)
  if (!term) return listCompanies({ after, limit })

  const lim = Math.min(Math.max(Number(limit) || 25, 1), 100)
  const body = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: 'name',
            operator: 'CONTAINS_TOKEN',
            value: term,
          },
        ],
      },
      {
        filters: [
          {
            propertyName: 'domain',
            operator: 'CONTAINS_TOKEN',
            value: term,
          },
        ],
      },
    ],
    properties: COMPANY_PROPS,
    limit: lim,
    after: after || undefined,
  }

  const searchResults = await hubspotFetch('/crm/v3/objects/companies/search', { method: 'POST', body })

  // Since Search API doesn't support associations, we fetch them manually for the results
  if (searchResults.results?.length > 0) {
    const companyIds = searchResults.results.map(c => c.id)
    try {
      // Fetch associations in batch
      const assocRes = await hubspotFetch('/crm/v3/associations/companies/deals/batch/read', {
        method: 'POST',
        body: { inputs: companyIds.map(id => ({ id })) }
      })

      // Map associations back to companies
      const assocMap = {}
      assocRes.results?.forEach(r => {
        assocMap[r.from.id] = r.to?.map(t => ({ id: t.id })) || []
      })

      searchResults.results = searchResults.results.map(c => ({
        ...c,
        associations: {
          deals: {
            results: assocMap[c.id] || []
          }
        }
      }))
    } catch (e) {
      console.error('Error fetching associations for search results:', e.message)
    }
  }

  return searchResults
}

async function batchReadObjects(objectType, ids, properties) {
  if (!ids.length) return { results: [] }
  const all = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const inputs = chunk.map((id) => ({ id: String(id) }))
    const res = await hubspotFetch(`/crm/v3/objects/${objectType}/batch/read`, {
      method: 'POST',
      body: { properties, inputs },
    })
    all.push(...(res.results || []))
  }
  return { results: all }
}

function associationIds(company, type) {
  const block = company?.associations?.[type]
  const results = block?.results
  if (!Array.isArray(results)) return []
  const seen = new Set()
  const out = []
  for (const r of results) {
    const id = String(r.id)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

const NOTE_PROPS = [
  'hs_note_body',
  'hs_attachment_ids',
  'hs_timestamp',
]

async function getDealAttachments(dealIds) {
  if (!dealIds.length) return {}
  const attachmentsByDeal = {}

  for (const dealId of dealIds) {
    try {
      // 1. Fetch associations for notes, emails, and meetings
      const types = ['notes', 'emails', 'meetings']
      // Map fileId -> { name, url, size, source }
      const filesMap = new Map()

      for (const type of types) {
        const res = await hubspotFetch(`/crm/v3/objects/deals/${dealId}/associations/${type}`)
        const assocIds = res.results?.map(r => r.id) || []

        if (assocIds.length > 0) {
          // Batch read the objects to get hs_attachment_ids and body to distinguish Note vs Manual Upload
          const objects = await batchReadObjects(type, assocIds, ['hs_attachment_ids', 'hs_note_body'])
          for (const obj of objects.results || []) {
            const props = obj.properties || {}
            const ids = props.hs_attachment_ids?.split(';') || []
            const validIds = ids.filter(Boolean)

            for (const fileId of validIds) {
              if (!filesMap.has(fileId)) {
                // Determine source label
                let source = 'Document'
                if (type === 'notes') {
                  // If note has no body but has attachment, it's usually a "Manual upload" in HubSpot
                  const hasBody = props.hs_note_body && props.hs_note_body.trim().length > 0;
                  source = hasBody ? 'Note' : 'Dépôt'
                }
                else if (type === 'emails') source = 'Email'
                else if (type === 'meetings') source = 'RDV'

                filesMap.set(fileId, { id: fileId, source })
              }
            }
          }
        }
      }

      if (filesMap.size > 0) {
        const files = []
        for (const [fileId, partialInfo] of filesMap.entries()) {
          try {
            const fileInfo = await hubspotFetch(`/files/v3/files/${fileId}`)
            if (fileInfo.extension === 'pdf' || fileInfo.mimetype === 'application/pdf') {
              files.push({
                ...partialInfo,
                name: fileInfo.name,
                url: fileInfo.url,
                size: fileInfo.size,
                createdAt: fileInfo.createdAt
              })
            }
          } catch (e) {
            // Silently ignore individual file fetch errors
          }
        }
        if (files.length > 0) {
          attachmentsByDeal[dealId] = files
        }
      }
    } catch (e) {
      console.error(`Error fetching attachments for deal ${dealId}:`, e.message)
    }
  }
  return attachmentsByDeal
}

/**
 * Single company with properties + associated contacts and deals (hydrated).
 */
export async function getCompanyDetail(companyId) {
  const search = new URLSearchParams()
  for (const p of COMPANY_PROPS) search.append('properties', p)
  search.append('associations', 'contacts')
  search.append('associations', 'deals')

  const company = await hubspotFetch(`/crm/v3/objects/companies/${companyId}?${search.toString()}`)

  const contactIds = associationIds(company, 'contacts')
  const dealIds = associationIds(company, 'deals')

  const [contactsRes, dealsRes, attachmentsByDeal] = await Promise.all([
    batchReadObjects('contacts', contactIds, CONTACT_PROPS),
    batchReadObjects('deals', dealIds, DEAL_PROPS),
    getDealAttachments(dealIds)
  ])

  const deals = (dealsRes.results || []).map(d => ({
    ...d,
    attachments: attachmentsByDeal[d.id] || []
  }))

  return {
    company: {
      id: company.id,
      properties: company.properties || {},
    },
    contacts: contactsRes.results || [],
    deals,
    _meta: {
      contactIds: contactIds.length,
      dealIds: dealIds.length,
    },
  }
}

export function isHubspotConfigured() {
  return Boolean(getToken())
}
