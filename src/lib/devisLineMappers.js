/**
 * Shared DB ↔ grid row mapping (stepper + standalone grid).
 */
import { computePassageDimensions } from '../pages/DevisGrid.jsx'
import { attachGridMetaToRaw, extractGridMeta, gridMetaToRowFields } from './gridRowMeta.js'

export { attachGridMetaToRaw, extractGridMeta, gridMetaToRowFields } from './gridRowMeta.js'

export function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try { return JSON.parse(value) || [] } catch { return [] }
}

export function dbLineToGridRow(line) {
  const raw = line.raw_json ? parseJsonArray(line.raw_json) : undefined
  const meta = extractGridMeta(raw)
  const metaFields = gridMetaToRowFields(meta)
  const row = {
    _lineId: line.id,
    _dbPosition: line.position,
    line_section: line.line_section || 'products',
    localisation: line.localisation || '',
    type: line.type_porte || line.designation || '',
    designation: line.designation || line.type_porte || '',
    gamme: line.gamme || '',
    vantail: line.vantail || '',
    haut_mm: line.hauteur_mm ?? null,
    larg_mm: line.largeur_mm ?? null,
    prix_base_ht: line.prix_base_ht != null ? Number(line.prix_base_ht) : null,
    ref_base: line.ref_base || null,
    options: parseJsonArray(line.options_json),
    serrure: line.serrure_ref ? { ref: line.serrure_ref } : null,
    ferme_porte: line.ferme_porte_ref ? { ref: line.ferme_porte_ref } : null,
    equip_extra: parseJsonArray(line.equipements_json),
    alertes: parseJsonArray(line.alertes_json),
    docs: parseJsonArray(line.docs_json),
    _raw: raw,
    ...metaFields,
    qty: line.qty != null ? Number(line.qty) : 1,
    multiple: line.multiple != null ? Number(line.multiple) : 1,
    weight_kg: line.weight_kg != null ? Number(line.weight_kg) : null,
    total_ligne_ht: line.total_ligne_ht != null ? Number(line.total_ligne_ht) : null,
  }
  return { ...row, ...computePassageDimensions(row) }
}

export function gridRowToLinePayload(row, position, resolveRowFn = null) {
  const resolved = typeof resolveRowFn === 'function' ? resolveRowFn(row) : row
  const rawJson = attachGridMetaToRaw(row._raw, row)
  const lineTotal = resolved?._unpriced
    ? null
    : (row.line_section === 'products' || !row.line_section
      ? (resolved?._pu ?? row.total_ligne_ht ?? row.prix_total_min_ht ?? null)
      : (row.total_ligne_ht ?? row.prix_total_min_ht ?? resolved?._pu ?? null))
  return {
    position,
    line_section: row.line_section || 'products',
    localisation: row.localisation || null,
    designation: row.designation || row.type || null,
    type_porte: row.type || row.designation || null,
    gamme: row.gamme || null,
    vantail: row.vantail || null,
    hauteur_mm: row.haut_mm ?? row.hauteur_mm ?? null,
    largeur_mm: row.larg_mm ?? row.largeur_mm ?? null,
    prix_base_ht: row.prix_base_ht ?? null,
    ref_base: row.ref_base || null,
    raw_json: rawJson,
    options_json: row.options || [],
    serrure_ref: row.serrure?.ref || row._serrureLabel || null,
    serrure_prix: row.serrure?.prix ?? null,
    ferme_porte_ref: row.ferme_porte?.ref || row._fpLabel || null,
    ferme_porte_prix: row.ferme_porte?.prix ?? null,
    equipements_json: row.equip_extra || [],
    qty: row.qty != null ? Number(row.qty) : 1,
    multiple: row.multiple != null ? Number(row.multiple) : 1,
    weight_kg: row.weight_kg != null ? Number(row.weight_kg) : null,
    total_ligne_ht: lineTotal,
    alertes_json: row.alertes || [],
    docs_json: row.docs || [],
  }
}
