/**
 * DevisGrid — Vue tableur "mode Armand"
 * Route : /devis/grid
 * Layout : gauche (import fichiers) | centre (grille) | droite (chat Gemma)
 * Phase MVP : lecture seule + expand/collapse sous-rows
 */
import { useState, useCallback, useRef, useEffect, Fragment } from 'react'
import { Upload, RefreshCw, ChevronRight, ChevronDown, AlertTriangle, MessageSquare, ArrowLeft, PanelLeftClose, PanelLeftOpen, Plus, Minus, X, Check, Loader2, Settings, Trash2, Calculator, Truck, Package, EyeOff, Eye, BookOpen, ShieldCheck, Sparkles, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../api/index.js'
import Select from 'react-select'

// ─── Palettes ──────────────────────────────────────────────────────────────
const CELL = {
  yellow:  { background: 'rgba(255,210,80,0.13)', border: '1px solid rgba(255,200,50,0.35)' },
  gray:    { background: 'rgba(120,130,140,0.10)', border: '1px solid transparent' },
  blue:    { background: 'rgba(60,110,200,0.10)',  border: '1px solid transparent' },
  normal:  { background: 'transparent',            border: '1px solid transparent' },
}
const SUBROW_BG = 'rgba(0,0,0,0.07)'
const GRID_TOTAL_COLS = 22
const DIMENSION_COLUMNS = ['haut_ht', 'larg_ht', 'haut_pl', 'larg_pl']

// ─── Helpers ───────────────────────────────────────────────────────────────
function rowLetterLabel(index) {
  let n = index + 1
  let label = ''
  while (n > 0) {
    n -= 1
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26)
  }
  return label
}

function extractRef(str) {
  if (!str) return null
  const text = String(str)
  const refMatch = text.match(/r[ée]f\.?\s*([34]\d{3})\b/i)
  if (refMatch) return refMatch[1]
  const m = text.match(/\b([34]\d{3})\b/)
  return m ? m[1] : null
}

function equipmentText(value, depth = 0) {
  if (value == null || depth > 2) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(item => equipmentText(item, depth + 1)).join(' ')
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !/^_/u.test(key))
      .map(([, item]) => equipmentText(item, depth + 1))
      .join(' ')
  }
  return ''
}

function extractOptionRef(option) {
  return extractRef(option?.ref) || extractRef(option?.note) || extractRef(option?.label) || extractRef(equipmentText(option)) || null
}

const DEFAULT_GARNITURE_REFS = {
  BASE: { int: '4024', ext: '4024' },
  CR3: { int: '4026', ext: '4026' },
  CR4: { int: '4181', ext: '4032' },
  CR5: { int: '4181', ext: null },
  CR6: { int: '4181', ext: null },
  FB: { int: '4026', ext: '4026' },
  EI: { int: '4024', ext: '4024' },
  BLAST: { int: '4181', ext: '4032' },
  EF2: { int: '4181', ext: '4032' },
}

const EQUIPMENT_REF_PRICES = {
  4024: 120.36,
  4026: 117.84,
  4032: 192.15,
  4181: null,
}

function equipmentPriceByRef(ref) {
  const key = String(ref || '').match(/\b([34]\d{3})\b/)?.[1]
  return key && Object.prototype.hasOwnProperty.call(EQUIPMENT_REF_PRICES, key) ? EQUIPMENT_REF_PRICES[key] : undefined
}

function inferGarnitureFamily(row) {
  const text = [row?.gamme, row?._raw?.[3], row?._raw?.[4], row?._raw?.[5], row?._raw?.[6], row?.ref_base]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
  if (/BLAST/.test(text)) return 'BLAST'
  if (/EF2/.test(text)) return 'EF2'
  if (/EI\s*60|EI\s*120/.test(text)) return 'EI'
  if (/FB\s*[4567]|PARE.?BALLES/.test(text)) return 'FB'
  if (/CR6/.test(text)) return 'CR6'
  if (/CR5/.test(text)) return 'CR5'
  if (/CR4/.test(text)) return 'CR4'
  if (/CR3|\b3100\b/.test(text)) return 'CR3'
  return 'BASE'
}

function fallbackGarnitureRef(row, side, label) {
  if (!label || !/b[ée]quille|poign[ée]e|garniture|plaque|pali[èe]re/i.test(String(label))) return null
  return DEFAULT_GARNITURE_REFS[inferGarnitureFamily(row)]?.[side] || null
}

function optionAsEquipment(option) {
  if (!option || typeof option !== 'object') return null
  return {
    label: option.label || option.designation || option.name || option.type || equipmentText(option).trim(),
    note: option.note || option.description || '',
    ref: extractOptionRef(option),
    prix: option.prix ?? option.price ?? option.pu_ht ?? option.prix_ht ?? option.amount,
    _fromOption: true,
  }
}

function thermolaquageTypeFromText(value) {
  const text = equipmentText(value).toUpperCase()
  if (/\bNCS\b/.test(text)) return 'NCS'
  if (/\bRAL\b|THERMOLAQUAGE|LAQUAGE/.test(text)) return 'RAL'
  return null
}

function thermolaquageInfo(row = {}) {
  const equipments = Array.isArray(row.equip_extra) ? row.equip_extra : []
  const equipment = equipments.find(item => /THERMOLAQUAGE|\bRAL\b|\bNCS\b|LAQUAGE/i.test(equipmentText(item)))
  const type = row.thermolaquage_type || thermolaquageTypeFromText(equipment) || thermolaquageTypeFromText(row._raw?.[16]) || (row.thermolaquage ? 'RAL' : null)
  return {
    type,
    label: equipment?.label || (type ? `Thermolaquage ${type}` : ''),
    ref: equipment?.ref || extractOptionRef(equipment),
    prix: equipment?.prix ?? equipment?.price ?? null,
    note: equipment?.note || '',
  }
}

function setThermolaquageInRawValue(current, nextType) {
  const cleaned = String(current || '')
    .replace(/\b(?:thermolaquage|laquage)\s*(?:RAL|NCS)?\b/giu, '')
    .replace(/\b(?:RAL|NCS)\b/giu, '')
    .replace(/\s*,\s*,+/g, ',')
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return nextType ? (cleaned ? `${cleaned}, ${nextType}` : nextType) : (cleaned || null)
}

function findExtraEquipment(row, pattern) {
  const extra = (row?.equip_extra || []).find(e => typeof e === 'object' && pattern.test(equipmentText(e)))
  if (extra) return extra
  const option = (row?.options || []).find(o => pattern.test(equipmentText(o)))
  return optionAsEquipment(option)
}

function nonCremoneExtraEquipments(row) {
  const cremoneRe = /cr[ée]mone|semi.?fixe|vam/i
  const thermolaquageRe = /thermolaquage|\bRAL\b|\bNCS\b|laquage/i
  const optionEquipmentRe = /judas|oeilleton|œilleton|plinthe|seuil|ventouse|contact|g[âa]che|b[ée]quille|poign[ée]e|garniture|serrure|ferme.?porte|anti.?panique|barre|paumelle|pivot|but[ée]e/i
  const extras = (row?.equip_extra || []).filter(e => typeof e === 'object' && !cremoneRe.test(equipmentText(e)) && !thermolaquageRe.test(equipmentText(e)))
  const optionExtras = (row?.options || [])
    .filter(o => optionEquipmentRe.test(equipmentText(o)) && !cremoneRe.test(equipmentText(o)))
    .filter(o => !/acoustique|\b(30|35|40|45)\s*dB\b|remplissage|vitrage|ferme.?porte|garniture|serrure|msl|lss|kel|d[ée]ny/i.test(equipmentText(o)))
    .map(optionAsEquipment)
    .filter(Boolean)
  return [...extras, ...optionExtras]
}

function isColumnEquipmentOption(option) {
  const text = equipmentText(option)
  return /cr[ée]mone|semi.?fixe|vam|judas|oeilleton|œilleton|plinthe|seuil|ventouse|contact|g[âa]che|anti.?panique|barre|paumelle|pivot|but[ée]e/i.test(text)
}

