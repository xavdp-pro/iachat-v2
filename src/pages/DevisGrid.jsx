/**
 * DevisGrid — Vue tableur "mode Armand"
 * Route : /devis/grid
 * Layout : gauche (import fichiers) | centre (grille) | droite (chat Gemma)
 * Phase MVP : lecture seule + expand/collapse sous-rows
 */
import { useState, useCallback, useRef, useEffect, Fragment } from 'react'
import { Upload, RefreshCw, ChevronRight, ChevronDown, AlertTriangle, MessageSquare, ArrowLeft, PanelLeftClose, PanelLeftOpen, Plus, Minus, X, Check, Loader2, Settings, Trash2, Calculator, Truck, Package } from 'lucide-react'
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

// ─── Helpers ───────────────────────────────────────────────────────────────
const fmt = (v) => v == null ? '—' : typeof v === 'number' ? v.toLocaleString('fr-FR') + ' €' : v

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

function extractOptionRef(option) {
  return extractRef(option?.note) || extractRef(option?.label) || null
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

function findExtraEquipment(row, pattern) {
  return (row?.equip_extra || []).find(e => typeof e === 'object' && pattern.test(`${e.label || ''} ${e.note || ''} ${e.ref || ''}`)) || null
}

function nonCremoneExtraEquipments(row) {
  return (row?.equip_extra || []).filter(e => typeof e === 'object' && !/cr[ée]mone|semi.?fixe|vam/i.test(`${e.label || ''} ${e.note || ''}`))
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

function isAcousticValue(value) {
  return acousticValue(value) != null || /acoustique/i.test(String(value || ''))
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

export function resolveRow(r, change = 1, tva = 0.2, multGlobal = 1) {
  if (r?.line_section === 'calculations' || r?.line_section === 'transport') {
    const qty = r.qty ?? r.quantite ?? 1
    const unit = Number(r.prix_base_ht ?? r.total_ligne_ht ?? r.prix_total_min_ht ?? 0)
    const pu = unit * change * multGlobal
    return {
      ...r,
      _pu: pu,
      _total: pu * qty * (1 + tva),
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
  const total  = Math.round(pu * qty * mult * (1 + tva) * lineChange)
  // équipements structurés depuis les options + champs
  const serrure   = r.serrure?.ref  || null
  // options spécifiques
  const optVitrage = (r.options || []).find(o => /remplissage|vitrage/i.test(o.label))
  const optFP      = (r.options || []).find(o => /ferme.porte/i.test(o.label))
  const optSerrure = (r.options || []).find(o => /serrure|msl|lss|kel|dény/i.test(o.label))
  const optGarnInt = (r.options || []).find(o => /garniture int/i.test(o.label))
  const optGarnExt = (r.options || []).find(o => /garniture ext/i.test(o.label))
  const cremone = findExtraEquipment(r, /cr[ée]mone|semi.?fixe|vam/i)
  const otherExtras = nonCremoneExtraEquipments(r)
  const vitrageRef = optVitrage ? extractRef(optVitrage.note) || extractRef(optVitrage.label) : null
  const rawVitrage = isAcousticValue(r._raw?.[16]) ? null : r._raw?.[16]
  const serrureRef = extractRef(r.serrure?.ref) || extractOptionRef(optSerrure) || extractRef(r.serrure?.from)
  const fpRef     = extractOptionRef(optFP) || extractRef(r.ferme_porte?.ref)
  const garnIntLabel = r.garnitures?.int || r._raw?.[13] || optGarnInt?.label
  const garnExtLabel = r.garnitures?.ext || r._raw?.[14] || optGarnExt?.label
  const garnInt   = extractRef(r.garnitures?.int) || extractRef(r.garniture_int_ref) || extractOptionRef(optGarnInt) || extractRef(r._raw?.[13]) || fallbackGarnitureRef(r, 'int', garnIntLabel)
  const garnExt   = extractRef(r.garnitures?.ext) || extractRef(r.garniture_ext_ref) || extractOptionRef(optGarnExt) || extractRef(r._raw?.[14]) || fallbackGarnitureRef(r, 'ext', garnExtLabel)
  const thermolaquage = r.thermolaquage != null
    ? r.thermolaquage
    : !!(r._raw?.[16] && String(r._raw[16]).toUpperCase().includes('RAL'))
  return {
    ...r,
    _pu: pu,
    _pv: pv,
    _total: total,
    thermolaquage,
    _unpriced: unpriced,
    _serrureRef: serrureRef,
    _fpRef: fpRef,
    _vitrageRef: vitrageRef,
    _vitrageLabel: optVitrage?.label || rawVitrage || null,
    _vitrageNote: optVitrage?.note || null,
    _vitragePrix: optVitrage?.prix ?? null,
    _acousticValue: acousticValue(r._raw?.[9]) || acousticValue(r._raw?.[16]) || acousticValue(r.acoustique),
    _garnIntRef: garnInt,
    _garnExtRef: garnExt,
    _fpLabel: r.ferme_porte?.ref ? r.ferme_porte.ref.replace(/ \(par défaut\)/, '') : null,
    _cremoneRef: extractRef(cremone?.ref) || extractRef(cremone?.note) || extractRef(cremone?.label),
    _cremoneLabel: cremone?.label || null,
    _cremoneNote: cremone?.note || null,
    _cremonePrix: cremone?.prix ?? null,
    _otherExtras: otherExtras,
    _otherExtrasRefs: otherExtras.map(e => e.ref || extractRef(e.note) || extractRef(e.label)).filter(Boolean),
    _otherExtrasPrix: otherExtras.reduce((sum, e) => sum + (Number(e.prix) || 0), 0),
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
function Th({ children, style = {} }) {
  return (
    <th style={{
      padding: '6px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.05em', color: 'var(--color-text-3)', whiteSpace: 'nowrap',
      background: 'var(--color-surface)', borderBottom: '2px solid var(--color-border)',
      position: 'sticky', top: 0, zIndex: 2,
      ...style,
    }}>
      {children}
    </th>
  )
}

// ─── Composant cellule data ──────────────────────────────────────────────────
function Td({ children, palette = 'normal', style = {} }) {
  return (
    <td style={{
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

const PERF_CONTROL_WIDTH = {
  rc: 58,
  pb: 58,
  cf: 58,
  blast: 64,
  belier: 64,
  prison: 64,
  acoustic: 72,
}

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

// ─── Composant ligne principale ──────────────────────────────────────────────
function MainRow({ row, index, displayIndex = index, expanded, onToggle, change, tva, multGlobal, editMode, onUpdate, onRecompute, onDelete }) {
  const r = resolveRow(row, change, tva, multGlobal)
  const qty = Number.isFinite(r.qty) ? r.qty : 1
  const isAmountSection = sectionOf(row) !== 'products'
  const [showEmptyPerfs, setShowEmptyPerfs] = useState(false)
  const perfKeys = ['rc', 'pb', 'cf', 'blast', 'belier', 'prison', 'acoustic']
  const rawIndexByPerf = { rc: 3, pb: 4, cf: 5, blast: 6, belier: 7, prison: 8, acoustic: 9 }
  const visiblePerfKeys = isAmountSection ? [] : (editMode
    ? perfKeys.filter(key => row._manualBlank || showEmptyPerfs || row._raw?.[rawIndexByPerf[key]] != null)
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
                <EditableSelect
                  value={r.type}
                  options={TYPE_OPTIONS}
                  onCommit={(v) => onRecompute?.({ type: v })}
                  placeholder="Type…"
                />
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
        </div>
      </Td>
      {/* Performances */}
      <Td style={{ minWidth: 150, fontSize: 10, color: 'var(--color-text-2)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'stretch' }}>
          {editMode ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minHeight: 26 }}>
              {visiblePerfKeys.map(key => {
                const rawIdx = rawIndexByPerf[key]
                const cur = key === 'acoustic' ? (r._acousticValue || row._raw?.[rawIdx] || null) : (row._raw?.[rawIdx] ?? null)
                const isSet = cur != null
                const controlWidth = PERF_CONTROL_WIDTH[key] || 58
                return (
                  <div key={key} onClick={e => e.stopPropagation()} style={{ position: 'relative', flex: `0 0 ${controlWidth}px` }}>
                    <select
                      value={cur ?? ''}
                      onChange={e => {
                        const v = e.target.value || null
                        onRecompute?.({ [`_raw_${rawIdx}`]: v })
                      }}
                      title={key === 'acoustic' ? 'Acoustique' : key.toUpperCase()}
                      style={{
                        width: controlWidth,
                        height: 26,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '0 20px 0 7px',
                        cursor: 'pointer',
                        background: isSet ? 'color-mix(in srgb, #fbbf24 18%, var(--color-surface))' : 'var(--color-surface)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)',
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, fontSize: 9 }}>
              {(['rc','pb','cf','blast','belier','prison','acoustic']).map(key => {
                const rawIdx = { rc: 3, pb: 4, cf: 5, blast: 6, belier: 7, prison: 8, acoustic: 9 }[key]
                const cur = key === 'acoustic' ? r._acousticValue : row._raw?.[rawIdx]
                if (!cur) return null
                return (
                  <span key={key} style={{ padding: '1px 4px', borderRadius: 3, background: 'color-mix(in srgb, #fbbf24 14%, transparent)', fontWeight: 600 }}>{cur}</span>
                )
              })}
            </div>
          )}
        </div>
      </Td>
      {/* H */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ textAlign: 'right', width: 55, padding: 0 }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableNumber value={r.haut_mm} onCommit={v => onRecompute?.({ haut_mm: v })} step={10} min={100} max={9999} width="100%" textAlign="right" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{r.haut_mm ?? '—'}</span>}
      </Td>
      {/* L */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ textAlign: 'right', width: 55, padding: 0 }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableNumber value={r.larg_mm} onCommit={v => onRecompute?.({ larg_mm: v })} step={10} min={100} max={9999} width="100%" textAlign="right" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{r.larg_mm ?? '—'}</span>}
      </Td>
      {/* TL */}
      <Td style={{ width: 44, textAlign: 'center', padding: 0 }}>
        {isAmountSection ? <span style={{ fontSize: 9, color: 'var(--color-text-3)' }}>—</span> : editMode ? (
          <button
            onClick={e => {
              e.stopPropagation()
              const raw = Array.isArray(row._raw) ? [...row._raw] : new Array(17).fill(null)
              while (raw.length < 17) raw.push(null)
              const cur = String(raw[16] || '')
              raw[16] = cur.includes('RAL') ? cur.replace(/\bRAL\b[,\s]*/gi, '').trim() || null : (cur ? cur + ', RAL' : 'RAL')
              onRecompute?.({ _raw_override: raw })
            }}
            style={{
              fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, cursor: 'pointer', border: 'none',
              background: r.thermolaquage ? '#fbbf24' : 'var(--color-surface)',
              color: r.thermolaquage ? '#000' : 'var(--color-text-3)',
            }}
          >
            {r.thermolaquage ? 'RAL' : '—'}
          </button>
        ) : (
          <span style={{ fontSize: 9, fontWeight: 700, color: r.thermolaquage ? '#fbbf24' : 'var(--color-text-3)' }}>
            {r.thermolaquage ? 'RAL' : '—'}
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
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 130 }}>
        {editMode
          ? (isAmountSection ? <EditableText value={row.notes || row.alertes?.[0] || ''} onCommit={v => onUpdate?.({ notes: v, alertes: v ? [v] : [] })} placeholder="note…" /> : <EditableText value={row._raw?.[16] ?? ''} onCommit={v => onRecompute?.({ [`_raw_16`]: v })} placeholder="" />)
          : (r._vitrageLabel ? (
            <Popover content={r._vitrageNote || r._vitrageLabel}>
              <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block', fontWeight: 600 }}>
                {mainEquipLabel(r._vitrageLabel)}{r._vitrageRef ? ` · réf.${r._vitrageRef}` : ''}{r._vitragePrix != null ? ` · ${Number(r._vitragePrix).toLocaleString('fr-FR')} €` : ''}
              </span>
            </Popover>
          ) : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{isAcousticValue(row._raw?.[16]) ? '' : (row._raw?.[16] || '')}</span>)}
      </Td>
      {/* FP */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 60 }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableText value={mainEquipLabel(row._raw?.[15] ?? r._fpLabel ?? '')} onCommit={v => onRecompute?.({ [`_raw_15`]: v })} placeholder="FP…" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{mainEquipLabel(row._raw?.[15] || r._fpLabel) || '—'}</span>}
      </Td>
      {/* Crémone */}
      <Td palette="normal" style={{ minWidth: 110, fontSize: 11, color: 'var(--color-text-2)' }}>
        {r._cremoneLabel ? (
          <Popover content={r._cremoneNote || r._cremoneLabel}>
            <span style={{ display: 'inline-block', padding: '2px 4px', fontWeight: 600 }}>{mainEquipLabel(r._cremoneLabel)}</span>
          </Popover>
        ) : '—'}
      </Td>
      {/* Autres équipements */}
      <Td palette="normal" style={{ minWidth: 140, fontSize: 11, color: 'var(--color-text-2)' }}>
        {r._otherExtras?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {r._otherExtras.map((e, extraIndex) => (
              <Popover key={`${e.ref || e.label || extraIndex}`} content={e.note || e.label}>
                <span style={{ display: 'inline-block', padding: '1px 4px', fontWeight: 600 }}>
                  {mainEquipLabel(e.label)}{e.ref ? ` · réf.${e.ref}` : ''}{e.prix != null ? ` · ${Number(e.prix).toLocaleString('fr-FR')} €` : ''}
                </span>
              </Popover>
            ))}
          </div>
        ) : '—'}
      </Td>
      {/* PU HT */}
      <Td palette="gray" style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {editMode && isAmountSection
          ? <EditableNumber value={r.prix_base_ht ?? 0} onCommit={v => onUpdate?.({ prix_base_ht: v, prix_total_min_ht: v, total_ligne_ht: v })} step={10} min={0} max={999999} width="100%" textAlign="right" />
          : (r._pu > 0 ? r._pu.toLocaleString('fr-FR') + ' €' : '—')}
      </Td>
      {/* Q (toujours éditable) */}
      <Td palette="yellow" style={{ textAlign: 'center', width: 36, padding: 0 }}>
        <EditableNumber value={qty} onCommit={v => onUpdate?.({ qty: v })} step={1} min={1} max={9999} width="100%" />
      </Td>
      {/* Total TTC */}
      <Td palette="blue" style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', fontSize: 12 }}>
        {r._pu > 0 ? r._total.toLocaleString('fr-FR') + ' €' : '—'}
      </Td>
      <Td style={{ width: 32, textAlign: 'center', padding: 0 }}>
        {editMode && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDelete?.() }}
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
function SubRowRefs({ row }) {
  const r = resolveRow(row)
  const cells = [
    r._serrureRef, r._garnIntRef, r._garnExtRef,
    r._vitrageRef,
    r._fpRef, r._cremoneRef, r._otherExtrasRefs?.join(', ') || null,
  ]
  return (
    <tr style={{ background: SUBROW_BG }}>
      <td colSpan={3} style={{ padding: '3px 8px 3px 40px', fontSize: 10, fontWeight: 700, color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)' }}>
        Références
      </td>
      <td colSpan={2} style={{ padding: '3px 8px', fontSize: 10, color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)' }}></td>
      <td style={{ padding: '3px 8px', fontSize: 10, color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)' }}></td>
      {cells.map((ref, i) => (
        <td key={i} style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, ...CELL.yellow, borderBottom: '1px solid var(--color-border)' }}>
          {ref || '—'}
        </td>
      ))}
      <td colSpan={4} style={{ borderBottom: '1px solid var(--color-border)', ...CELL.gray }}></td>
    </tr>
  )
}

// ─── Sous-row prix ────────────────────────────────────────────────────────────
function SubRowPrices({ row }) {
  const r = resolveRow(row)
  const prices = [
    r._optSerrure?.prix, r._optGarnInt?.prix, r._optGarnExt?.prix,
    r._vitragePrix, r._optFP?.prix, r._cremonePrix, r._otherExtrasPrix || null,
  ]
  const visiblePrices = r._unpriced ? prices.map(() => undefined) : prices
  return (
    <tr style={{ background: SUBROW_BG }}>
      <td colSpan={3} style={{ padding: '3px 8px 3px 40px', fontSize: 10, fontWeight: 700, color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)' }}>
        Prix unitaires
      </td>
      <td colSpan={2} style={{ padding: '3px 8px', borderBottom: '1px solid var(--color-border)', ...CELL.gray }}></td>
      <td style={{ borderBottom: '1px solid var(--color-border)', ...CELL.gray }}></td>
      {visiblePrices.map((p, i) => (
        <td key={i} style={{ padding: '3px 8px', fontSize: 11, ...CELL.gray, borderBottom: '1px solid var(--color-border)', textAlign: 'right' }}>
          {p === undefined ? '—' : (p != null ? p.toLocaleString('fr-FR') + ' €' : <span style={{ color: 'var(--color-text-3)' }}>de série</span>)}
        </td>
      ))}
      {/* PU base dans la colonne PU HT */}
      <td style={{ padding: '3px 8px', fontSize: 11, textAlign: 'right', ...CELL.gray, borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-3)' }}>
        base: {r._unpriced ? '—' : (r.prix_base_ht?.toLocaleString('fr-FR') ?? '—')} €
      </td>
      <td colSpan={3} style={{ borderBottom: '1px solid var(--color-border)', ...CELL.blue }}></td>
    </tr>
  )
}

function truncate(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ─── Options statiques Performances ─────────────────────────────────────────
const PERF_OPTIONS = {
  rc:     [{ value: null, label: '—' }, { value: 'CR3', label: 'CR3' }, { value: 'CR4', label: 'CR4' }, { value: 'CR5', label: 'CR5' }, { value: 'CR6', label: 'CR6' }],
  pb:     [{ value: null, label: '—' }, { value: 'FB4', label: 'FB4' }, { value: 'FB5', label: 'FB5' }, { value: 'FB6', label: 'FB6' }, { value: 'FB7', label: 'FB7' }],
  cf:     [{ value: null, label: '—' }, { value: 'EI30', label: 'EI30' }, { value: 'EI60', label: 'EI60' }, { value: 'EI120', label: 'EI120' }],
  blast:  [{ value: null, label: '—' }, { value: '2t/m²', label: 'Blast 2t' }, { value: '4t/m²', label: 'Blast 4t' }, { value: '5t/m²', label: 'Blast 5t' }],
  belier: [{ value: null, label: '—' }, { value: 'Bélier', label: 'Bélier' }],
  prison: [{ value: null, label: '—' }, { value: 'Prison', label: 'Prison' }],
  acoustic: [{ value: null, label: '—' }, { value: '30 dB', label: '30 dB' }, { value: '35 dB', label: '35 dB' }, { value: '40 dB', label: '40 dB' }, { value: '45 dB', label: '45 dB' }],
}

const TYPE_OPTIONS = ['BP 1V', 'BP 2V', 'Chassis', 'Guichet'].map(value => ({ value, label: value }))

function createBlankGridRow() {
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
    _raw: new Array(17).fill(null),
  }
}

const SECTION_META = {
  products: { label: 'Produits', icon: Package, hint: 'Portes, châssis, guichets et équipements intégrés' },
  calculations: { label: 'Calculs', icon: Calculator, hint: 'Avis de chantier et notes de calcul explosion' },
  transport: { label: 'Transport', icon: Truck, hint: 'Frais de port et livraison' },
}

const SECTION_ORDER = ['products', 'calculations', 'transport']
const CALCULATION_OPTION_RE = /note de calcul|avis de chantier|avis chantier|calcul explosion/i

function sectionOf(row) {
  return SECTION_META[row?.line_section] ? row.line_section : 'products'
}

function createAmountRow(section = 'calculations', label = '') {
  const isTransport = section === 'transport'
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
    alertes: [],
    docs: [],
    _manualBlank: true,
    _raw: new Array(17).fill(null),
  }
}

function splitCalculationOptions(rows) {
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
    const calcTotal = calcOptions.reduce((sum, option) => sum + (Number(option?.prix) || 0), 0)
    const productTotal = row.prix_total_min_ht != null ? Math.max(0, Number(row.prix_total_min_ht) - calcTotal) : row.prix_total_min_ht
    nextRows.push({ ...row, line_section: 'products', options: productOptions, prix_total_min_ht: productTotal, total_ligne_ht: productTotal })
    calcOptions.forEach(option => {
      nextRows.push({
        ...createAmountRow('calculations', option.label || 'Calcul'),
        designation: option.label || 'Calcul',
        prix_base_ht: Number(option.prix) || 0,
        prix_total_min_ht: Number(option.prix) || 0,
        total_ligne_ht: Number(option.prix) || 0,
        ref_base: extractOptionRef(option),
        options: [],
        alertes: option.note ? [option.note] : [],
        docs: row.docs || [],
        _generatedFrom: row.designation || row.type || null,
      })
    })
  }
  return nextRows
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
    if (options) { setOpts(options); return }
    if (!loadOnMount || !loader) return
    let alive = true
    setLoading(true)
    loader().then(o => { if (alive) setOpts(o || []) }).finally(() => { if (alive) setLoading(false) })
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
  useEffect(() => { if (!focused.current) setV(value ?? '') }, [value])
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
function EditableNumber({ value, onCommit, step = 1, min, max, decimals = 0, suffix = '', width = 'auto', textAlign = 'center' }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  useEffect(() => { setV(value == null ? '' : String(value)) }, [value])
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
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-2)' }}>Coefficient multiplicateur (marge globale)</span>
            <input
              type="text" inputMode="decimal" value={m} onChange={e => setM(e.target.value)}
              placeholder="1.00"
              style={{ fontSize: 13, padding: '6px 10px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)' }}
            />
            <span style={{ fontSize: 10, color: 'var(--color-text-3)' }}>Ex : 1.15 = +15% de marge. 0.9 = remise 10%.</span>
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
  startWithBlank = false,
  onRowsChange = null,
  onRowsCommit = null,
  onRowsDelete = null,
  title = 'Devis Grid',
  subtitle = null,
}) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(() => {
    if (Array.isArray(initialRows)) return initialRows.length > 0 ? splitCalculationOptions(initialRows) : (startWithBlank ? [createBlankGridRow()] : [])
    try {
      const saved = localStorage.getItem('devisGridRows')
      if (saved) return JSON.parse(saved) || []
    } catch { /* noop */ }
    return []
  })
  const [fileName, setFileName] = useState(() => {
    try { return localStorage.getItem('devisGridFileName') || null } catch { return null }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
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
  useEffect(() => {
    if (Array.isArray(initialRows)) setRows(initialRows.length > 0 ? splitCalculationOptions(initialRows) : (startWithBlank ? [createBlankGridRow()] : []))
  }, [initialRows, startWithBlank])
  // Ref vers les rows courants — permet à recomputeRow de lire sans passer par un updater
  const rowsRef = useRef(rows)
  useEffect(() => { rowsRef.current = rows }, [rows])
  useEffect(() => {
    try { localStorage.setItem('devisGridSidebarCollapsed', sidebarCollapsed ? '1' : '0') } catch { /* noop */ }
  }, [sidebarCollapsed])

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
    const nextRows = [...rowsRef.current, createAmountRow(section)]
    setRows(nextRows)
    setEditMode(true)
    setExpandedRows(prev => new Set([...prev, nextRows.length - 1]))
    onRowsCommit?.(nextRows[nextRows.length - 1], nextRows.length - 1, { _created: true })
    showToast(section === 'transport' ? 'Ligne transport ajoutée' : 'Ligne calcul ajoutée', 'success')
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
    api.post('/devis/recompute-row', { row: raw }, { timeout: 30000 })
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

  const handleFile = async (file) => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/devis/analyze', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      })
      // api interceptor retourne déjà res.data → res = { results: [...] }
      const data = res?.results ?? (Array.isArray(res) ? res : [])
      const sectionedRows = splitCalculationOptions(Array.isArray(data) ? data : [])
      setRows(sectionedRows)
      onRowsChange?.(sectionedRows)
      setFileName(file.name)
      setExpandedRows(new Set())
    } catch (e) {
      setError(e?.error || e?.details || e?.message || 'Erreur import')
    } finally {
      setLoading(false)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  // totaux
  const totalPU  = rows.reduce((s, r) => s + (resolveRow(r, change, tva, multGlobal)._pu), 0)
  const totalTTC = rows.reduce((s, r) => s + (resolveRow(r, change, tva, multGlobal)._total), 0)
  let displayIndex = 0
  const sectionEntries = SECTION_ORDER.flatMap(section => {
    const sectionRows = rows.map((row, index) => ({ row, index })).filter(item => sectionOf(item.row) === section)
    return sectionRows.length ? [{ type: 'section', section, count: sectionRows.length }, ...sectionRows.map(item => ({ type: 'row', ...item, displayIndex: displayIndex++ }))] : []
  })

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
            <button
              type="button"
              onClick={addBlankRow}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 8px', background: 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))', border: '1px solid var(--color-primary)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 700 }}
            >
              <Plus size={12} /> Ligne
            </button>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 1410 }}>
              <thead>
                <tr>
                  <Th style={{ width: 36 }}>#</Th>
                  <Th style={{ minWidth: 140 }}>Désignation</Th>
                  <Th style={{ minWidth: 150 }}>Perfs</Th>
                  <Th style={{ width: 55 }}>H (HT)</Th>
                  <Th style={{ width: 55 }}>L (HT)</Th>
                  <Th style={{ width: 40 }}>TL</Th>
                  <Th>Serrure</Th>
                  <Th>Garniture int.</Th>
                  <Th>Garniture ext.</Th>
                  <Th>Vitrage</Th>
                  <Th>Ferme-porte</Th>
                  <Th>Crémone</Th>
                  <Th>Autres équipements</Th>
                  <Th style={{ ...CELL.gray, width: 90 }}>PU HT</Th>
                  <Th style={{ ...CELL.yellow, width: 36 }}>Q.</Th>
                  <Th style={{ ...CELL.blue, width: 100 }}>Total TTC</Th>
                  <Th style={{ width: 32 }}></Th>
                </tr>
              </thead>
              <tbody>
                {sectionEntries.map((entry, entryIndex) => {
                  if (entry.type === 'section') {
                    const meta = SECTION_META[entry.section]
                    const Icon = meta.icon
                    return (
                      <tr key={`section-${entry.section}`}>
                        <td colSpan={17} style={{ position: 'sticky', top: 31, zIndex: 1, padding: '7px 12px', background: 'color-mix(in srgb, var(--color-primary) 7%, var(--color-surface))', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 900, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                              <Icon size={13} /> {meta.label} <span style={{ color: 'var(--color-text-3)', fontWeight: 700 }}>({entry.count})</span>
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--color-text-3)', textTransform: 'none', fontWeight: 500 }}>{meta.hint}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  const row = entry.row
                  const i = entry.index
                  return (
                  <Fragment key={`row-${i}-${entryIndex}`}>
                    <MainRow row={row} index={i} displayIndex={entry.displayIndex} expanded={expandedRows.has(i)} onToggle={() => toggleRow(i)} change={change} tva={tva} multGlobal={multGlobal} editMode={editMode} onUpdate={(patch) => updateRow(i, patch)} onRecompute={(patch) => recomputeRow(i, patch)} onDelete={() => deleteRow(i)} />
                    {expandedRows.has(i) && (
                      <Fragment>
                        <SubRowRefs row={row} />
                        <SubRowPrices row={row} />
                        {/* Options supplémentaires */}
                        {(row.options || []).filter(o => !/acoustique|\b(30|35|40|45)\s*dB\b|remplissage|vitrage|ferme.porte|garniture|serrure|msl|lss|kel|dény/i.test(o.label)).map((opt, oi) => (
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
                            <td colSpan={3} style={{ borderBottom: '1px solid var(--color-border)', ...CELL.blue }}></td>
                          </tr>
                        ))}
                        {/* Alertes */}
                        {(row.alertes || []).filter(a => a.startsWith('❌') || a.startsWith('⚠️')).map((a, ai) => (
                          <tr key={`alerte-${i}-${ai}`} style={{ background: 'rgba(160,106,44,0.06)' }}>
                            <td colSpan={17} style={{ padding: '2px 8px 2px 52px', fontSize: 10, color: a.startsWith('❌') ? '#a33c3c' : '#a06a2c', borderBottom: '1px solid var(--color-border)' }}>
                              {a}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )}
                  </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={17} style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
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
                  <td colSpan={13} style={{ padding: '8px 16px', fontWeight: 700, fontSize: 12, borderTop: '2px solid var(--color-border)' }}>
                    💶 Total général estimé
                  </td>
                  <td style={{ padding: '8px 8px', fontWeight: 700, fontSize: 12, textAlign: 'right', borderTop: '2px solid var(--color-border)', ...CELL.gray }}>
                    {totalPU.toLocaleString('fr-FR')} €
                  </td>
                  <td style={{ borderTop: '2px solid var(--color-border)' }}></td>
                  <td style={{ padding: '8px 8px', fontWeight: 800, fontSize: 14, textAlign: 'right', borderTop: '2px solid var(--color-border)', ...CELL.blue }}>
                    {totalTTC.toLocaleString('fr-FR')} €
                  </td>
                  <td style={{ borderTop: '2px solid var(--color-border)', ...CELL.blue }}></td>
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
