/**
 * Grid row metadata persisted inside raw_json (object slot with _devisGridMeta flag).
 */

export function extractGridMeta(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list.find(item => item && typeof item === 'object' && item._devisGridMeta) || {}
}

export function stripGridMetaFromRaw(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list.filter(item => !(item && typeof item === 'object' && item._devisGridMeta))
}

export function buildGridMetaObject(row = {}) {
  const meta = { _devisGridMeta: true }
  if (Array.isArray(row._userOverrides) && row._userOverrides.length) {
    meta._userOverrides = [...row._userOverrides]
  }
  if (row._thermolaquageDisabled) meta._thermolaquageDisabled = true
  const opening = row.opening_sense || row.sens_ouverture || row.sens
  if (opening) meta.opening_sense = String(opening).trim()
  if (row.barre_seuil != null && String(row.barre_seuil).trim()) meta.barre_seuil = String(row.barre_seuil).trim()
  if (row.weather_exposed === true || row.exposition_intemperies === true) meta.exposition_intemperies = true
  if (row.weather_exposed === false || row.exposition_intemperies === false) meta.exposition_intemperies = false
  return Object.keys(meta).length > 1 ? meta : null
}

export function attachGridMetaToRaw(raw, row = {}) {
  const cells = stripGridMetaFromRaw(raw)
  const meta = buildGridMetaObject(row)
  return meta ? [...cells, meta] : cells
}

export function gridMetaToRowFields(meta = {}) {
  return {
    _userOverrides: Array.isArray(meta._userOverrides) ? meta._userOverrides : [],
    _thermolaquageDisabled: meta._thermolaquageDisabled === true,
    opening_sense: meta.opening_sense || null,
    sens_ouverture: meta.opening_sense || meta.sens_ouverture || null,
    barre_seuil: meta.barre_seuil || null,
    weather_exposed: meta.exposition_intemperies ?? null,
  }
}