function mainEquipLabel(value) {
  if (!value) return ''
  return String(value)
    .replace(/^\s*[34]\d{3}\s*[—-]\s*/u, '')
    .replace(/\s*\(?\b(r[ée]f\.?|ref\.?)\s*[34]\d{3}\b\)?/giu, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function acousticValue(value) {
  const match = String(value || '').match(/\b(30|35|40|45)\s*dB\b/i)
  return match ? `${match[1]} dB` : null
}

function blastValue(value) {
  const text = String(value || '').replace(/,/g, '.').replace(/\s+/g, ' ')
  const match = text.match(/(?:blast\s*)?([245])\s*t(?:\s*\/\s*m(?:²|2))?/i)
  return match ? `${match[1]}t/m²` : null
}

function isAcousticValue(value) {
  return acousticValue(value) != null || /acoustique/i.test(String(value || ''))
}

function stripAcousticInfo(value) {
  return String(value || '')
    .replace(/\bacoustique\s*(30|35|40|45)?\s*dB\b/giu, '')
    .replace(/\b(30|35|40|45)\s*dB\b/giu, '')
    .replace(/\bacoustique\b/giu, '')
    .replace(/\s*[·,;|/+-]\s*$/u, '')
    .replace(/^\s*[·,;|/+-]\s*/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function isBlockingUnpricedRow(row) {
  const hasBasePrice = row?.prix_base_ht != null && Number(row.prix_base_ht) > 0
  if (hasBasePrice) return false
  const text = [
    row?.designation,
    row?.type,
    ...(Array.isArray(row?.alertes) ? row.alertes : []),
    ...(Array.isArray(row?.options) ? row.options.map(o => `${o.label || ''} ${o.note || ''}`) : []),
  ].filter(Boolean).join(' ')
  return /hors catalogue|nous consulter|impossible|pas de prix de base|non chiffrable/i.test(text)
}

function numberOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isChassisRow(row = {}) {
  const text = [row.type, row.designation, row.gamme, row.vantail, row.ref_base, ...(Array.isArray(row._raw) ? row._raw : [])]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
  return /\bCH\b|CHASSIS|CHÂSSIS|CHASSIS FIXE|CHÂSSIS FIXE|CHASSIS VITR[ÉE]|CHÂSSIS VITR[ÉE]/u.test(text)
}

function isTwoLeafRow(row = {}) {
  const text = [row.type, row.designation, row.vantail, ...(Array.isArray(row._raw) ? row._raw : [])]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
  return /\b2\s*V\b|\b2VSFX\b|2\s*VANTAUX|DEUX\s+VANTAUX/u.test(text)
}

export function computePassageDimensions(row = {}) {
  const hautHt = numberOrNull(row.haut_mm ?? row.hauteur_mm)
  const largHt = numberOrNull(row.larg_mm ?? row.largeur_mm)
  const chassis = isChassisRow(row)
  const twoLeaf = isTwoLeafRow(row)
  const hDelta = chassis ? 140 : 70
  const lDelta = chassis ? 140 : (twoLeaf ? 270 : 205)
  return {
    hauteur_pl_mm: hautHt != null ? hautHt - hDelta : null,
    largeur_pl_mm: largHt != null ? largHt - lDelta : null,
    hauteur_reservation_mm: hautHt != null ? hautHt + 10 : null,
    largeur_reservation_mm: largHt != null ? largHt + 10 : null,
    _dimensionMode: chassis ? 'cv' : 'pl',
    _dimensionLabel: chassis ? 'CV' : 'PL',
  }
}

function htPatchFromPassageDimension(row, field, value) {
  const n = numberOrNull(value)
  if (n == null) return {}
  const chassis = isChassisRow(row)
  const twoLeaf = isTwoLeafRow(row)
  if (field === 'hauteur_pl_mm') return { haut_mm: n + (chassis ? 140 : 70) }
  if (field === 'largeur_pl_mm') return { larg_mm: n + (chassis ? 140 : (twoLeaf ? 270 : 205)) }
  return {}
}

// eslint-disable-next-line react-refresh/only-export-components
export function resolveRow(r, change = 1, tva = 0.2, multGlobal = 1) {
  if (r?.line_section === 'calculations' || r?.line_section === 'transport') {
    const qty = r.qty ?? r.quantite ?? 1
    const unit = Number(r.prix_base_ht ?? r.total_ligne_ht ?? r.prix_total_min_ht ?? 0)
    const mult = Number.isFinite(r.multiple) ? r.multiple : (Number.isFinite(multGlobal) ? multGlobal : 1)
    const lineChange = Number.isFinite(r.change_override) ? r.change_override : change
    const pu = unit * lineChange
    const totalHt = pu * qty * mult
    return {
      ...r,
      _pu: pu,
      _totalHt: totalHt,
      _total: totalHt * (1 + tva),
      _refs: [r.ref_base || '—', '', '', '', ''],
      _prices: [unit, null, null, null, null],
      _sectionLabel: r.line_section === 'transport' ? 'Transport' : 'Calculs',
      _serrureLabel: '',
      _garnIntLabel: '',
      _garnExtLabel: '',
      _fpLabel: '',
      qty,
    }
  }
  const base   = r.prix_base_ht  ?? 0
  const unpriced = isBlockingUnpricedRow(r)
  const pv     = (r.options || []).reduce((s, o) => s + (o.prix || 0), 0)
  const pvExtra = (r.equip_extra || []).reduce((s, e) => s + (typeof e === 'object' ? (e.prix || 0) : 0), 0)
  const pu     = unpriced ? 0 : base + pv + pvExtra
  const qty    = Number.isFinite(r.qty) ? r.qty : 1
  // Multiple par-ligne (multiple) prend le pas sur le multiplicateur global
  const mult   = Number.isFinite(r.multiple) ? r.multiple : (Number.isFinite(multGlobal) ? multGlobal : 1)
  const lineChange = Number.isFinite(r.change_override) ? r.change_override : change
  const totalHt = Math.round(pu * qty * mult * lineChange)
  const total  = Math.round(totalHt * (1 + tva))
  // équipements structurés depuis les options + champs
  const serrure   = r.serrure?.ref  || null
  // options spécifiques
  const optionsText = (r.options || []).map(o => equipmentText(o)).join(' ')
  const optVitrage = (r.options || []).find(o => /remplissage|vitrage/i.test(equipmentText(o)) && stripAcousticInfo(equipmentText(o)))
  const optFP      = (r.options || []).find(o => /ferme.porte/i.test(o.label))
  const optSerrure = (r.options || []).find(o => /serrure|msl|lss|kel|dény/i.test(o.label))
  const optGarnInt = (r.options || []).find(o => /garniture int/i.test(o.label))
  const optGarnExt = (r.options || []).find(o => /garniture ext/i.test(o.label))
  const cremone = findExtraEquipment(r, /cr[ée]mone|semi.?fixe|vam/i)
  const otherExtras = nonCremoneExtraEquipments(r)
  const vitrageRef = optVitrage ? extractRef(optVitrage.note) || extractRef(optVitrage.label) : null
  const rawVitrage = stripAcousticInfo(r._raw?.[16]) || null
  const vitrageLabel = stripAcousticInfo(optVitrage?.label || optVitrage?.designation || optVitrage?.name) || rawVitrage
  const vitrageNote = stripAcousticInfo(optVitrage?.note || optVitrage?.description)
  const serrureRef = extractRef(r.serrure?.ref) || extractOptionRef(optSerrure) || extractRef(r.serrure?.from)
  const fpRef     = extractOptionRef(optFP) || extractRef(r.ferme_porte?.ref)
  const garnIntLabel = r.garnitures?.int || r._raw?.[13] || optGarnInt?.label
  const garnExtLabel = r.garnitures?.ext || r._raw?.[14] || optGarnExt?.label
  const garnInt   = extractRef(r.garnitures?.int) || extractRef(r.garniture_int_ref) || extractOptionRef(optGarnInt) || extractRef(r._raw?.[13]) || fallbackGarnitureRef(r, 'int', garnIntLabel)
  const garnExt   = extractRef(r.garnitures?.ext) || extractRef(r.garniture_ext_ref) || extractOptionRef(optGarnExt) || extractRef(r._raw?.[14]) || fallbackGarnitureRef(r, 'ext', garnExtLabel)
  const garnIntPrix = optGarnInt?.prix ?? equipmentPriceByRef(garnInt)
  const garnExtPrix = optGarnExt?.prix ?? equipmentPriceByRef(garnExt)
  const tlInfo = thermolaquageInfo(r)
  const thermolaquage = r.thermolaquage != null
    ? r.thermolaquage
    : !!tlInfo.type
  const blastPerf = blastValue(r._raw?.[6]) || blastValue(r.blast) || blastValue(optionsText) || blastValue(r.designation) || blastValue(r.alertes?.join(' '))
  const optAcoustic = (r.options || []).find(o => isAcousticValue(equipmentText(o)))
  const acousticRef = optAcoustic ? (extractRef(optAcoustic.note) || extractRef(optAcoustic.label)) : null
  const passageDims = computePassageDimensions(r)
  return {
    ...r,
    ...passageDims,
    _pu: pu,
    _pv: pv,
    _totalHt: totalHt,
    _total: total,
    thermolaquage,
    _blastValue: blastPerf,
    _unpriced: unpriced,
    _serrureRef: serrureRef,
    _fpRef: fpRef,
    _vitrageRef: vitrageRef,
    _vitrageLabel: vitrageLabel || null,
    _vitrageNote: vitrageNote || null,
    _vitragePrix: optVitrage?.prix ?? null,
    _acousticValue: r._overrideAcoustic !== undefined
      ? r._overrideAcoustic
      : (acousticValue(r._raw?.[16]) || acousticValue(r.acoustique) || acousticValue(optionsText)),
    _acousticRef: acousticRef,
    _acousticPrix: optAcoustic?.prix ?? null,
    _optAcoustic: optAcoustic,
    _garnIntRef: garnInt,
    _garnExtRef: garnExt,
    _garnIntPrix: garnIntPrix,
    _garnExtPrix: garnExtPrix,
    _fpLabel: r.ferme_porte?.ref ? r.ferme_porte.ref.replace(/ \(par défaut\)/, '') : null,
    _cremoneRef: extractRef(cremone?.ref) || extractRef(cremone?.note) || extractRef(cremone?.label),
    _cremoneLabel: cremone?.label || null,
    _cremoneNote: cremone?.note || null,
    _cremonePrix: cremone?.prix ?? null,
    _otherExtras: otherExtras,
    _otherExtrasRefs: otherExtras.map(e => e.ref || extractRef(e.note) || extractRef(e.label)).filter(Boolean),
    _otherExtrasPrix: otherExtras.reduce((sum, e) => sum + (Number(e.prix) || 0), 0),
    _thermolaquageType: tlInfo.type,
    _thermolaquageRef: tlInfo.ref,
    _thermolaquagePrix: tlInfo.prix,
    _thermolaquageLabel: tlInfo.label,
    _thermolaquageNote: tlInfo.note,
    _garnIntLabel: garnIntLabel,
    _garnExtLabel: garnExtLabel,
    _serrureLabel: serrure,
    _optVitrage: optVitrage,
    _optFP: optFP,
    _optSerrure: optSerrure,
    _optGarnInt: optGarnInt,
    _optGarnExt: optGarnExt,
  }
}

// ─── Composant cellule header ───────────────────────────────────────────────
function Th({ children, style = {}, ...props }) {
  return (
    <th style={{
      padding: '6px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.05em', color: 'var(--color-text-3)', whiteSpace: 'nowrap',
      background: 'var(--color-surface)', borderBottom: '2px solid var(--color-border)',
      position: 'sticky', top: 0, zIndex: 2,
      ...style,
    }} {...props}>
      {children}
    </th>
  )
}

// ─── Composant cellule data ──────────────────────────────────────────────────
function Td({ children, palette = 'normal', style = {}, ...props }) {
  return (
    <td {...props} style={{
      padding: '5px 8px', fontSize: 11, verticalAlign: 'middle',
      borderBottom: '1px solid var(--color-border)',
      ...CELL[palette],
      ...style,
    }}>
      {children}
    </td>
  )
}

// ─── Badge gamme ─────────────────────────────────────────────────────────────
const GAMME_COLORS = {
  'CR3': ['#2a4a7f','#a8c8ff'], 'CR4': ['#4a2060','#d8a8ff'],
  'CR5': ['#5a1a1a','#ffb0b0'], 'CR6': ['#1a3020','#80d080'],
  'FB4': ['#2a3050','#8898d8'], 'FB6': ['#2a3050','#8898d8'],
  'FB7': ['#2a3050','#6688cc'], 'EI60': ['#2a3a1a','#aacc70'],
  'EI120': ['#1a2a10','#90bb50'], 'BASE': ['#303030','#b0b0b0'],
  'Blast2t': ['#5a3010','#f0a060'], 'Blast4t': ['#4a2010','#e08040'],
}
function GammeBadge({ gamme, fullWidth }) {
  if (!gamme) return null
  const key = Object.keys(GAMME_COLORS).find(k => gamme.toUpperCase().includes(k.toUpperCase())) || 'BASE'
  const [bg, color] = GAMME_COLORS[key] || ['#303030', '#b0b0b0']
  return (
    <span style={{
      display: fullWidth ? 'block' : 'inline-block',
      width: fullWidth ? '100%' : 'auto',
      textAlign: fullWidth ? 'center' : 'left',
      padding: '1px 5px', borderRadius: 4,
      fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
      background: bg, color,
    }}>
      {gamme.replace('CHASSIS ', '⬜ ').replace(/^CHASSIS$/, '⬜')}
    </span>
  )
}

// Largeur calculée automatiquement après PERF_OPTIONS
const PERF_CONTROL_WIDTH = {}
const PERF_LABELS = { rc: 'RC', pb: 'PB', cf: 'CF', blast: 'Blast', belier: 'Bélier', prison: 'Prison', acoustic: 'dB' }

const perfActionButtonStyle = {
  width: 28,
  height: 26,
  flex: '0 0 28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'var(--color-surface)',
  color: 'var(--color-primary)',
  cursor: 'pointer',
  lineHeight: 1,
}

function performanceSearchText(row = {}) {
  return [
    row.type, row.designation, row.gamme, row.vantail, row.ref_base,
    row.serrure?.ref, row.serrure?.from, row.ferme_porte?.ref, row.ferme_porte?.from,
    equipmentText(row.options), equipmentText(row.equip_extra), equipmentText(row.alertes), equipmentText(row.docs),
    ...(Array.isArray(row._raw) ? row._raw : []),
  ].filter(Boolean).join(' ')
}

function inferredPerformanceValue(row = {}, key) {
  const text = performanceSearchText(row)
  const upper = text.toUpperCase()
  if (key === 'rc') return upper.match(/\bCR\s*([3-6])\b/)?.[0]?.replace(/\s+/g, '') || null
  if (key === 'pb') return upper.match(/\bFB\s*([4-7])\b/)?.[0]?.replace(/\s+/g, '') || null
  if (key === 'cf') {
    const match = upper.match(/\bEI\s*[²2]?\s*(30|60|90|120)\b/)
    return match ? `EI${match[1]}` : null
  }
  if (key === 'blast') return blastValue(text) || null
  if (key === 'belier') return /ANTI.?B[ÉE]LIER|\bB[ÉE]LIER\b/u.test(upper) ? 'Bélier' : null
  if (key === 'prison') return /\bPRISON\b/u.test(upper) ? 'Prison' : null
  if (key === 'acoustic') return upper.match(/\b(30|35|40|45)\s*DB\b/)?.[0]?.replace('DB', 'dB').replace(/\s+/g, ' ') || null
  return null
}

function performanceValue(row = {}, resolved = {}, key) {
  const rawIndexByPerf = { rc: 3, pb: 4, cf: 5, blast: 6, belier: 7, prison: 8, acoustic: null }
  if (key === 'acoustic') return row._overrideAcoustic !== undefined ? row._overrideAcoustic : (resolved._acousticValue || inferredPerformanceValue(row, key))
  if (key === 'blast') return resolved._blastValue || blastValue(row._raw?.[rawIndexByPerf[key]]) || inferredPerformanceValue(row, key)
  return row._raw?.[rawIndexByPerf[key]] ?? inferredPerformanceValue(row, key)
}

const amountHeaderCellStyle = {
  padding: '5px 8px',
  fontSize: 9,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--color-text-3)',
  background: 'color-mix(in srgb, var(--color-primary) 4%, var(--color-surface))',
  borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap',
}

function amountEuro(value) {
  if (value == null || value === '') return '—'
  const amount = Number(value)
  return Number.isFinite(amount) ? `${amount.toLocaleString('fr-FR')} €` : '—'
}

function transportAddressText(row, fallbackAddress = '') {
  return row?.delivery_address || row?.transport_address || row?.notes || row?.alertes?.[0] || fallbackAddress || ''
}

function parseTransportAddress(address = '') {
  const text = String(address || '').trim()
  const lower = text.toLowerCase()
  const postal = text.match(/\b\d{4,5}\b/)?.[0] || ''
  const cantonMatch = text.toUpperCase().match(/\b(GE|VD|VS|FR|NE|JU|BE|SO|BS|BL|AG|ZH|LU|ZG|NW|OW|UR|SZ|TI|GR|SH|TG|SG|GL|AR|AI)\b/)
  const countryMap = [
    ['suisse', 'CH'], ['switzerland', 'CH'], ['schweiz', 'CH'],
    ['belgique', 'Belgique'], ['belgium', 'Belgique'],
    ['luxembourg', 'Luxembourg'], ['espagne', 'Espagne'], ['spain', 'Espagne'],
    ['portugal', 'Portugal'], ['italie', 'Italie'], ['italy', 'Italie'],
    ['angleterre', 'Angleterre'], ['royaume-uni', 'Angleterre'], ['uk', 'Angleterre'],
    ['pays-bas', 'Pays-Bas'], ['netherlands', 'Pays-Bas'],
    ['danemark', 'Denmark'], ['denmark', 'Denmark'],
    ['allemagne', 'Allemagne'], ['germany', 'Allemagne'],
    ['autriche', 'Autriche'], ['austria', 'Autriche'],
  ]
  const countryEntry = countryMap.find(([needle]) => lower.includes(needle))
  const country = countryEntry?.[1] || (cantonMatch ? 'CH' : '')
  return {
    raw_address: text,
    postal_code: postal,
    canton: cantonMatch?.[1] || '',
    country,
    destination: country && country !== 'CH' ? country : '',
  }
}

function productLeafCount(rows = []) {
  return Math.max(1, rows.reduce((sum, row) => {
    if (sectionOf(row) !== 'products') return sum
    const qty = Number(row.qty ?? row.quantite ?? 1)
    const vantailText = String(row.vantail || row.type || row.designation || '')
    const leafFactor = /2\s*V|BP\s*2V/i.test(vantailText) ? 2 : 1
    return sum + (Number.isFinite(qty) && qty > 0 ? qty : 1) * leafFactor
  }, 0))
}

// ─── Modal : enregistrer une ligne comme règle R&D ───────────────────────────
function SaveAsRuleModal({ initial, onClose, onSave }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) { setError('Titre et contenu requis'); return }
    setSaving(true); setError('')
    try {
      await onSave({ title: title.trim(), content: content.trim() })
      setSaved(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Erreur serveur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '22px 24px', width: 520, maxWidth: '94vw', boxShadow: '0 8px 32px rgba(0,0,0,0.28)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 14, color: '#0f766e' }}>
            <BookOpen size={15} /> Enregistrer comme règle R&amp;D
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', padding: 4 }}><X size={15} /></button>
        </div>
        {saved ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e', fontWeight: 600, padding: '16px 0' }}>
            <Check size={18} /> Règle soumise ! Elle sera visible après validation par un admin.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)', display: 'block', marginBottom: 4 }}>Titre *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={255}
                autoFocus
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text)', fontSize: 13 }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)', display: 'block', marginBottom: 4 }}>Contenu / règle *</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={6}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text)', fontSize: 12, fontFamily: 'var(--font-mono, monospace)', resize: 'vertical' }}
              />
            </div>
            {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button type="submit" disabled={saving} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : 'Soumettre'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Modal : vérifier les règles IA sur une ligne ────────────────────────────
const VERDICT_STYLE = {
  ok:        { bg: 'rgba(34,197,94,0.1)',  text: '#16a34a', label: 'OK' },
  warning:   { bg: 'rgba(245,158,11,0.1)', text: '#b45309', label: 'Attention' },
  violation: { bg: 'rgba(239,68,68,0.1)',  text: '#dc2626', label: 'Violation' },
  na:        { bg: 'rgba(120,130,140,0.08)', text: 'var(--color-text-3)', label: 'N/A' },
}

function lineLikeForRuleValidation(row, position = 0) {
  return {
    position,
    designation: row.designation || row.type,
    localisation: row.localisation,
    type: row.type,
    gamme: row.gamme,
    vantail: row.vantail,
    haut_mm: row.haut_mm,
    larg_mm: row.larg_mm,
    prix_base_ht: row.prix_base_ht,
    ref_base: row.ref_base,
    prix_total_min_ht: row.prix_total_min_ht,
    options: row.options,
    equip_extra: row.equip_extra,
    serrure: row.serrure,
    ferme_porte: row.ferme_porte,
    alertes: row.alertes,
  }
}

function summarizeLineVerdicts(verdicts = []) {
  return verdicts.reduce((acc, verdict) => {
    acc[verdict.status] = (acc[verdict.status] || 0) + 1
    return acc
  }, { ok: 0, warning: 0, violation: 0, na: 0 })
}

function blockingVerdicts(row) {
  return (row?._ruleCheck?.verdicts || []).filter(v => v.status === 'violation' || v.status === 'warning')
}

function VerifyRulesModal({ row, onClose }) {
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const run = async () => {
      setLoading(true); setError('')
      try {
        const lineLike = lineLikeForRuleValidation(row, 0)
        const data = await api.post('/devis/validate-lines', { lines: [lineLike] })
        setResult(data)
      } catch (err) {
        setError(err?.response?.data?.error || err?.message || 'Erreur analyse')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [row])

  const summary = result?.summary || {}
  const verdicts = result?.lines?.[0]?.verdicts || []
  const shownVerdicts = verdicts.filter(v => v.status !== 'na')

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '22px 24px', width: 600, maxWidth: '96vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.28)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 14, color: 'var(--color-primary)' }}>
            <ShieldCheck size={15} /> Vérification des règles IA
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', padding: 4 }}><X size={15} /></button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginBottom: 12, padding: '6px 10px', background: 'var(--color-input-bg)', borderRadius: 6 }}>
          {row.designation || row.type || 'Ligne'} — {row.haut_mm}×{row.larg_mm} mm — {row.prix_base_ht ? `${Number(row.prix_base_ht).toLocaleString('fr-FR')} € HT` : 'prix N/A'}
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: 'var(--color-text-2)', fontSize: 13 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Analyse en cours…
          </div>
        )}

        {error && <div style={{ color: '#ef4444', fontSize: 12, padding: '10px 0' }}>{error}</div>}

        {result && !loading && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {[['ok', '#22c55e'], ['warning', '#f59e0b'], ['violation', '#ef4444']].map(([s, c]) =>
                summary[s] > 0 && (
                  <span key={s} style={{ fontSize: 11, fontWeight: 600, color: c, background: `${c}18`, padding: '3px 10px', borderRadius: 99 }}>
                    {summary[s]} {VERDICT_STYLE[s].label}
                  </span>
                )
              )}
              {result.rules_count === 0 && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Aucune règle approuvée trouvée.</span>}
            </div>

            {shownVerdicts.length === 0 && result.rules_count > 0 && (
              <div style={{ fontSize: 12, color: '#22c55e', padding: '8px 0' }}>✓ Toutes les règles sont respectées.</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shownVerdicts.map((v, vi) => {
                const s = VERDICT_STYLE[v.status] || VERDICT_STYLE.na
                return (
                  <div key={vi} style={{ background: s.bg, borderRadius: 7, padding: '9px 12px', borderLeft: `3px solid ${s.text}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: s.text, background: `${s.text}18`, padding: '1px 7px', borderRadius: 99 }}>{s.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{v.rule_code ? `${v.rule_code} — ` : ''}{v.rule_title}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-2)' }}>{v.reason}</div>
                    {v.fix && <div style={{ fontSize: 11, color: s.text, marginTop: 4 }}>→ {v.fix}</div>}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Composant ligne principale ──────────────────────────────────────────────
function MainRow({ row, index, displayIndex = index, expanded, onToggle, change, tva, multGlobal, editMode, onUpdate, onRecompute, onDelete, onSaveAsRule, onVerifyRules, onSuggestDesignation, suggestingDesignation = false, hiddenCols = new Set(), hiddenDimensionCols = new Set() }) {
  const r = resolveRow(row, change, tva, multGlobal)
  const qty = Number.isFinite(r.qty) ? r.qty : 1
  const isAmountSection = sectionOf(row) !== 'products'
  const dimensionHiddenStyle = (key) => hiddenDimensionCols.has(key) ? { display: 'none' } : {}
  const ruleSummary = row._ruleCheck?.summary || null
  const ruleIssues = blockingVerdicts(row)
  const [showEmptyPerfs, setShowEmptyPerfs] = useState(false)
  const perfKeys = ['rc', 'pb', 'cf', 'blast', 'belier', 'prison', 'acoustic']
  const rawIndexByPerf = { rc: 3, pb: 4, cf: 5, blast: 6, belier: 7, prison: 8, acoustic: null }
  const visiblePerfKeys = isAmountSection ? [] : (editMode && !showEmptyPerfs && !row._manualBlank
    ? perfKeys.filter(key => performanceValue(row, r, key) != null)
    : perfKeys)
  const hiddenPerfCount = perfKeys.length - visiblePerfKeys.length
  const canCollapseEmptyPerfs = editMode && !isAmountSection && showEmptyPerfs && !row._manualBlank && hiddenPerfCount === 0
  return (
    <tr
      onClick={onToggle}
      style={{
        cursor: 'pointer',
        background: expanded ? 'color-mix(in srgb, var(--color-primary) 5%, var(--color-surface))' : undefined,
        transition: 'background 0.1s',
      }}
    >
      {/* # */}
      <Td style={{ color: 'var(--color-text-3)', fontWeight: 700, width: 36 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {rowLetterLabel(displayIndex)}
          {r._recomputing && <RefreshCw size={9} style={{ animation: 'spin 1s linear infinite' }} />}
          {row._ruleChecking && <ShieldCheck size={9} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />}
          {!row._ruleChecking && ruleSummary && (
            <ShieldCheck size={9} style={{ color: ruleSummary.violation ? '#dc2626' : ruleSummary.warning ? '#b45309' : '#16a34a' }} />
          )}
        </span>
      </Td>
      {/* Désignation */}
      <Td style={{ minWidth: 160, fontWeight: 600 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {editMode ? (
            <div style={{ background: 'color-mix(in srgb, #fbbf24 12%, transparent)', borderRadius: 3 }}>
              {isAmountSection ? (
                <EditableText
                  value={r.designation || r.type || ''}
                  onCommit={(v) => onUpdate?.({ designation: v, type: v })}
                  placeholder={sectionOf(row) === 'transport' ? 'Frais de port…' : 'Avis / note…'}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 3 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <EditableSelect
                      value={r.type}
                      options={TYPE_OPTIONS}
                      onCommit={(v) => onRecompute?.({ type: v })}
                      placeholder="Type…"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSuggestDesignation?.() }}
                    title="Suggérer un libellé PDF depuis les devis historiques (Qdrant)"
                    disabled={suggestingDesignation}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text-2)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: suggestingDesignation ? 'default' : 'pointer',
                    }}
                  >
                    {suggestingDesignation ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 11, padding: '2px 4px' }}>{r.designation || r.type || '—'}</span>
          )}
          {r.ref_base && (
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-3)', letterSpacing: '0.02em', paddingLeft: 4 }}>
              réf. {r.ref_base}
            </span>
          )}
          {ruleSummary && (ruleSummary.violation > 0 || ruleSummary.warning > 0) && (
            <span style={{ fontSize: 9, fontWeight: 800, color: ruleSummary.violation ? '#dc2626' : '#b45309', paddingLeft: 4 }}>
              {ruleSummary.violation > 0 ? `${ruleSummary.violation} violation${ruleSummary.violation > 1 ? 's' : ''}` : `${ruleSummary.warning} attention${ruleSummary.warning > 1 ? 's' : ''}`}
            </span>
          )}
          {ruleSummary && ruleIssues.length === 0 && (
            <span style={{ fontSize: 9, fontWeight: 800, color: '#16a34a', paddingLeft: 4 }}>règles OK</span>
          )}
        </div>
      </Td>
      {/* Localisation */}
      <Td style={{ minWidth: 90, width: 110, padding: 0 }}>
        {editMode && !isAmountSection ? (
          <EditableText
            value={row.localisation || ''}
            onCommit={(value) => onUpdate?.({ localisation: value })}
            placeholder="localisation…"
          />
        ) : (
          <span style={{ display: 'inline-block', padding: '2px 6px', fontSize: 10, fontWeight: 700, color: row.localisation ? 'var(--color-text)' : 'var(--color-text-3)' }}>
            {row.localisation || '—'}
          </span>
        )}
      </Td>
      {/* Performances */}
      <Td style={{ minWidth: 430, width: 430, fontSize: 10, color: 'var(--color-text-2)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'stretch' }}>
          {editMode ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minHeight: 30 }}>
              {visiblePerfKeys.map(key => {
                const rawIdx = rawIndexByPerf[key]
                const cur = performanceValue(row, r, key)
                const isSet = cur != null
                const controlWidth = Math.max(PERF_CONTROL_WIDTH[key] || 58, 64)
                return (
                  <div key={key} onClick={e => e.stopPropagation()} style={{ position: 'relative', flex: `0 0 ${controlWidth}px`, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 8, lineHeight: 1, color: 'var(--color-text-3)', fontWeight: 900, textTransform: 'uppercase', textAlign: 'center' }}>{PERF_LABELS[key]}</span>
                    <select
                      value={cur ?? ''}
                      onChange={e => {
                        const v = e.target.value || null
                        if (key === 'acoustic') {
                          // Rebuild _raw[16] with or without the acoustic value so the
                          // server recomputes the price (acoustic treatment is priced server-side).
                          const raw16 = String(row._raw?.[16] ?? '')
                          const stripped = stripAcousticInfo(raw16)
                          const newRaw16 = v ? (stripped ? `${stripped} ${v}` : v) : (stripped || null)
                          onRecompute?.({ _raw_16: newRaw16 })
                        } else {
                          onRecompute?.({ [`_raw_${rawIdx}`]: v })
                        }
                      }}
                      title={key === 'acoustic' ? 'Acoustique' : key.toUpperCase()}
                      style={{
                        width: controlWidth,
                        height: 26,
                        fontSize: 10,
                        fontWeight: 900,
                        padding: '0 20px 0 7px',
                        cursor: 'pointer',
                        background: isSet ? '#fbbf24' : 'var(--color-surface)',
                        color: isSet ? '#111827' : 'var(--color-text-2)',
                        border: isSet ? '1px solid #d97706' : '1px solid var(--color-border)',
                        borderRadius: 6,
                        outline: 'none',
                      }}
                    >
                      {PERF_OPTIONS[key].map(o => (
                        <option key={String(o.value)} value={o.value ?? ''}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
              {!isAmountSection && hiddenPerfCount > 0 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setShowEmptyPerfs(true) }}
                  title={`Afficher ${hiddenPerfCount} performance${hiddenPerfCount > 1 ? 's' : ''} vide${hiddenPerfCount > 1 ? 's' : ''}`}
                  style={perfActionButtonStyle}
                >
                  <Plus size={13} strokeWidth={2.5} />
                </button>
              )}
              {canCollapseEmptyPerfs && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setShowEmptyPerfs(false) }}
                  title="Masquer les performances vides"
                  style={perfActionButtonStyle}
                >
                  <Minus size={13} strokeWidth={2.5} />
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 9, minHeight: 20 }}>
              {(['rc','pb','cf','blast','belier','prison','acoustic']).map(key => {
                const cur = performanceValue(row, r, key)
                if (!cur) return null
                return (
                  <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 5px', borderRadius: 4, background: '#fbbf24', color: '#111827', fontWeight: 900 }}>
                    <span style={{ fontSize: 8, opacity: 0.72 }}>{PERF_LABELS[key]}</span>{cur}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </Td>
      {/* H */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ textAlign: 'right', width: 55, padding: 0, ...dimensionHiddenStyle('haut_ht') }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableNumber value={r.haut_mm} onCommit={v => onRecompute?.({ haut_mm: v })} step={10} min={100} max={9999} width="100%" textAlign="right" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{r.haut_mm ?? '—'}</span>}
      </Td>
      {/* L */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ textAlign: 'right', width: 55, padding: 0, ...dimensionHiddenStyle('larg_ht') }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableNumber value={r.larg_mm} onCommit={v => onRecompute?.({ larg_mm: v })} step={10} min={100} max={9999} width="100%" textAlign="right" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{r.larg_mm ?? '—'}</span>}
      </Td>
      {/* H PL / CV */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ textAlign: 'right', width: 58, padding: 0, ...dimensionHiddenStyle('haut_pl') }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableNumber value={r.hauteur_pl_mm} onCommit={v => onRecompute?.(htPatchFromPassageDimension(r, 'hauteur_pl_mm', v))} step={10} min={1} max={9999} width="100%" textAlign="right" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{r.hauteur_pl_mm ?? '—'}</span>}
      </Td>
      {/* L PL / CV */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ textAlign: 'right', width: 58, padding: 0, ...dimensionHiddenStyle('larg_pl') }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableNumber value={r.largeur_pl_mm} onCommit={v => onRecompute?.(htPatchFromPassageDimension(r, 'largeur_pl_mm', v))} step={10} min={1} max={9999} width="100%" textAlign="right" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{r.largeur_pl_mm ?? '—'}</span>}
      </Td>
      {/* TL */}
      <Td style={{ width: 74, textAlign: 'center', padding: 0 }}>
        {isAmountSection ? <span style={{ fontSize: 9, color: 'var(--color-text-3)' }}>—</span> : editMode ? (
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', padding: '2px 3px' }}>
            <select
              value={r._thermolaquageType || ''}
              onChange={e => {
                const raw = Array.isArray(row._raw) ? [...row._raw] : new Array(17).fill(null)
                while (raw.length < 17) raw.push(null)
                raw[16] = setThermolaquageInRawValue(raw[16], e.target.value || null)
                onRecompute?.({ _raw_override: raw })
              }}
              title="Thermolaquage"
              style={{ width: 62, height: 24, fontSize: 10, fontWeight: 800, borderRadius: 5, border: '1px solid var(--color-border)', background: r.thermolaquage ? '#fbbf24' : 'var(--color-surface)', color: r.thermolaquage ? '#000' : 'var(--color-text-3)', outline: 'none' }}
            >
              <option value="">—</option>
              <option value="RAL">RAL</option>
              <option value="NCS">NCS</option>
            </select>
            {r._thermolaquageRef && <span style={{ fontSize: 8, color: 'var(--color-text-3)', fontWeight: 700 }}>réf.{r._thermolaquageRef}</span>}
          </div>
        ) : (
          <span title={r._thermolaquageLabel || ''} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1, fontSize: 9, fontWeight: 800, color: r.thermolaquage ? '#b45309' : 'var(--color-text-3)' }}>
            <span>{r._thermolaquageType || '—'}</span>
            {r._thermolaquageRef && <span style={{ fontSize: 8, color: 'var(--color-text-3)' }}>réf.{r._thermolaquageRef}</span>}
          </span>
        )}
      </Td>
      {/* Serrure */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 80 }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableText value={mainEquipLabel(row._raw?.[12] ?? r._serrureLabel ?? '')} onCommit={v => onRecompute?.({ [`_raw_12`]: v })} placeholder="serrure…" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{mainEquipLabel(row._raw?.[12] || r._serrureLabel) || '—'}</span>}
      </Td>
      {/* Garn int */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 70 }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableText value={mainEquipLabel(row._raw?.[13] ?? r._garnIntLabel ?? '')} onCommit={v => onRecompute?.({ [`_raw_13`]: v })} placeholder="garn. int…" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{mainEquipLabel(row._raw?.[13] || r._garnIntLabel) || '—'}</span>}
      </Td>
      {/* Garn ext */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 70 }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableText value={mainEquipLabel(row._raw?.[14] ?? r._garnExtLabel ?? '')} onCommit={v => onRecompute?.({ [`_raw_14`]: v })} placeholder="garn. ext…" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{mainEquipLabel(row._raw?.[14] || r._garnExtLabel) || '—'}</span>}
      </Td>
      {/* Vitrage */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 130, ...(hiddenCols.has('vitrage') ? { display: 'none' } : {}) }}>
        {editMode
          ? (isAmountSection ? <EditableText value={row.notes || row.alertes?.[0] || ''} onCommit={v => onUpdate?.({ notes: v, alertes: v ? [v] : [] })} placeholder="note…" /> : <EditableText value={stripAcousticInfo(row._raw?.[16]) || mainEquipLabel(r._vitrageLabel) || ''} onCommit={v => onRecompute?.({ [`_raw_16`]: v })} placeholder="" />)
          : (r._vitrageLabel ? (
            <Popover content={r._vitrageNote || r._vitrageLabel}>
              <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block', fontWeight: 600 }}>
                {mainEquipLabel(r._vitrageLabel)}{r._vitrageRef ? ` · réf.${r._vitrageRef}` : ''}{r._vitragePrix != null ? ` · ${Number(r._vitragePrix).toLocaleString('fr-FR')} €` : ''}
              </span>
            </Popover>
          ) : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{isAcousticValue(row._raw?.[16]) ? '' : (row._raw?.[16] || '')}</span>)}
      </Td>
      {/* FP */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 60, ...(hiddenCols.has('fp') ? { display: 'none' } : {}) }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableText value={mainEquipLabel(row._raw?.[15] ?? r._fpLabel ?? '')} onCommit={v => onRecompute?.({ [`_raw_15`]: v })} placeholder="FP…" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{mainEquipLabel(row._raw?.[15] || r._fpLabel) || '—'}</span>}
      </Td>
      {/* Crémone */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 110, ...(hiddenCols.has('cremone') ? { display: 'none' } : {}) }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableText value={row._overrideCremone !== undefined ? row._overrideCremone : mainEquipLabel(r._cremoneLabel ?? '')} onCommit={v => onUpdate?.({ _overrideCremone: v })} placeholder="crémone…" />)
          : (() => {
              const label = row._overrideCremone !== undefined ? row._overrideCremone : r._cremoneLabel
              return label ? (
                <Popover content={r._cremoneNote || label}>
                  <span style={{ display: 'inline-block', padding: '2px 4px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)' }}>
                    {mainEquipLabel(label)}{r._cremoneRef ? ` · réf.${r._cremoneRef}` : ''}{r._cremonePrix != null ? ` · ${Number(r._cremonePrix).toLocaleString('fr-FR')} €` : ''}
                  </span>
                </Popover>
              ) : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block', color: 'var(--color-text-2)' }}>—</span>
            })()}
      </Td>
      {/* Autres équipements */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 140, ...(hiddenCols.has('autres') ? { display: 'none' } : {}) }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableText value={row._overrideAutres !== undefined ? row._overrideAutres : (r._otherExtras?.map(e => mainEquipLabel(e.label)).join(', ') ?? '')} onCommit={v => onUpdate?.({ _overrideAutres: v })} placeholder="autres équip…" />)
          : (row._overrideAutres !== undefined
              ? (row._overrideAutres ? <span style={{ fontSize: 11, padding: '2px 4px', display: 'inline-block', fontWeight: 600, color: 'var(--color-text-2)' }}>{row._overrideAutres}</span> : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block', color: 'var(--color-text-2)' }}>—</span>)
              : (r._otherExtras?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {r._otherExtras.map((e, extraIndex) => (
                      <Popover key={`${e.ref || e.label || extraIndex}`} content={e.note || e.label}>
                        <span style={{ display: 'inline-block', padding: '1px 4px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)' }}>
                          {mainEquipLabel(e.label)}{e.ref ? ` · réf.${e.ref}` : ''}{e.prix != null ? ` · ${Number(e.prix).toLocaleString('fr-FR')} €` : ''}
                        </span>
                      </Popover>
                    ))}
                  </div>
                ) : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block', color: 'var(--color-text-2)' }}>—</span>))}
      </Td>
      {/* Acoustique */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 90, ...(hiddenCols.has('acoustic') ? { display: 'none' } : {}) }}>
        {isAmountSection
          ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span>
          : (r._acousticValue
              ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block', fontWeight: 600 }}>
                  {r._acousticValue}{r._acousticRef ? ` · réf.${r._acousticRef}` : ''}
                </span>
              : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block', color: 'var(--color-text-2)' }}>—</span>)}
      </Td>
      {/* PU HT */}
      <Td palette="gray" style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {editMode && isAmountSection
          ? <EditableNumber value={r.prix_base_ht ?? 0} onCommit={v => onUpdate?.({ prix_base_ht: v, prix_total_min_ht: v, total_ligne_ht: v })} step={10} min={0} max={999999} width="100%" textAlign="right" />
          : (r._pu > 0 ? r._pu.toLocaleString('fr-FR') + ' €' : '—')}
      </Td>
      {/* Remise */}
      <Td palette="yellow" style={{ textAlign: 'center', width: 90, padding: 0 }}>
        <EditableNumber
          value={Number.isFinite(row.multiple) ? row.multiple : multGlobal}
          onCommit={v => onUpdate?.({ multiple: v })}
          step={0.01}
          min={0}
          max={10}
          width="100%"
          textAlign="center"
        />
      </Td>
      {/* Q (toujours éditable) */}
      <Td palette="yellow" style={{ textAlign: 'center', width: 90, padding: 0 }}>
        <EditableNumber value={qty} onCommit={v => onUpdate?.({ qty: v })} step={1} min={1} max={9999} width="100%" />
      </Td>
      {/* Total HT */}
      <Td palette="blue" style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', fontSize: 12 }}>
        {r._pu > 0 ? r._totalHt.toLocaleString('fr-FR') + ' €' : '—'}
      </Td>
      <Td style={{ width: editMode ? 72 : 32, textAlign: 'center', padding: 0 }}>
        {editMode && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            {!isAmountSection && (
              <>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onVerifyRules?.() }}
                  title="Vérifier les règles IA sur cette ligne"
                  style={{ width: 22, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--color-primary)', cursor: 'pointer', borderRadius: 3 }}
                >
                  <ShieldCheck size={12} />
                </button>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onSaveAsRule?.() }}
                  title="Enregistrer comme règle R&D"
                  style={{ width: 22, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#0f766e', cursor: 'pointer', borderRadius: 3 }}
                >
                  <BookOpen size={12} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onDelete?.() }}
              title="Supprimer la ligne"
              style={{ width: 22, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#a33c3c', cursor: 'pointer', borderRadius: 3 }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </Td>
    </tr>
  )
}

function AmountSectionColumns({ section, hiddenDimensionCount = 0 }) {
  const isTransport = section === 'transport'
  const detailSpan = Math.max(1, 5 - hiddenDimensionCount)
  return (
    <tr>
      <td style={{ ...amountHeaderCellStyle, width: 36 }}>#</td>
      <td colSpan={6} style={amountHeaderCellStyle}>{isTransport ? 'Poste transport' : 'Libellé calcul'}</td>
      <td colSpan={detailSpan} style={amountHeaderCellStyle}>{isTransport ? 'Destination / note' : 'Détail / condition'}</td>
      <td colSpan={3} style={amountHeaderCellStyle}>{isTransport ? 'Règle' : 'Référence'}</td>
      <td colSpan={2} style={amountHeaderCellStyle}>{isTransport ? 'Tranches' : 'Source'}</td>
      <td style={{ ...amountHeaderCellStyle, ...CELL.gray, textAlign: 'right' }}>PU HT</td>
      <td style={{ ...amountHeaderCellStyle, ...CELL.yellow, textAlign: 'center' }}>Remise</td>
      <td style={{ ...amountHeaderCellStyle, ...CELL.yellow, textAlign: 'center' }}>Q.</td>
      <td style={{ ...amountHeaderCellStyle, ...CELL.blue, textAlign: 'right' }}>Total HT</td>
      <td style={{ ...amountHeaderCellStyle, width: 32 }}></td>
    </tr>
  )
}

function AmountRow({ row, index, displayIndex = index, change, tva, multGlobal, editMode, defaultTransportAddress = '', onUpdate, onTransportAddressCommit, onDelete, hiddenDimensionCount = 0 }) {
  const r = resolveRow(row, change, tva, multGlobal)
  const section = sectionOf(row)
  const isTransport = section === 'transport'
  const qty = Number.isFinite(r.qty) ? r.qty : 1
  const detail = isTransport ? transportAddressText(row, defaultTransportAddress) : (row.notes || row.alertes?.[0] || '')
  const rule = isTransport ? (row.transport_zone || row.ref_base || 'Tarif transport') : (row.ref_base || '—')
  const source = isTransport
    ? (row.tranche_count ? `${row.tranche_count} tranche${row.tranche_count > 1 ? 's' : ''}` : 'recalcul auto')
    : (row._generatedFrom || '—')
  const detailSpan = Math.max(1, 5 - hiddenDimensionCount)

  return (
    <tr style={{ background: 'color-mix(in srgb, var(--color-primary) 2%, transparent)' }}>
      <Td style={{ color: 'var(--color-text-3)', fontWeight: 700, width: 36 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <ChevronRight size={11} style={{ opacity: 0.25 }} />
          {rowLetterLabel(displayIndex)}
        </span>
      </Td>
      <Td colSpan={6} style={{ minWidth: 220, fontWeight: 700, padding: 0 }}>
        {editMode ? (
          <EditableText
            value={r.designation || r.type || ''}
            onCommit={(value) => onUpdate?.({ designation: value, type: value })}
            placeholder={isTransport ? 'Frais de port…' : 'Avis / note de calcul…'}
          />
        ) : (
          <span style={{ display: 'inline-block', padding: '2px 8px' }}>{r.designation || r.type || '—'}</span>
        )}
      </Td>
      <Td colSpan={detailSpan} style={{ minWidth: 260, padding: 0, color: 'var(--color-text-2)' }}>
        {editMode ? (
          <EditableText
            value={detail}
            onCommit={(value) => isTransport
              ? onTransportAddressCommit?.(value)
              : onUpdate?.({ notes: value, alertes: value ? [value] : [] })}
            placeholder={isTransport ? 'Adresse de livraison…' : 'Condition, remarque, note…'}
          />
        ) : (
          <span style={{ display: 'inline-block', padding: '2px 8px' }}>{detail || '—'}</span>
        )}
      </Td>
      <Td colSpan={3} style={{ minWidth: 130, padding: 0, color: 'var(--color-text-2)' }}>
        {editMode && !isTransport ? (
          <EditableText
            value={row.ref_base || ''}
            onCommit={(value) => onUpdate?.({ ref_base: value })}
            placeholder="réf.…"
          />
        ) : (
          <span style={{ display: 'inline-block', padding: '2px 8px', fontWeight: 600 }}>{rule}</span>
        )}
      </Td>
      <Td colSpan={2} style={{ minWidth: 120, color: 'var(--color-text-3)' }}>
        {source}
      </Td>
      <Td palette="gray" style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', padding: 0 }}>
        {editMode ? (
          <EditableNumber value={r.prix_base_ht ?? 0} onCommit={value => onUpdate?.({ prix_base_ht: value, prix_total_min_ht: value, total_ligne_ht: value })} step={10} min={0} max={999999} width="100%" textAlign="right" />
        ) : (
          <span style={{ display: 'inline-block', padding: '2px 8px' }}>{amountEuro(r._pu)}</span>
        )}
      </Td>
      <Td palette="yellow" style={{ textAlign: 'center', width: 60, padding: 0 }}>
        <EditableNumber value={Number.isFinite(row.multiple) ? row.multiple : multGlobal} onCommit={value => onUpdate?.({ multiple: value })} step={0.01} min={0} max={10} width="100%" textAlign="center" />
      </Td>
      <Td palette="yellow" style={{ textAlign: 'center', width: 36, padding: 0 }}>
        <EditableNumber value={qty} onCommit={value => onUpdate?.({ qty: value })} step={1} min={1} max={9999} width="100%" />
      </Td>
      <Td palette="blue" style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', fontSize: 12 }}>
        {amountEuro(r._totalHt)}
      </Td>
      <Td style={{ width: 32, textAlign: 'center', padding: 0 }}>
        {editMode && (
          <button
            type="button"
            onClick={event => { event.stopPropagation(); onDelete?.() }}
            title="Supprimer la ligne"
            style={{ width: '100%', height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#a33c3c', cursor: 'pointer' }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </Td>
    </tr>
  )
}

// ─── Sous-row références ─────────────────────────────────────────────────────
function SubRowRefs({ row, editMode, onRefCommit, hiddenCols = new Set(), visibleDimensionCount = 4 }) {
  const r = resolveRow(row)
  const cells = [
    r._serrureRef, r._garnIntRef, r._garnExtRef,
    r._vitrageRef,
    r._fpRef, r._cremoneRef, r._otherExtrasRefs?.join(', ') || null,
    r._acousticRef,
  ]
  const colKeys = [null, null, null, 'vitrage', 'fp', 'cremone', 'autres', 'acoustic']
  return (
    <tr style={{ background: SUBROW_BG }}>
      <td colSpan={4} style={{ padding: '3px 8px 3px 40px', fontSize: 10, fontWeight: 700, color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)' }}>
        Références
      </td>
      {visibleDimensionCount > 0 && <td colSpan={visibleDimensionCount} style={{ padding: '3px 8px', fontSize: 10, color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)' }}></td>}
      <td style={{ padding: '3px 8px', fontSize: 10, color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)', fontWeight: 700, textAlign: 'center' }}>
        {r._thermolaquageRef || '—'}
      </td>
      {cells.map((ref, i) => (
        <td key={i} style={{ padding: 0, fontSize: 11, fontWeight: 700, ...CELL.yellow, borderBottom: '1px solid var(--color-border)', ...(colKeys[i] && hiddenCols.has(colKeys[i]) ? { display: 'none' } : {}) }}>
          {editMode
            ? <EditableText
                value={ref || ''}
                onCommit={v => onRefCommit?.(i, v)}
                placeholder="réf…"
                fontSize={11}
              />
            : <span style={{ display: 'block', padding: '3px 8px' }}>{ref || '—'}</span>}
        </td>
      ))}
      <td colSpan={5} style={{ borderBottom: '1px solid var(--color-border)', ...CELL.gray }}></td>
    </tr>
  )
}

// ─── Sous-row prix ────────────────────────────────────────────────────────────
function SubRowPrices({ row, hiddenCols = new Set(), visibleDimensionCount = 4 }) {
  const r = resolveRow(row)
  const prices = [
    r._optSerrure?.prix, r._garnIntPrix, r._garnExtPrix,
    r._vitragePrix, r._optFP?.prix, r._cremonePrix, r._otherExtrasPrix || null,
    r._acousticPrix,
  ]
  const colKeys = [null, null, null, 'vitrage', 'fp', 'cremone', 'autres', 'acoustic']
  const visiblePrices = r._unpriced ? prices.map(() => undefined) : prices
  return (
    <tr style={{ background: SUBROW_BG }}>
      <td colSpan={4} style={{ padding: '3px 8px 3px 40px', fontSize: 10, fontWeight: 700, color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)' }}>
        Prix unitaires
      </td>
      {visibleDimensionCount > 0 && <td colSpan={visibleDimensionCount} style={{ padding: '3px 8px', borderBottom: '1px solid var(--color-border)', ...CELL.gray }}></td>}
      <td style={{ padding: '3px 8px', fontSize: 11, textAlign: 'right', borderBottom: '1px solid var(--color-border)', ...CELL.gray }}>
        {r._unpriced ? '—' : (r._thermolaquagePrix != null ? r._thermolaquagePrix.toLocaleString('fr-FR') + ' €' : <span style={{ color: 'var(--color-text-3)' }}>—</span>)}
      </td>
      {visiblePrices.map((p, i) => (
        <td key={i} style={{ padding: '3px 8px', fontSize: 11, ...CELL.gray, borderBottom: '1px solid var(--color-border)', textAlign: 'right', ...(colKeys[i] && hiddenCols.has(colKeys[i]) ? { display: 'none' } : {}) }}>
          {p === undefined ? '—' : (p != null ? p.toLocaleString('fr-FR') + ' €' : <span style={{ color: 'var(--color-text-3)' }}>de série</span>)}
        </td>
      ))}
      {/* PU base dans la colonne PU HT */}
      <td style={{ padding: '3px 8px', fontSize: 11, textAlign: 'right', ...CELL.gray, borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-3)' }}>
        base: {r._unpriced ? '—' : (r.prix_base_ht?.toLocaleString('fr-FR') ?? '—')} €
      </td>
      <td colSpan={4} style={{ borderBottom: '1px solid var(--color-border)', ...CELL.blue }}></td>
    </tr>
  )
}

// ─── Options statiques Performances ─────────────────────────────────────────
const PERF_OPTIONS = {
  rc:     [{ value: null, label: '—' }, { value: 'CR3', label: 'CR3' }, { value: 'CR4', label: 'CR4' }, { value: 'CR5', label: 'CR5' }, { value: 'CR6', label: 'CR6' }],
  pb:     [{ value: null, label: '—' }, { value: 'FB4', label: 'FB4' }, { value: 'FB5', label: 'FB5' }, { value: 'FB6', label: 'FB6' }, { value: 'FB7', label: 'FB7' }],
  cf:     [{ value: null, label: '—' }, { value: 'EI30', label: 'EI² 30' }, { value: 'EI60', label: 'EI² 60' }, { value: 'EI90', label: 'EI² 90' }, { value: 'EI120', label: 'EI² 120' }],
  blast:  [{ value: null, label: '—' }, { value: '2t/m²', label: 'Blast 2t' }, { value: '4t/m²', label: 'Blast 4t' }, { value: '5t/m²', label: 'Blast 5t' }],
  belier: [{ value: null, label: '—' }, { value: 'Bélier', label: 'Bélier' }],
  prison: [{ value: null, label: '—' }, { value: 'Prison', label: 'Prison' }],
  acoustic: [{ value: null, label: '—' }, { value: '30 dB', label: '30 dB' }, { value: '35 dB', label: '35 dB' }, { value: '40 dB', label: '40 dB' }, { value: '45 dB', label: '45 dB' }],
}
// Largeur dynamique : longueur du label le plus long × 9px + 32px (padding + flèche), min 52
Object.entries(PERF_OPTIONS).forEach(([k, opts]) => {
  PERF_CONTROL_WIDTH[k] = Math.max(52, Math.max(...opts.map(o => o.label.length)) * 9 + 32)
})

const TYPE_OPTIONS = ['BP 1V', 'BP 2V', 'Chassis', 'Guichet'].map(value => ({ value, label: value }))

function createBlankGridRow() {
  const raw = new Array(17).fill(null)
  raw[16] = 'RAL'
  return {
    type: '',
    line_section: 'products',
    designation: '',
    larg_mm: null,
    haut_mm: null,
    qty: 1,
    multiple: 1,
    change_override: null,
    prix_base_ht: null,
    prix_total_min_ht: null,
    options: [],
    equip_extra: [],
    alertes: [],
    docs: [],
    _manualBlank: true,
    _raw: raw,
  }
}

const SECTION_META = {
  products: { label: 'Produits', icon: Package, hint: 'Portes, châssis, guichets et équipements intégrés' },
  calculations: { label: 'Calculs', icon: Calculator, hint: 'Avis de chantier et notes de calcul explosion' },
  transport: { label: 'Transport', icon: Truck, hint: 'Frais de port et livraison' },
}

const SECTION_ORDER = ['products', 'calculations', 'transport']
const CALCULATION_OPTION_RE = /note de calcul|avis de chantier|avis chantier|calcul explosion/i
const FIRE_PERFORMANCE_RE = /\bEI\s*(30|60|90|120)\b/i
const HEIGHT_AVIS_CHANTIER_RE = /hauteur\s+\d+\s*mm\s+d[ée]passe\s+le\s+max\s+catalogue.*avis\s+de\s+chantier/i

function sectionOf(row) {
  return SECTION_META[row?.line_section] ? row.line_section : 'products'
}

function rowHasFirePerformance(row) {
  return FIRE_PERFORMANCE_RE.test([
    row?.cf,
    row?.coupe_feu,
    row?.feu,
    row?._raw?.[5],
    row?.designation,
    ...(row?.options || []).map(option => equipmentText(option)),
  ].filter(Boolean).join(' '))
}

function sanitizeCalculationAlerts(row) {
  if (!row || sectionOf(row) !== 'products' || rowHasFirePerformance(row)) return row
  const alertes = (row.alertes || []).filter(alert => !HEIGHT_AVIS_CHANTIER_RE.test(String(alert || '')))
  return alertes.length === (row.alertes || []).length ? row : { ...row, alertes }
}

function createAmountRow(section = 'calculations', label = '', defaults = {}) {
  const isTransport = section === 'transport'
  const address = isTransport ? (defaults.defaultTransportAddress || '') : ''
  return {
    type: isTransport ? 'Frais de port' : 'Avis / note de calcul',
    designation: label || (isTransport ? 'Frais de port' : 'Avis de chantier / note de calcul'),
    line_section: isTransport ? 'transport' : 'calculations',
    qty: 1,
    multiple: 1,
    change_override: null,
    prix_base_ht: 0,
    prix_total_min_ht: 0,
    options: [],
    equip_extra: [],
    alertes: address ? [address] : [],
    notes: address || '',
    delivery_address: address || '',
    docs: [],
    _manualBlank: true,
    _raw: new Array(17).fill(null),
  }
}

function splitCalculationOptions(rows) {
  const buckets = new Map()
  const registerCalcOption = (option) => {
    const label = String(option?.label || '').trim()
    const amount = Number(option?.prix) || 0
    const rawKey = label.toLowerCase()
    const key = /avis de chantier|avis chantier/i.test(label)
      ? 'avis_chantier'
      : (/note de calcul|calcul explosion/i.test(label) ? 'note_calcul_explosion' : rawKey || 'calcul')
    const title = key === 'avis_chantier'
      ? 'Avis de chantier'
      : (key === 'note_calcul_explosion' ? 'Note de calcul explosion (non remisable)' : (label || 'Calcul'))
    const prev = buckets.get(key) || { key, label: title, amount: 0, notes: new Set(), count: 0 }
    if (amount > prev.amount) prev.amount = amount
    if (option?.note) prev.notes.add(String(option.note))
    prev.count += 1
    buckets.set(key, prev)
    return amount
  }

  const nextRows = []
  for (const row of Array.isArray(rows) ? rows : []) {
    if (sectionOf(row) !== 'products') {
      nextRows.push(row)
      continue
    }
    const options = Array.isArray(row.options) ? row.options : []
    const calcOptions = options.filter(option => CALCULATION_OPTION_RE.test(option?.label || ''))
    if (!calcOptions.length) {
      nextRows.push({ ...row, line_section: 'products' })
      continue
    }
    const productOptions = options.filter(option => !CALCULATION_OPTION_RE.test(option?.label || ''))
    const calcTotal = calcOptions.reduce((sum, option) => sum + registerCalcOption(option), 0)
    const productTotal = row.prix_total_min_ht != null ? Math.max(0, Number(row.prix_total_min_ht) - calcTotal) : row.prix_total_min_ht
    nextRows.push({ ...row, line_section: 'products', options: productOptions, prix_total_min_ht: productTotal, total_ligne_ht: productTotal })
  }
  for (const bucket of buckets.values()) {
    if (!(Number(bucket.amount) > 0)) continue
    const notes = [...bucket.notes]
    nextRows.push({
      ...createAmountRow('calculations', bucket.label),
      designation: bucket.label,
      prix_base_ht: Number(bucket.amount) || 0,
      prix_total_min_ht: Number(bucket.amount) || 0,
      total_ligne_ht: Number(bucket.amount) || 0,
      options: [],
      alertes: notes,
      notes: notes.join(' — ') || '',
      _generatedFrom: notes.length > 1 ? `${notes.length} lignes produits` : '1 ligne produit',
    })
  }
  return nextRows
}

function normalizeCalculationRows(rows) {
  const nextRows = []
  const calcBuckets = new Map()

  const addBucket = (key, label, amount, note) => {
    const price = Number(amount) || 0
    if (!(price > 0)) return
    const bucket = calcBuckets.get(key) || { key, label, amount: 0, notes: new Set(), count: 0 }
    if (price > bucket.amount) bucket.amount = price
    if (note) {
      String(note)
        .split(/\s+—\s+(?=(?:Hauteur|Dimensions|Hors zone bleue Blast))/u)
        .map(part => part.replace(/^(?:\s|⚠️|⚠|✅|❌)+/u, '').trim())
        .filter(part => part && !/mutualis[ée]/i.test(part))
        .forEach(part => bucket.notes.add(part))
    }
    bucket.count += 1
    calcBuckets.set(key, bucket)
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    const section = sectionOf(row)
    const text = `${row.designation || ''} ${row.type || ''} ${(row.alertes || []).join(' ')}`
    if (section === 'products') {
      const cleanRow = sanitizeCalculationAlerts(row)
      nextRows.push(cleanRow)
      for (const alert of cleanRow.alertes || []) {
        if (/avis de chantier|avis chantier/i.test(alert)) addBucket('avis_chantier', 'Avis de chantier', 3700, alert)
        if (/note de calcul|calcul explosion|hors zone bleue/i.test(alert) && !/non requise|NON requise/i.test(alert)) {
          addBucket('note_calcul_explosion', 'Note de calcul explosion (non remisable)', 9300, alert)
        }
      }
      continue
    }
    if (section !== 'calculations') {
      nextRows.push(row)
      continue
    }
    const amount = Number(row.prix_base_ht ?? row.total_ligne_ht ?? row.prix_total_min_ht ?? 0)
    if (/avis de chantier|avis chantier/i.test(text)) {
      if (HEIGHT_AVIS_CHANTIER_RE.test(text) && !FIRE_PERFORMANCE_RE.test(text)) continue
      addBucket('avis_chantier', 'Avis de chantier', amount || 3700, row.notes || row.alertes?.join(' — '))
      continue
    }
    if (/note de calcul|calcul explosion/i.test(text)) {
      addBucket('note_calcul_explosion', 'Note de calcul explosion (non remisable)', amount || 9300, row.notes || row.alertes?.join(' — '))
      continue
    }
    if (amount > 0) nextRows.push(row)
  }

  for (const bucket of calcBuckets.values()) {
    const notes = [...bucket.notes].filter(Boolean)
    nextRows.push({
      ...createAmountRow('calculations', bucket.label),
      designation: bucket.label,
      prix_base_ht: bucket.amount,
      prix_total_min_ht: bucket.amount,
      total_ligne_ht: bucket.amount,
      options: [],
      alertes: notes,
      notes: notes.join(' — '),
      _generatedFrom: notes.length > 1 ? `${notes.length} lignes produits` : '1 ligne produit',
    })
  }
  return nextRows
}

function applyDefaultTransportAddress(rows, defaultTransportAddress = '') {
  const address = String(defaultTransportAddress || '').trim()
  if (!address) return rows
  return (Array.isArray(rows) ? rows : []).map(row => {
    if (sectionOf(row) !== 'transport' || transportAddressText(row)) return row
    return {
      ...row,
      delivery_address: address,
      transport_address: address,
      notes: address,
      alertes: [address],
    }
  })
}

// ─── Styles react-select compacts pour cellules de tableau ───────────────────
const selectCellStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 24,
    height: 24,
    background: 'transparent',
    border: state.isFocused ? '1px solid var(--color-primary)' : '1px solid transparent',
    borderRadius: 3,
    boxShadow: 'none',
    cursor: 'pointer',
    fontSize: 11,
  }),
  valueContainer: (base) => ({ ...base, padding: '0 4px', height: 24 }),
  input: (base) => ({ ...base, margin: 0, padding: 0, color: 'var(--color-text)' }),
  singleValue: (base) => ({ ...base, color: 'var(--color-text)', fontSize: 11 }),
  indicatorsContainer: (base) => ({ ...base, height: 24 }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base) => ({ ...base, padding: 2 }),
  clearIndicator: (base) => ({ ...base, padding: 2 }),
  menu: (base) => ({ ...base, fontSize: 11, zIndex: 9999, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  option: (base, state) => ({
    ...base,
    fontSize: 11,
    padding: '4px 8px',
    cursor: 'pointer',
    background: state.isFocused ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'transparent',
    color: 'var(--color-text)',
  }),
}

// ─── Cellule éditable Select2 (recherche + clear) ────────────────────────────
function EditableSelect({ value, options, onCommit, placeholder = '—', loadOnMount = false, loader }) {
  const [opts, setOpts] = useState(options || [])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let alive = true
    Promise.resolve().then(async () => {
      if (options) {
        if (alive) setOpts(options)
        return
      }
      if (!loadOnMount || !loader) return
      if (alive) setLoading(true)
      try {
        const loadedOptions = await loader()
        if (alive) setOpts(loadedOptions || [])
      } finally {
        if (alive) setLoading(false)
      }
    })
    return () => { alive = false }
  }, [options, loadOnMount, loader])
  const selected = value ? (opts.find(o => o.value === value) || { value, label: value }) : null
  return (
    <div onClick={e => e.stopPropagation()} style={{ width: '100%' }}>
      <Select
        value={selected}
        options={opts}
        onChange={(opt) => onCommit(opt ? opt.value : null)}
        isClearable
        isSearchable
        placeholder={placeholder}
        isLoading={loading}
        styles={selectCellStyles}
        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        menuPosition="fixed"
        noOptionsMessage={() => 'Aucun résultat'}
        loadingMessage={() => 'Chargement…'}
      />
    </div>
  )
}

// ─── Cellule éditable texte libre ────────────────────────────────────────────
function EditableText({ value, onCommit, placeholder = '—', width = '100%', fontSize = 11 }) {
  const [v, setV] = useState(value ?? '')
  const focused = useRef(false)
  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => { if (alive && !focused.current) setV(value ?? '') })
    return () => { alive = false }
  }, [value])
  const commit = () => {
    focused.current = false
    const trimmed = v.trim()
    if (trimmed !== (value ?? '').trim()) onCommit(trimmed || null)
  }
  return (
    <input
      type="text"
      value={v}
      onChange={e => setV(e.target.value)}
      onFocus={() => { focused.current = true }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      onClick={e => e.stopPropagation()}
      placeholder={placeholder}
      style={{
        width, fontSize,
        background: 'transparent', border: 'none', outline: 'none',
        color: 'inherit', font: 'inherit', padding: '2px 4px',
      }}
    />
  )
}

// ─── Cellule éditable (number) ───────────────────────────────────────────────
function EditableNumber({ value, onCommit, step = 1, min, max, width = 'auto', textAlign = 'center' }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => { if (alive) setV(value == null ? '' : String(value)) })
    return () => { alive = false }
  }, [value])
  const commit = () => {
    // Accepte virgule décimale FR et espaces ("1 500", "1,5")
    const cleaned = String(v).replace(/\s/g, '').replace(',', '.')
    const n = parseFloat(cleaned)
    if (Number.isFinite(n)) {
      let clamped = n
      if (min != null && clamped < min) clamped = min
      if (max != null && clamped > max) clamped = max
      onCommit(clamped)
    } else {
      setV(value == null ? '' : String(value))
    }
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      step={step}
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
      onClick={e => e.stopPropagation()}
      style={{
        width, textAlign,
        background: 'transparent', border: 'none', outline: 'none',
        color: 'inherit', font: 'inherit', padding: '2px 4px',
        borderRadius: 3,
      }}
    />
  )
}

// ─── Popover (tooltip stylé au survol) ───────────────────────────────────────
function Popover({ content, children, maxWidth = 320, delay = 80 }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0, side: 'top' })
  const ref = useRef(null)
  const timer = useRef(null)
  const show = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const spaceAbove = rect.top
      const side = spaceAbove > 80 ? 'top' : 'bottom'
      setPos({
        x: rect.left + rect.width / 2,
        y: side === 'top' ? rect.top - 6 : rect.bottom + 6,
        side,
      })
      setOpen(true)
    }, delay)
  }
  const hide = () => {
    clearTimeout(timer.current)
    setOpen(false)
  }
  if (!content) return <span ref={ref}>{children}</span>
  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ cursor: 'help' }}
        tabIndex={0}
      >
        {children}
      </span>
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: pos.side === 'top'
              ? 'translate(-50%, -100%)'
              : 'translate(-50%, 0)',
            maxWidth,
            padding: '8px 11px',
            background: 'var(--color-surface, #1e1e22)',
            color: 'var(--color-text, #e8e8ea)',
            border: '1px solid var(--color-primary, #c89b3c)',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
            fontSize: 11,
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            zIndex: 9999,
            pointerEvents: 'none',
            animation: 'devisPopoverFadeIn 120ms ease-out',
          }}
        >
          {content}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '50%',
              [pos.side === 'top' ? 'bottom' : 'top']: -5,
              transform: 'translateX(-50%) rotate(45deg)',
              width: 9,
              height: 9,
              background: 'var(--color-surface, #1e1e22)',
              borderRight: pos.side === 'top' ? '1px solid var(--color-primary, #c89b3c)' : 'none',
              borderBottom: pos.side === 'top' ? '1px solid var(--color-primary, #c89b3c)' : 'none',
              borderLeft: pos.side === 'bottom' ? '1px solid var(--color-primary, #c89b3c)' : 'none',
              borderTop: pos.side === 'bottom' ? '1px solid var(--color-primary, #c89b3c)' : 'none',
            }}
          />
        </div>
      )}
    </>
  )
}

// Inject CSS keyframes once
if (typeof document !== 'undefined' && !document.getElementById('devis-popover-style')) {
  const s = document.createElement('style')
  s.id = 'devis-popover-style'
  s.textContent = '@keyframes devisPopoverFadeIn { from { opacity:0; transform: translate(-50%, -100%) translateY(4px); } to { opacity:1; } } @keyframes spin { to { transform: rotate(360deg); } } @keyframes devisToastIn { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }'
  document.head.appendChild(s)
}

// ─── Légende couleurs ─────────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '4px 8px', fontSize: 10, color: 'var(--color-text-3)' }}>
      <span style={{ padding: '2px 6px', borderRadius: 3, ...CELL.yellow }}>🟡 Saisie</span>
      <span style={{ padding: '2px 6px', borderRadius: 3, ...CELL.gray }}>⬜ Calculé</span>
      <span style={{ padding: '2px 6px', borderRadius: 3, ...CELL.blue }}>🔵 Formule</span>
    </div>
  )
}

// ─── Stepper "Ajouter une ligne" ──────────────────────────────────────────────
const STEPS = ['Saisie libre', 'Vérification', 'Confirmation']

const MODAL_OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 10000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const MODAL_BOX = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 10, width: 520, maxWidth: '95vw', maxHeight: '90vh',
  display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  overflow: 'hidden',
}

function AddLineModal({ onClose, onAdd }) {
  const [step, setStep] = useState(0) // 0=saisie, 1=vérif, 2=confirm
  const [text, setText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState(null)
  const [parsed, setParsed] = useState(null)  // { parsed, row }
  const [computing, setComputing] = useState(false)
  const [result, setResult] = useState(null)  // résultat recompute-row
  const [computeError, setComputeError] = useState(null)

  const handleParse = async () => {
    if (!text.trim()) return
    setParsing(true); setParseError(null)
    try {
      const data = await api.post('/devis/parse-line', { text: text.trim() }, { timeout: 40000 })
      setParsed(data)
      setStep(1)
    } catch (e) {
      setParseError(e?.error || e?.details || e?.message || 'Erreur parsing Gemma')
    } finally {
      setParsing(false)
    }
  }

  const handleRecompute = async () => {
    if (!parsed?.row) return
    setComputing(true); setComputeError(null)
    try {
      const data = await api.post('/devis/recompute-row', { row: parsed.row }, { timeout: 30000 })
      setResult(data?.result)
      setStep(2)
    } catch (e) {
      setComputeError(e?.error || e?.details || e?.message || 'Erreur calcul')
    } finally {
      setComputing(false)
    }
  }

  const handleAdd = () => {
    if (result) onAdd(result)
    else if (parsed?.row) onAdd({ _raw: parsed.row, type: parsed.parsed?.type })
    onClose()
  }

  const pf = parsed?.parsed || {}

  return (
    <div style={MODAL_OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={MODAL_BOX}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <Plus size={14} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>Ajouter une ligne</span>
          {/* Stepper */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {STEPS.map((s, i) => (
              <Fragment key={s}>
                {i > 0 && <span style={{ fontSize: 10, color: 'var(--color-text-3)' }}>›</span>}
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 10,
                  fontWeight: i === step ? 700 : 400,
                  background: i === step ? 'var(--color-primary)' : i < step ? 'color-mix(in srgb, var(--color-primary) 25%, transparent)' : 'var(--color-bg)',
                  color: i === step ? '#fff' : 'var(--color-text-2)',
                }}>{s}</span>
              </Fragment>
            ))}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', padding: 4, display: 'flex' }}>
            <X size={14} />
          </button>
        </div>

        {/* Contenu */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          {/* STEP 0 — Saisie libre */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-2)' }}>
                Décrivez la ligne en texte libre. Gemma 4 va la parser automatiquement.
              </p>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--color-text-3)', fontStyle: 'italic' }}>
                Ex : "BP 1V CR4+FB4 1300×2100 LSS motorisée RAL 7016" ou "Chassis CR5 EI60 980x2200"
              </p>
              <textarea
                autoFocus
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleParse() }}
                placeholder="BP 1V CR4 1300x2100…"
                style={{
                  width: '100%', minHeight: 80, resize: 'vertical',
                  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                  borderRadius: 6, padding: 10, fontSize: 13, color: 'var(--color-text)',
                  fontFamily: 'var(--font-mono, monospace)', boxSizing: 'border-box',
                }}
              />
              {parseError && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', background: '#7f1d1d', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#fca5a5' }}>
                  <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                  {parseError}
                </div>
              )}
            </div>
          )}

          {/* STEP 1 — Vérification (résultat Gemma) */}
          {step === 1 && parsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-2)' }}>
                Voici ce que Gemma a compris. Vérifiez et cliquez sur "Calculer le prix".
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  ['Type', pf.type], ['Largeur (mm)', pf.larg_mm], ['Hauteur (mm)', pf.haut_mm],
                  ['RC', pf.rc], ['PB', pf.pb], ['CF', pf.cf],
                  ['Blast', pf.blast], ['Bélier', pf.belier], ['Prison', pf.prison],
                  ['Serrure', pf.serrure], ['Garn. int.', pf.garn_int], ['Garn. ext.', pf.garn_ext],
                  ['FP', pf.fp], ['Autres', pf.autres],
                ].map(([label, val]) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 8,
                    borderBottom: '1px solid var(--color-border)', paddingBottom: 3, fontSize: 11,
                  }}>
                    <span style={{ color: 'var(--color-text-3)', fontWeight: 600 }}>{label}</span>
                    <span style={{ color: val ? 'var(--color-text)' : 'var(--color-text-3)', fontStyle: val ? 'normal' : 'italic' }}>
                      {val != null ? String(val) : '—'}
                    </span>
                  </div>
                ))}
              </div>
              {computeError && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', background: '#7f1d1d', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#fca5a5' }}>
                  <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                  {computeError}
                </div>
              )}
              <button
                onClick={() => { setStep(0); setParsed(null); setParseError(null) }}
                style={{ alignSelf: 'flex-start', fontSize: 11, background: 'none', border: 'none', color: 'var(--color-text-3)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                ← Modifier la saisie
              </button>
            </div>
          )}

          {/* STEP 2 — Confirmation prix */}
          {step === 2 && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#86efac' }}>
                <Check size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Ligne calculée avec succès.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  ['Type', result.type], ['Gamme', result.gamme],
                  ['Dim.', result.larg_mm && result.haut_mm ? `${result.larg_mm} × ${result.haut_mm} mm` : null],
                  ['Réf. base', result.ref_base],
                  ['Prix base HT', result.prix_base_ht != null ? result.prix_base_ht.toLocaleString('fr-FR') + ' €' : null],
                  ['Prix options HT', result.prix_options_ht != null ? result.prix_options_ht.toLocaleString('fr-FR') + ' €' : null],
                  ['Prix total min HT', result.prix_total_min_ht != null ? result.prix_total_min_ht.toLocaleString('fr-FR') + ' €' : null],
                ].map(([label, val]) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 8,
                    borderBottom: '1px solid var(--color-border)', paddingBottom: 3, fontSize: 11,
                  }}>
                    <span style={{ color: 'var(--color-text-3)', fontWeight: 600 }}>{label}</span>
                    <span style={{ color: val ? '#86efac' : 'var(--color-text-3)', fontWeight: val ? 700 : 400 }}>
                      {val ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
              {result.alertes?.length > 0 && (
                <div style={{ background: 'color-mix(in srgb, #fbbf24 10%, transparent)', border: '1px solid #fbbf24', borderRadius: 6, padding: '8px 10px', fontSize: 10, color: '#fbbf24' }}>
                  {result.alertes.map((a, i) => <div key={i}>⚠ {a}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer boutons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '10px 16px', borderTop: '1px solid var(--color-border)' }}>
          {step === 0 && (
            <>
              <button onClick={onClose} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-text-2)', cursor: 'pointer' }}>
                Annuler
              </button>
              <button
                onClick={handleParse}
                disabled={!text.trim() || parsing}
                style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: text.trim() && !parsing ? 'pointer' : 'not-allowed', opacity: text.trim() && !parsing ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {parsing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <MessageSquare size={12} />}
                {parsing ? 'Gemma analyse…' : 'Analyser avec Gemma'}
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <button onClick={onClose} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-text-2)', cursor: 'pointer' }}>
                Annuler
              </button>
              <button
                onClick={handleRecompute}
                disabled={computing}
                style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: computing ? 'not-allowed' : 'pointer', opacity: computing ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {computing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                {computing ? 'Calcul…' : 'Calculer le prix'}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-text-2)', cursor: 'pointer' }}>
                ← Retour
              </button>
              <button
                onClick={handleAdd}
                style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Plus size={12} />
                Ajouter au tableau
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Switch Lecture / Édition ────────────────────────────────────────────────
function ModeSwitch({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      title={value ? 'Mode édition (cliquer pour passer en lecture)' : 'Mode lecture (cliquer pour passer en édition)'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        padding: '3px 8px', borderRadius: 12, border: '1px solid var(--color-border)',
        background: value ? 'color-mix(in srgb, var(--color-primary) 18%, transparent)' : 'var(--color-surface)',
        userSelect: 'none', fontSize: 10, fontWeight: 700,
      }}
    >
      <span style={{ color: value ? 'var(--color-text-3)' : 'var(--color-text)' }}>👁</span>
      <span style={{
        position: 'relative', width: 28, height: 14, borderRadius: 8,
        background: value ? 'var(--color-primary)' : 'var(--color-border)',
        transition: 'background 0.15s',
      }}>
        <span style={{
          position: 'absolute', top: 1, left: value ? 15 : 1,
          width: 12, height: 12, borderRadius: '50%', background: '#fff',
          transition: 'left 0.15s',
        }} />
      </span>
      <span style={{ color: value ? 'var(--color-text)' : 'var(--color-text-3)' }}>✏️</span>
    </div>
  )
}

// ─── Modal Paramètres du devis ───────────────────────────────────────────────
function SettingsModal({ change, multGlobal, tva, onClose, onApply }) {
  const [c, setC] = useState(String(change))
  const [m, setM] = useState(String(multGlobal))
  const [t, setT] = useState(tva)
  const apply = () => {
    const cn = parseFloat(String(c).replace(',', '.'))
    const mn = parseFloat(String(m).replace(',', '.'))
    onApply({
      change: Number.isFinite(cn) && cn > 0 ? cn : 1,
      multGlobal: Number.isFinite(mn) && mn > 0 ? mn : 1,
      tva: Number.isFinite(t) ? t : 0.2,
    })
    onClose()
  }
  return (
    <div style={MODAL_OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...MODAL_BOX, width: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <Settings size={14} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>Paramètres du devis</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', padding: 4, display: 'flex' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-2)' }}>Taux de change CHF → EUR</span>
            <input
              type="text" inputMode="decimal" value={c} onChange={e => setC(e.target.value)}
              placeholder="1.00"
              style={{ fontSize: 13, padding: '6px 10px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)' }}
            />
            <span style={{ fontSize: 10, color: 'var(--color-text-3)' }}>Multiplie tous les prix. 1.00 = pas de conversion.</span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-2)' }}>Remise globale (coefficient)</span>
            <input
              type="text" inputMode="decimal" value={m} onChange={e => setM(e.target.value)}
              placeholder="1.00"
              style={{ fontSize: 13, padding: '6px 10px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)' }}
            />
            <span style={{ fontSize: 10, color: 'var(--color-text-3)' }}>Ex : 1.15 = +15% de marge. 0.90 = remise 10%. Chaque ligne peut être ajustée dans la colonne Remise.</span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-2)' }}>TVA</span>
            <select value={t} onChange={e => setT(parseFloat(e.target.value))}
              style={{ fontSize: 13, padding: '6px 10px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)' }}>
              <option value={0.20}>20% (France)</option>
              <option value={0.081}>8.1% (Suisse)</option>
              <option value={0}>0% (HT uniquement)</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '10px 16px', borderTop: '1px solid var(--color-border)' }}>
          <button onClick={onClose} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-text-2)', cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={apply} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
            Appliquer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Composant principal réutilisable ─────────────────────────────────────────
export function DevisGridWorkspace({
  embedded = false,
  initialRows = null,
  defaultTransportAddress = '',
  startWithBlank = false,
  onRowsChange = null,
  onRowsCommit = null,
  onRowsBulkCommit = null,
  onRowsDelete = null,
  title = 'Devis Grid',
  subtitle = null,
}) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(() => {
    if (Array.isArray(initialRows)) return initialRows.length > 0 ? applyDefaultTransportAddress(normalizeCalculationRows(splitCalculationOptions(initialRows)), defaultTransportAddress) : (startWithBlank ? [createBlankGridRow()] : [])
    try {
      const saved = localStorage.getItem('devisGridRows')
      if (saved) return normalizeCalculationRows(JSON.parse(saved) || [])
    } catch { /* noop */ }
    return []
  })
  const [fileName, setFileName] = useState(() => {
    if (embedded) return null
    try { return localStorage.getItem('devisGridFileName') || null } catch { return null }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [validatingImport, setValidatingImport] = useState(false)
  const [importValidationSummary, setImportValidationSummary] = useState(null)
  const [suggestingRowId, setSuggestingRowId] = useState(null)
  const [toast, setToast] = useState(null) // { msg, kind: 'success'|'error', id }
  const toastTimerRef = useRef(null)
  const showToast = useCallback((msg, kind = 'success') => {
    clearTimeout(toastTimerRef.current)
    const id = Date.now()
    setToast({ msg, kind, id })
    toastTimerRef.current = setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 1800)
  }, [])
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [change, setChange] = useState(() => {
    try { const v = parseFloat(localStorage.getItem('devisGridChange')); return Number.isFinite(v) && v > 0 ? v : 1.0 } catch { return 1.0 }
  })
  const [tva, setTva] = useState(() => {
    try { const v = parseFloat(localStorage.getItem('devisGridTva')); return Number.isFinite(v) ? v : 0.20 } catch { return 0.20 }
  })
  const [multGlobal, setMultGlobal] = useState(() => {
    try { const v = parseFloat(localStorage.getItem('devisGridMultGlobal')); return Number.isFinite(v) && v > 0 ? v : 1.0 } catch { return 1.0 }
  })
  const [editMode, setEditMode] = useState(() => {
    try { return localStorage.getItem('devisGridEditMode') !== '0' } catch { return true }
  })
  const [showSettings, setShowSettings] = useState(false)
  useEffect(() => { try { localStorage.setItem('devisGridChange', String(change)) } catch { /* noop */ } }, [change])
  useEffect(() => { try { localStorage.setItem('devisGridTva', String(tva)) } catch { /* noop */ } }, [tva])
  useEffect(() => { try { localStorage.setItem('devisGridMultGlobal', String(multGlobal)) } catch { /* noop */ } }, [multGlobal])
  useEffect(() => { try { localStorage.setItem('devisGridEditMode', editMode ? '1' : '0') } catch { /* noop */ } }, [editMode])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('devisGridSidebarCollapsed') === '1' } catch { return false }
  })
  const [showAddModal, setShowAddModal] = useState(false)
  const [hiddenDimensionCols, setHiddenDimensionCols] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('devisGridHiddenDimensionCols') || '[]')
      return new Set(Array.isArray(saved) ? saved.filter(key => DIMENSION_COLUMNS.includes(key)) : [])
    } catch { return new Set() }
  })
  useEffect(() => {
    if (Array.isArray(initialRows)) setRows(initialRows.length > 0 ? applyDefaultTransportAddress(normalizeCalculationRows(splitCalculationOptions(initialRows)), defaultTransportAddress) : (startWithBlank ? [createBlankGridRow()] : []))
  }, [defaultTransportAddress, initialRows, startWithBlank])
  // Ref vers les rows courants — permet à recomputeRow de lire sans passer par un updater
  const rowsRef = useRef(rows)
  useEffect(() => { rowsRef.current = rows }, [rows])
  useEffect(() => {
    try { localStorage.setItem('devisGridSidebarCollapsed', sidebarCollapsed ? '1' : '0') } catch { /* noop */ }
  }, [sidebarCollapsed])
  useEffect(() => {
    try { localStorage.setItem('devisGridHiddenDimensionCols', JSON.stringify([...hiddenDimensionCols])) } catch { /* noop */ }
  }, [hiddenDimensionCols])

  const toggleDimensionColumn = useCallback((key) => {
    setHiddenDimensionCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Persistance auto des lignes (localStorage) — debounce léger
  useEffect(() => {
    if (embedded) {
      onRowsChange?.(rows)
      return undefined
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem('devisGridRows', JSON.stringify(rows))
        if (fileName) localStorage.setItem('devisGridFileName', fileName)
      } catch { /* quota dépassé : ignorer */ }
    }, 300)
    return () => clearTimeout(t)
  }, [embedded, fileName, onRowsChange, rows])
  const fileInputRef = useRef()

  const toggleRow = useCallback((i) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }, [])

  const updateRow = useCallback((i, patch) => {
    const nextRows = rowsRef.current.map((r, idx) => idx === i ? { ...r, ...patch } : r)
    setRows(nextRows)
    onRowsCommit?.(nextRows[i], i, patch)
    showToast('Enregistré', 'success')
  }, [onRowsCommit, showToast])

  const addRow = useCallback((newRow) => {
    const nextRows = [...rowsRef.current, newRow]
    setRows(nextRows)
    onRowsCommit?.(newRow, nextRows.length - 1, { _created: true })
    showToast('Ligne ajoutée', 'success')
  }, [onRowsCommit, showToast])

  const addBlankRow = useCallback(() => {
    const nextRows = [...rowsRef.current, createBlankGridRow()]
    setRows(nextRows)
    setEditMode(true)
    setExpandedRows(prev => new Set([...prev, nextRows.length - 1]))
    showToast('Ligne blanche ajoutée', 'success')
  }, [showToast])

  const addSectionRow = useCallback((section) => {
    const nextRows = [...rowsRef.current, createAmountRow(section, '', { defaultTransportAddress })]
    setRows(nextRows)
    setEditMode(true)
    setExpandedRows(prev => new Set([...prev, nextRows.length - 1]))
    onRowsCommit?.(nextRows[nextRows.length - 1], nextRows.length - 1, { _created: true })
    showToast(section === 'transport' ? 'Ligne transport ajoutée' : 'Ligne calcul ajoutée', 'success')
  }, [defaultTransportAddress, onRowsCommit, showToast])

  const commitTransportAddress = useCallback(async (i, address) => {
    const current = rowsRef.current[i]
    if (!current) return
    const cleanAddress = String(address || '').trim()
    const basePatch = {
      delivery_address: cleanAddress,
      transport_address: cleanAddress,
      notes: cleanAddress,
      alertes: cleanAddress ? [cleanAddress] : [],
    }
    const parsed = parseTransportAddress(cleanAddress)
    const leafCount = productLeafCount(rowsRef.current)
    let patch = basePatch
    if (!cleanAddress || (!parsed.canton && !parsed.country && !parsed.postal_code)) {
      const nextRows = rowsRef.current.map((row, idx) => idx === i ? { ...row, ...patch } : row)
      setRows(nextRows)
      onRowsCommit?.(nextRows[i], i, patch)
      showToast(cleanAddress ? 'Adresse enregistrée, zone à vérifier' : 'Adresse transport vidée', cleanAddress ? 'error' : 'success')
      return
    }
    try {
      const match = await api.post('/transport-tariffs/match', {
        ...parsed,
        leaf_count: leafCount,
      })
      if (match?.tariff) {
        const unitPrice = Number(match.tariff.unit_price_ht ?? match.tariff.price_ht ?? 0)
        const totalPrice = Number(match.tariff.total_price_ht ?? unitPrice)
        patch = {
          ...basePatch,
          prix_base_ht: totalPrice,
          prix_total_min_ht: totalPrice,
          total_ligne_ht: totalPrice,
          ref_base: match.tariff.zone || match.tariff.label || null,
          transport_zone: match.tariff.zone || match.tariff.label || null,
          tranche_count: match.tariff.tranche_count || match.tranche_count || null,
          leaf_count: leafCount,
        }
        showToast('Transport recalculé', 'success')
      } else {
        showToast('Adresse enregistrée, aucun tarif trouvé', 'error')
      }
    } catch {
      showToast('Adresse enregistrée, recalcul transport impossible', 'error')
    }
    const nextRows = rowsRef.current.map((row, idx) => idx === i ? { ...row, ...patch } : row)
    setRows(nextRows)
    onRowsCommit?.(nextRows[i], i, patch)
  }, [onRowsCommit, showToast])

  const deleteRow = useCallback((i) => {
    const row = rowsRef.current[i]
    if (!row) return
    const label = row.type || row.designation || `ligne ${i + 1}`
    if (!window.confirm(`Supprimer définitivement la ligne ${i + 1} — ${label} ?`)) return
    const nextRows = rowsRef.current.filter((_, idx) => idx !== i)
    setRows(nextRows)
    setExpandedRows(prev => new Set([...prev].filter(idx => idx !== i).map(idx => idx > i ? idx - 1 : idx)))
    onRowsDelete?.(row, i)
    showToast('Ligne supprimée', 'success')
  }, [onRowsDelete, showToast])

  const recomputeRow = useCallback((i, patch) => {
    // Lire les rows via ref (pas d'updater) pour éviter le double-appel Strict Mode
    const cur = rowsRef.current[i]
    if (!cur) return
    if (sectionOf(cur) !== 'products') {
      updateRow(i, patch)
      return
    }
    const raw = patch._raw_override
      ? [...patch._raw_override]
      : Array.isArray(cur._raw) ? [...cur._raw] : new Array(17).fill(null)
    while (raw.length < 17) raw.push(null)
    if (patch.type != null) raw[0] = patch.type
    if (patch.larg_mm != null) raw[1] = patch.larg_mm
    if (patch.haut_mm != null) raw[2] = patch.haut_mm
    for (let idx = 3; idx <= 16; idx++) {
      const k = `_raw_${idx}`
      if (Object.prototype.hasOwnProperty.call(patch, k)) raw[idx] = patch[k]
    }
    const { qty, multiple, change_override, _lineId, _dbPosition, _manualBlank } = cur
    // Maj optimiste immédiate
    setRows(prev => prev.map((r, idx) => idx === i ? {
      ...r,
      ...(patch.type != null ? { type: patch.type } : {}),
      ...(patch.haut_mm != null ? { haut_mm: patch.haut_mm } : {}),
      ...(patch.larg_mm != null ? { larg_mm: patch.larg_mm } : {}),
      _raw: raw,
      _recomputing: true,
    } : r))
    // Appel API — hors de tout updater → jamais dupliqué par Strict Mode
    const qtyInt = Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1
    api.post('/devis/recompute-row', { row: raw, qty: qtyInt }, { timeout: 30000 })
      .then(res => {
        const result = res?.result
        if (!result) return
        setRows(p2 => p2.map((r, idx) => idx === i ? {
          ...result,
          _lineId,
          _dbPosition,
          _manualBlank,
          qty, multiple, change_override,
          _recomputing: false,
        } : r))
        onRowsCommit?.({ ...result, _lineId, _dbPosition, _manualBlank, qty, multiple, change_override }, i, { _recomputed: true })
        showToast('Recalculé et enregistré', 'success')
      })
      .catch(err => {
        console.error('recompute-row error', err)
        setRows(p2 => p2.map((r, idx) => idx === i ? { ...r, _recomputing: false, _recomputeError: String(err?.error || err?.message || err) } : r))
        showToast('Erreur recalcul', 'error')
      })
  }, [onRowsCommit, showToast, updateRow])

  // 0=serrure, 1=garnInt, 2=garnExt, 3=vitrage, 4=fp, 5=crémone, 6=autres
  const handleRefCommit = useCallback(async (rowIdx, colIdx, refVal) => {
    if (!refVal) return
    const REF_COL_RAW = ['_raw_12', '_raw_13', '_raw_14', '_raw_16', '_raw_15']
    let label = refVal
    let prix = null
    try {
      const res = await api.post('/devis/lookup-ref', { ref: refVal })
      if (res?.found) { label = res.label; prix = res.prix }
    } catch { /* non bloquant */ }
    if (colIdx < 5) {
      const rawVal = `${label} — réf.${refVal}`
      recomputeRow(rowIdx, { [REF_COL_RAW[colIdx]]: rawVal })
    } else if (colIdx === 5) {
      const patch = { _overrideCremone: label }
      if (prix != null) patch._overrideCremonePrix = prix
      updateRow(rowIdx, patch)
      showToast('Crémone mise à jour', 'success')
    } else {
      const patch = { _overrideAutres: label }
      if (prix != null) patch._overrideAutresPrix = prix
      updateRow(rowIdx, patch)
      showToast('Autres équipements mis à jour', 'success')
    }
  }, [recomputeRow, updateRow, showToast])

  const handleFile = async (file) => {
    if (!file) return
    setLoading(true)
    setError(null)
    setImportValidationSummary(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/devis/analyze', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      })
      // api interceptor retourne déjà res.data → res = { results: [...] }
      const data = res?.results ?? (Array.isArray(res) ? res : [])
      const sectionedRows = applyDefaultTransportAddress(normalizeCalculationRows(splitCalculationOptions(Array.isArray(data) ? data : [])), defaultTransportAddress)
      setRows(sectionedRows)
      onRowsChange?.(sectionedRows)
      await onRowsBulkCommit?.(sectionedRows)
      setFileName(file.name)
      setExpandedRows(new Set())
      const productEntries = sectionedRows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => sectionOf(row) === 'products')
      if (productEntries.length) {
        setValidatingImport(true)
        setRows(prev => prev.map((row, index) => productEntries.some(entry => entry.index === index) ? { ...row, _ruleChecking: true, _ruleCheck: null } : row))
        try {
          const report = await api.post('/devis/validate-lines', {
            lines: productEntries.map(({ row, index }) => lineLikeForRuleValidation(row, index)),
          }, { timeout: 180000 })
          const byPosition = new Map((report.lines || []).map(line => [Number(line.position), line]))
          const checkedRows = sectionedRows.map((row, index) => {
            const result = byPosition.get(index)
            if (!result || sectionOf(row) !== 'products') return row
            const verdicts = result.verdicts || []
            return {
              ...row,
              _ruleChecking: false,
              _ruleCheck: {
                checked_at: report.generated_at,
                rules_count: report.rules_count || 0,
                summary: summarizeLineVerdicts(verdicts),
                verdicts,
              },
            }
          })
          setRows(checkedRows)
          onRowsChange?.(checkedRows)
          const issueRows = checkedRows.filter(row => blockingVerdicts(row).length > 0)
          setImportValidationSummary({ ...(report.summary || {}), issueRows: issueRows.length, rules_count: report.rules_count || 0 })
          if (issueRows.length) {
            setExpandedRows(new Set(checkedRows.map((row, index) => blockingVerdicts(row).length > 0 ? index : null).filter(index => index != null)))
            showToast(`${issueRows.length} ligne(s) à vérifier après contrôle règles`, 'error')
          } else {
            showToast('Import contrôlé : règles et expériences OK', 'success')
          }
        } catch (validationError) {
          setRows(prev => prev.map(row => ({ ...row, _ruleChecking: false })))
          showToast(validationError?.error || validationError?.message || 'Contrôle règles impossible', 'error')
        } finally {
          setValidatingImport(false)
        }
      }
    } catch (e) {
      setError(e?.error || e?.details || e?.message || 'Erreur import')
    } finally {
      setLoading(false)
    }
  }

  const clearImportedGrid = useCallback(async () => {
    const currentCount = rowsRef.current.length
    if (!currentCount && !fileName) return
    if (!window.confirm(`Vider définitivement le tableau (${currentCount} ligne${currentCount > 1 ? 's' : ''}) ?`)) return
    const nextRows = []
    setLoading(true)
    setError(null)
    try {
      await onRowsBulkCommit?.(nextRows)
      setRows(nextRows)
      setFileName(null)
      setImportValidationSummary(null)
      setExpandedRows(new Set())
      try {
        localStorage.removeItem('devisGridRows')
        localStorage.removeItem('devisGridFileName')
      } catch { /* noop */ }
      onRowsChange?.(nextRows)
      showToast('Tableau vidé — vous pouvez réimporter un xlsx', 'success')
    } catch (e) {
      const msg = e?.error || e?.details || e?.message || 'Vidage du tableau impossible'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }, [fileName, onRowsBulkCommit, onRowsChange, showToast])

  const onDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  // totaux
  const [hideEmptyCols, setHideEmptyCols] = useState(false)
  // ─── Modales règles R&D ────────────────────────────────────────────────────
  const [saveAsRuleModal, setSaveAsRuleModal] = useState(null) // { row, initial }
  const [verifyRulesModal, setVerifyRulesModal] = useState(null) // row

  const handleSaveAsRule = useCallback((rowIdx) => {
    const row = rowsRef.current[rowIdx]
    if (!row) return
    const r = resolveRow(row)
    const type = r.type || row.type || ''
    const h = r.haut_mm || row.haut_mm || ''
    const l = r.larg_mm || row.larg_mm || ''
    const prix = r._pu > 0 ? `${r._pu.toLocaleString('fr-FR')} € HT` : ''
    const perfs = ['rc','pb','cf','blast','belier','prison'].filter(k => {
      const idx = { rc: 3, pb: 4, cf: 5, blast: 6, belier: 7, prison: 8 }[k]
      return row._raw?.[idx] != null
    }).map(k => {
      const idx = { rc: 3, pb: 4, cf: 5, blast: 6, belier: 7, prison: 8 }[k]
      return `${k.toUpperCase()}=${row._raw[idx]}`
    }).join(', ')
    const title = `Validation R&D — ${type}${h && l ? ` ${h}×${l}` : ''}${perfs ? ` [${perfs}]` : ''}${prix ? ` → ${prix}` : ''}`
    const lines = [
      `Type : ${type || '—'}`,
      `Dimensions : ${h ? `H=${h} mm` : '—'} × ${l ? `L=${l} mm` : '—'}`,
      prix ? `Prix unitaire HT : ${prix}` : '',
      perfs ? `Performances : ${perfs}` : '',
      row._raw?.[12] ? `Serrure : ${row._raw[12]}` : '',
      r._serrureLabel ? `Serrure résolue : ${r._serrureLabel}` : '',
      row._raw?.[15] ? `Ferme-porte : ${row._raw[15]}` : '',
      row._raw?.[16] ? `Autres équipements : ${row._raw[16]}` : '',
      r._cremoneLabel ? `Crémone : ${r._cremoneLabel}` : '',
      row.ref_base ? `Référence base : ${row.ref_base}` : '',
      row.alertes?.length ? `Alertes : ${row.alertes.join('; ')}` : '',
    ].filter(Boolean).join('\n')
    setSaveAsRuleModal({ row, initial: { title, content: lines } })
  }, [])

  const handleVerifyRules = useCallback((rowIdx) => {
    const row = rowsRef.current[rowIdx]
    if (!row) return
    setVerifyRulesModal(row)
  }, [])
  const suggestDesignationForRow = useCallback(async (rowIdx) => {
    const row = rowsRef.current[rowIdx]
    if (!row || sectionOf(row) !== 'products') return
    setSuggestingRowId(rowIdx)
    try {
      const payloadRow = resolveRow(row)
      const data = await api.post('/devis/suggest-designation', { line: payloadRow }, { timeout: 90000 })
      const designation = String(data?.designation || '').trim()
      if (!designation) {
        showToast('Aucune suggestion de libellé', 'error')
        return
      }
      updateRow(rowIdx, { designation, type: row.type || designation })
      showToast(data?.examples?.length ? `Libellé IA appliqué (${data.examples.length} exemples)` : 'Libellé IA appliqué', 'success')
    } catch (err) {
      showToast(err?.error || err?.message || 'Erreur suggestion IA', 'error')
    } finally {
      setSuggestingRowId(null)
    }
  }, [showToast, updateRow])
  const totalPU  = rows.reduce((s, r) => s + (resolveRow(r, change, tva, multGlobal)._pu), 0)
  const totalHT = rows.reduce((s, r) => s + (resolveRow(r, change, tva, multGlobal)._totalHt || 0), 0)

  // Colonnes masquables : calculer lesquelles ont des données sur les lignes produits
  const productRows = rows.filter(r => sectionOf(r) === 'products')
  const hasVitrage = productRows.some(r => { const rv = resolveRow(r); return !!(rv._vitrageLabel) })
  const hasFP = productRows.some(r => { const rv = resolveRow(r); return !!(rv._fpLabel || r._raw?.[15]) })
  const hasCremone = productRows.some(r => { const rv = resolveRow(r); return !!(r._overrideCremone !== undefined ? r._overrideCremone : rv._cremoneLabel) })
  const hasAutres = productRows.some(r => { const rv = resolveRow(r); return !!(r._overrideAutres !== undefined ? r._overrideAutres : rv._otherExtras?.length) })
  const hasAcoustic = productRows.some(r => { const rv = resolveRow(r); return !!(rv._acousticValue) })
  const hiddenCols = hideEmptyCols
    ? new Set([...(!hasVitrage ? ['vitrage'] : []), ...(!hasFP ? ['fp'] : []), ...(!hasCremone ? ['cremone'] : []), ...(!hasAutres ? ['autres'] : []), ...(!hasAcoustic ? ['acoustic'] : [])])
    : new Set()
  const visibleDimensionCount = DIMENSION_COLUMNS.length - hiddenDimensionCols.size
  const dimensionHeader = (key, label, title) => (
    <Th
      style={{ width: key.includes('pl') ? 58 : 55, cursor: 'pointer', userSelect: 'none', background: 'color-mix(in srgb, var(--color-primary) 5%, transparent)' }}
      title={title || `Cliquer pour masquer ${label}`}
      onClick={() => toggleDimensionColumn(key)}
    >
      {label}
    </Th>
  )
  let displayIndex = 0
  const sectionEntries = SECTION_ORDER.flatMap(section => {
    const sectionRows = rows.map((row, index) => ({ row, index })).filter(item => sectionOf(item.row) === section)
    return sectionRows.length ? [{ type: 'section', section, count: sectionRows.length }, ...sectionRows.map(item => ({ type: 'row', ...item, displayIndex: displayIndex++ }))] : []
  })
  const openPdfDraftView = useCallback(() => {
    try {
      localStorage.setItem('devisGridRows', JSON.stringify(rows))
      if (fileName) localStorage.setItem('devisGridFileName', fileName)
    } catch { /* noop */ }
    navigate('/devis/grid/pdf-draft')
  }, [fileName, navigate, rows])

  // ─── Layout ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: embedded ? '100%' : '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', overflow: 'hidden' }}>

      {/* ── Colonne gauche — import (rétractable) ── */}
      {sidebarCollapsed ? (
        <div style={{ width: 36, flexShrink: 0, borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 8 }}>
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="Afficher la barre latérale"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-2)', padding: 4, display: 'flex' }}
          >
            <PanelLeftOpen size={16} />
          </button>
          <button
            onClick={() => { setSidebarCollapsed(false); setTimeout(() => fileInputRef.current?.click(), 0) }}
            title="Importer un xlsx"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', padding: 4, display: 'flex' }}
          >
            <Upload size={14} />
          </button>
        </div>
      ) : (
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate('/devis/legacy')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', padding: 2, display: 'flex' }}
            title="Retour legacy"
          >
              <ArrowLeft size={14} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{title}</span>
          <span style={{ fontSize: 9, padding: '1px 5px', background: 'var(--color-primary)', color: '#fff', borderRadius: 4, fontWeight: 700 }}>BETA</span>
          <button
            onClick={() => setSidebarCollapsed(true)}
            title="Réduire la barre latérale"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', padding: 2, display: 'flex' }}
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          style={{
            margin: 12, border: '2px dashed var(--color-border)', borderRadius: 8,
            padding: 20, textAlign: 'center', cursor: 'pointer',
            background: 'var(--color-surface)', transition: 'border-color 0.2s',
          }}
        >
          <Upload size={20} style={{ color: 'var(--color-primary)', marginBottom: 6 }} />
          <div style={{ fontSize: 11, color: 'var(--color-text-2)', lineHeight: 1.4 }}>
            Glisser un xlsx<br />ou cliquer
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
        </div>

        {fileName && (
          <div style={{ margin: '0 12px', padding: '6px 10px', background: 'var(--color-surface)', borderRadius: 6, fontSize: 10, color: 'var(--color-text-2)', wordBreak: 'break-all' }}>
            📄 {fileName}
          </div>
        )}

        {(rows.length > 0 || fileName) && (
          <button
            type="button"
            onClick={clearImportedGrid}
            title="Supprime toutes les lignes et le nom de fichier enregistré pour réimporter (utile après une erreur 502)"
            style={{
              margin: '8px 12px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '7px 10px',
              borderRadius: 6,
              border: '1px solid color-mix(in srgb, #a33c3c 45%, var(--color-border))',
              background: 'color-mix(in srgb, #a33c3c 10%, var(--color-surface))',
              color: '#c45c5c',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} /> Vider la grille
          </button>
        )}

        {/* Bouton ajout manuel */}
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            margin: '8px 12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-primary)',
            background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
            color: 'var(--color-primary)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Plus size={12} /> Ajouter une ligne
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '8px 12px 0' }}>
          <button
            type="button"
            onClick={() => addSectionRow('calculations')}
            title="Ajouter une ligne dans la section Calculs"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          >
            <Calculator size={12} /> Calcul
          </button>
          <button
            type="button"
            onClick={() => addSectionRow('transport')}
            title="Ajouter une ligne dans la section Transport"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          >
            <Truck size={12} /> Transport
          </button>
        </div>
        <a
          href="/devis/transport"
          style={{ margin: '8px 12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-2)', fontSize: 10, fontWeight: 700, textDecoration: 'none' }}
        >
          <Truck size={12} /> Tarifs transport
        </a>
        {loading && (
          <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: 'var(--color-text-3)' }}>
            Analyse en cours…
          </div>
        )}
        {error && (
          <div style={{ margin: '8px 12px', padding: '6px 8px', background: 'rgba(163,60,60,0.1)', color: '#a33c3c', borderRadius: 6, fontSize: 10 }}>
            {error}
          </div>
        )}

        {/* Bouton paramètres → ouvre la modal */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)', marginTop: 'auto' }}>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
              padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)',
              background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 11, cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Settings size={12} /> Paramètres
            </span>
            <span style={{ fontSize: 9, color: 'var(--color-text-3)' }}>
              ×{multGlobal} · {change}€ · {(tva * 100).toFixed(1)}%
            </span>
          </button>
        </div>
      </div>
      )}

      {/* ── Colonne centre — grille ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {subtitle || (rows.length > 0 ? `${rows.length} lignes analysées` : 'Importer un xlsx pour démarrer')}
            </span>
            {validatingImport && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--color-primary)', fontWeight: 800 }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Contrôle règles ligne par ligne
              </span>
            )}
            {!validatingImport && importValidationSummary && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: importValidationSummary.issueRows ? '#b45309' : '#16a34a', fontWeight: 800 }}>
                <ShieldCheck size={12} /> {importValidationSummary.issueRows ? `${importValidationSummary.issueRows} ligne(s) à vérifier` : 'Règles OK'}
              </span>
            )}
            <button
              type="button"
              onClick={addBlankRow}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 8px', background: 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))', border: '1px solid var(--color-primary)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 700 }}
            >
              <Plus size={12} /> Ligne
            </button>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={clearImportedGrid}
                title="Vider toutes les lignes du tableau"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 8px', background: 'color-mix(in srgb, #a33c3c 10%, var(--color-surface))', border: '1px solid color-mix(in srgb, #a33c3c 45%, var(--color-border))', borderRadius: 4, cursor: 'pointer', color: '#c45c5c', fontWeight: 700 }}
              >
                <Trash2 size={12} /> Vider tableau
              </button>
            )}
            <button
              type="button"
              onClick={() => addSectionRow('calculations')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text-2)', fontWeight: 700 }}
            >
              <Calculator size={12} /> Calcul
            </button>
            <button
              type="button"
              onClick={() => addSectionRow('transport')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text-2)', fontWeight: 700 }}
            >
              <Truck size={12} /> Transport
            </button>
            {hiddenDimensionCols.size > 0 && (
              <button
                type="button"
                onClick={() => setHiddenDimensionCols(new Set())}
                title="Réafficher H/L hors tout et H/L passage libre"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 8px', background: 'color-mix(in srgb, var(--color-primary) 12%, var(--color-surface))', border: '1px solid var(--color-primary)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 700 }}
              >
                <Eye size={12} /> Afficher toutes colonnes dimensions
              </button>
            )}
            {!embedded && <button
              type="button"
              onClick={openPdfDraftView}
              disabled={!rows.length}
              title="Pré-édition web du rendu PDF avec libellés éditables"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 8px', background: 'color-mix(in srgb, var(--color-primary) 12%, var(--color-surface))', border: '1px solid var(--color-primary)', borderRadius: 4, cursor: rows.length ? 'pointer' : 'default', color: 'var(--color-primary)', fontWeight: 700, opacity: rows.length ? 1 : 0.6 }}
            >
              <FileText size={12} /> Pré-édition PDF
            </button>}
            {rows.length > 0 && (
              <button
                onClick={() => setExpandedRows(prev => prev.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)))}
                style={{ fontSize: 10, padding: '3px 8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text-2)' }}
              >
                {expandedRows.size === rows.length ? 'Tout replier' : 'Tout déplier'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => setHideEmptyCols(v => !v)}
                title={hideEmptyCols ? 'Afficher toutes les colonnes équipements' : 'Masquer les colonnes équipements vides'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 8px', background: hideEmptyCols ? 'color-mix(in srgb, var(--color-primary) 12%, var(--color-surface))' : 'var(--color-surface)', border: `1px solid ${hideEmptyCols ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 4, cursor: 'pointer', color: hideEmptyCols ? 'var(--color-primary)' : 'var(--color-text-2)', fontWeight: 700 }}
              >
                {hideEmptyCols ? <Eye size={12} /> : <EyeOff size={12} />}
                {hideEmptyCols ? 'Afficher colonnes équipements' : 'Masquer colonnes vides'}
              </button>
            )}
            <ModeSwitch value={editMode} onChange={setEditMode} />
            <Legend />
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {rows.length === 0 && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--color-text-3)' }}>
              <Plus size={40} />
              <span style={{ fontSize: 13 }}>Ajouter une ligne blanche ou importer un xlsx</span>
              <button
                type="button"
                onClick={addBlankRow}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                <Plus size={14} /> Ligne blanche
              </button>
            </div>
          )}

          {rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 1990 }}>
              <thead>
                <tr>
                  <Th style={{ width: 36 }}>#</Th>
                  <Th style={{ minWidth: 140 }}>Désignation</Th>
                  <Th style={{ minWidth: 90, width: 110 }}>Localisation</Th>
                  <Th style={{ minWidth: 430, width: 430 }}>Perfs</Th>
                  {!hiddenDimensionCols.has('haut_ht') && dimensionHeader('haut_ht', 'H (HT)')}
                  {!hiddenDimensionCols.has('larg_ht') && dimensionHeader('larg_ht', 'L (HT)')}
                  {!hiddenDimensionCols.has('haut_pl') && dimensionHeader('haut_pl', 'H (PL)', 'Passage libre ou clair de vitrage pour châssis. Cliquer pour masquer.')}
                  {!hiddenDimensionCols.has('larg_pl') && dimensionHeader('larg_pl', 'L (PL)', 'Passage libre ou clair de vitrage pour châssis. Cliquer pour masquer.')}
                  <Th style={{ width: 74 }}>TL</Th>
                  <Th>Serrure</Th>
                  <Th>Garniture int.</Th>
                  <Th>Garniture ext.</Th>
                  <Th style={hiddenCols.has('vitrage') ? { display: 'none' } : {}}>Vitrage</Th>
                  <Th style={hiddenCols.has('fp') ? { display: 'none' } : {}}>Ferme-porte</Th>
                  <Th style={hiddenCols.has('cremone') ? { display: 'none' } : {}}>Crémone</Th>
                  <Th style={hiddenCols.has('autres') ? { display: 'none' } : {}}>Autres équipements</Th>
                  <Th style={hiddenCols.has('acoustic') ? { display: 'none' } : {}}>Acoustique</Th>
                  <Th style={{ ...CELL.gray, width: 90 }}>PU HT</Th>
                  <Th style={{ ...CELL.yellow, width: 90 }}>Remise</Th>
                  <Th style={{ ...CELL.yellow, width: 90 }}>Q.</Th>
                  <Th style={{ ...CELL.blue, width: 90 }}>Total HT</Th>
                  <Th style={{ width: 32 }}></Th>
                </tr>
              </thead>
              <tbody>
                {sectionEntries.map((entry, entryIndex) => {
                  if (entry.type === 'section') {
                    const meta = SECTION_META[entry.section]
                    const Icon = meta.icon
                    return (
                      <Fragment key={`section-${entry.section}`}>
                        <tr>
                          <td colSpan={GRID_TOTAL_COLS - hiddenDimensionCols.size} style={{ position: 'sticky', top: 31, zIndex: 1, padding: '7px 12px', background: 'color-mix(in srgb, var(--color-primary) 7%, var(--color-surface))', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 900, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                <Icon size={13} /> {meta.label} <span style={{ color: 'var(--color-text-3)', fontWeight: 700 }}>({entry.count})</span>
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--color-text-3)', textTransform: 'none', fontWeight: 500 }}>{meta.hint}</span>
                            </div>
                          </td>
                        </tr>
                        {entry.section !== 'products' && <AmountSectionColumns section={entry.section} hiddenDimensionCount={hiddenDimensionCols.size} />}
                      </Fragment>
                    )
                  }
                  const row = entry.row
                  const i = entry.index
                  if (sectionOf(row) !== 'products') {
                    return (
                      <AmountRow
                        key={`amount-${i}-${entryIndex}`}
                        row={row}
                        index={i}
                        displayIndex={entry.displayIndex}
                        change={change}
                        tva={tva}
                        multGlobal={multGlobal}
                        editMode={editMode}
                        defaultTransportAddress={defaultTransportAddress}
                        onUpdate={(patch) => updateRow(i, patch)}
                        onTransportAddressCommit={(address) => commitTransportAddress(i, address)}
                        onDelete={() => deleteRow(i)}
                        hiddenDimensionCount={hiddenDimensionCols.size}
                      />
                    )
                  }
                  return (
                  <Fragment key={`row-${i}-${entryIndex}`}>
                    <MainRow row={row} index={i} displayIndex={entry.displayIndex} expanded={expandedRows.has(i)} onToggle={() => toggleRow(i)} change={change} tva={tva} multGlobal={multGlobal} editMode={editMode} onUpdate={(patch) => updateRow(i, patch)} onRecompute={(patch) => recomputeRow(i, patch)} onDelete={() => deleteRow(i)} onSaveAsRule={() => handleSaveAsRule(i)} onVerifyRules={() => handleVerifyRules(i)} onSuggestDesignation={() => suggestDesignationForRow(i)} suggestingDesignation={suggestingRowId === i} hiddenCols={hiddenCols} hiddenDimensionCols={hiddenDimensionCols} />
                    {expandedRows.has(i) && (
                      <Fragment>
                        <SubRowRefs row={row} editMode={editMode} onRefCommit={(colIdx, ref) => handleRefCommit(i, colIdx, ref)} hiddenCols={hiddenCols} visibleDimensionCount={visibleDimensionCount} />
                        <SubRowPrices row={row} hiddenCols={hiddenCols} visibleDimensionCount={visibleDimensionCount} />
                        {/* Options supplémentaires */}
                        {(row.options || []).filter(o => !isColumnEquipmentOption(o) && !/acoustique|\b(30|35|40|45)\s*dB\b|remplissage|vitrage|ferme.?porte|garniture|serrure|msl|lss|kel|d[ée]ny/i.test(equipmentText(o))).map((opt, oi) => (
                          <tr key={`opt-${i}-${oi}`} style={{ background: SUBROW_BG }}>
                            <td colSpan={3} style={{ padding: '2px 8px 2px 52px', fontSize: 10, color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)' }}>
                              ↳ {opt.label}
                            </td>
                            <td colSpan={10} style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)' }}>
                              {opt.note}
                            </td>
                            <td style={{ padding: '2px 8px', fontSize: 11, textAlign: 'right', fontWeight: 600, ...CELL.gray, borderBottom: '1px solid var(--color-border)' }}>
                              {opt.prix > 0 ? opt.prix.toLocaleString('fr-FR') + ' €' : <span style={{ color: '#a06a2c' }}>mutualisé</span>}
                            </td>
                            <td colSpan={4} style={{ borderBottom: '1px solid var(--color-border)', ...CELL.blue }}></td>
                          </tr>
                        ))}
                        {/* Alertes */}
                        {(row.alertes || []).filter(a => a.startsWith('❌') || a.startsWith('⚠️')).map((a, ai) => (
                          <tr key={`alerte-${i}-${ai}`} style={{ background: 'rgba(160,106,44,0.06)' }}>
                            <td colSpan={GRID_TOTAL_COLS - hiddenDimensionCols.size} style={{ padding: '2px 8px 2px 52px', fontSize: 10, color: a.startsWith('❌') ? '#a33c3c' : '#a06a2c', borderBottom: '1px solid var(--color-border)' }}>
                              {a}
                            </td>
                          </tr>
                        ))}
                        {blockingVerdicts(row).map((verdict, vi) => {
                          const style = VERDICT_STYLE[verdict.status] || VERDICT_STYLE.warning
                          return (
                            <tr key={`rule-${i}-${vi}`} style={{ background: style.bg }}>
                              <td colSpan={GRID_TOTAL_COLS - hiddenDimensionCols.size} style={{ padding: '4px 8px 4px 52px', fontSize: 10, color: style.text, borderBottom: '1px solid var(--color-border)' }}>
                                <strong>{verdict.rule_code ? `${verdict.rule_code} — ` : ''}{verdict.rule_title}</strong>
                                {verdict.reason ? ` : ${verdict.reason}` : ''}
                                {verdict.fix ? <span style={{ marginLeft: 8, color: 'var(--color-text-2)' }}>Correctif : {verdict.fix}</span> : null}
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )}
                  </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={GRID_TOTAL_COLS - hiddenDimensionCols.size} style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                    <button
                      type="button"
                      onClick={addBlankRow}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))', color: 'var(--color-primary)', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                    >
                      <Plus size={13} /> Ligne blanche
                    </button>
                  </td>
                </tr>
                <tr style={{ background: 'var(--color-surface)' }}>
                  <td colSpan={16 - hiddenDimensionCols.size} style={{ padding: '8px 16px', fontWeight: 700, fontSize: 12, borderTop: '2px solid var(--color-border)' }}>
                    💶 Total général estimé
                  </td>
                  <td style={{ padding: '8px 8px', fontWeight: 700, fontSize: 12, textAlign: 'right', borderTop: '2px solid var(--color-border)', background: CELL.gray.background }}>
                    {totalPU.toLocaleString('fr-FR')} €
                  </td>
                  <td style={{ borderTop: '2px solid var(--color-border)' }}></td>
                  <td style={{ borderTop: '2px solid var(--color-border)' }}></td>
                  <td style={{ padding: '8px 8px', fontWeight: 800, fontSize: 14, textAlign: 'right', borderTop: '2px solid var(--color-border)', background: CELL.blue.background }}>
                    {totalHT.toLocaleString('fr-FR')} €
                  </td>
                  <td style={{ borderTop: '2px solid var(--color-border)', background: CELL.blue.background }}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div style={{ padding: '4px 16px', borderTop: '1px solid var(--color-border)', fontSize: 9, color: 'var(--color-text-3)', flexShrink: 0 }}>
          Estimatif — tarif NEXUS 2026-01 · Cliquer sur une ligne pour voir les références et les prix détaillés
        </div>
      </div>

      {/* Modale ajout de ligne */}
      {showAddModal && <AddLineModal onClose={() => setShowAddModal(false)} onAdd={addRow} />}

      {/* Modale paramètres devis */}
      {showSettings && (
        <SettingsModal
          change={change}
          multGlobal={multGlobal}
          tva={tva}
          onClose={() => setShowSettings(false)}
          onApply={(v) => { setChange(v.change); setMultGlobal(v.multGlobal); setTva(v.tva); showToast('Paramètres mis à jour', 'success') }}
        />
      )}

      {/* Toast d'enregistrement */}
      {/* ── Modales R&D ── */}
      {saveAsRuleModal && (
        <SaveAsRuleModal
          initial={saveAsRuleModal.initial}
          onClose={() => setSaveAsRuleModal(null)}
          onSave={async ({ title, content }) => {
            await api.post('/devis/save-as-rule', { title, content, category: 'Validations individuelles R&D' })
            showToast('Règle R&D soumise — en attente de validation admin', 'success')
          }}
        />
      )}
      {verifyRulesModal && (
        <VerifyRulesModal
          row={verifyRulesModal}
          onClose={() => setVerifyRulesModal(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
            padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: toast.kind === 'error' ? '#7f1d1d' : '#065f46',
            color: '#fff',
            boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: 8,
            animation: 'devisToastIn 0.18s ease-out',
          }}
        >
          {toast.kind === 'error' ? <AlertTriangle size={14} /> : <span style={{ fontSize: 14 }}>✓</span>}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

export default function DevisGrid() {
  return <DevisGridWorkspace />
}
