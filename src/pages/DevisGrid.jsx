/**
 * DevisGrid — Vue tableur "mode Armand"
 * Route : /devis/grid
 * Layout : gauche (import fichiers) | centre (grille) | droite (chat Zerux IA)
 * Phase MVP : lecture seule + expand/collapse sous-rows
 */
import { useState, useCallback, useRef, useEffect, useMemo, Fragment } from 'react'
import { Upload, RefreshCw, ChevronRight, ChevronDown, AlertTriangle, MessageSquare, ArrowLeft, PanelLeftClose, PanelLeftOpen, Plus, Minus, X, Check, Loader2, Settings, Trash2, Calculator, Truck, Package, EyeOff, Eye, BookOpen, ShieldCheck, FileText, Bot, Sparkles, History, Send, Columns2, Undo2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api, { hasAuthToken } from '../api/index.js'
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
const VALIDATION_PARALLELISM = 3
const ASSISTANT_CELL_HIGHLIGHT_STYLE = {
  background: 'rgba(34,197,94,0.26)',
  border: '1px solid rgba(34,197,94,0.85)',
  boxShadow: 'inset 0 0 0 1px rgba(34,197,94,0.35)',
}

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

async function runClientLimited(items, limit, worker) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(Math.max(Number(limit) || 1, 1), items.length || 1) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index], index)
    }
  })
  await Promise.all(workers)
}

function QuickGridAssistantPanel({
  rows = [],
  messages = [],
  input = '',
  setInput,
  loading = false,
  onAsk,
  historyEntries = [],
  verificationReport = null,
  verificationProgress = null,
  verificationSummary = null,
  onRunVerification,
  onOpenVerificationReport,
  onClearHistory,
  onUndoHistoryEntry,
  endRef,
  inputRef,
}) {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem('devis_grid_assistant_tab')
      return ['chat', 'ia-verif', 'historique'].includes(saved) ? saved : 'chat'
    } catch { return 'chat' }
  })
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('devis_grid_assistant_collapsed') === '1' } catch { return false }
  })
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('devis_grid_assistant_width'))
      return Number.isFinite(saved) && saved >= 300 ? Math.min(720, saved) : 360
    } catch { return 360 }
  })

  useEffect(() => { try { localStorage.setItem('devis_grid_assistant_tab', activeTab) } catch { /* noop */ } }, [activeTab])
  useEffect(() => { try { localStorage.setItem('devis_grid_assistant_collapsed', collapsed ? '1' : '0') } catch { /* noop */ } }, [collapsed])
  useEffect(() => { try { localStorage.setItem('devis_grid_assistant_width', String(panelWidth)) } catch { /* noop */ } }, [panelWidth])

  const startResize = (event) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = panelWidth
    const onMove = (moveEvent) => {
      const next = Math.min(760, Math.max(300, startWidth - (moveEvent.clientX - startX)))
      setPanelWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const submit = () => {
    const question = String(input || '').trim()
    if (!question || loading) return
    onAsk?.(question)
  }

  if (collapsed) {
    return (
      <aside style={{ width: 42, minWidth: 42, flexShrink: 0, borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10 }}>
        <button type="button" onClick={() => setCollapsed(false)} title="Ouvrir Zerux IA" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Bot size={15} />
        </button>
        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', marginTop: 12, fontSize: 11, fontWeight: 800, color: 'var(--color-text-3)' }}>Zerux IA</div>
      </aside>
    )
  }

  return (
    <aside style={{ width: panelWidth, minWidth: panelWidth, maxWidth: panelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', position: 'relative' }}>
      <div role="separator" aria-label="Redimensionner Zerux IA" onMouseDown={startResize} title="Glisser pour agrandir ou réduire Zerux IA" style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 2 }} />
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Bot size={16} color="var(--color-primary)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Zerux IA</div>
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Chiffrage rapide · {rows.length} ligne{rows.length !== 1 ? 's' : ''}</div>
        </div>
        <button type="button" onClick={() => setPanelWidth(360)} title="Largeur par défaut" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 5, borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-2)', cursor: 'pointer' }}>
          <Columns2 size={13} />
        </button>
        <button type="button" onClick={() => setCollapsed(true)} title="Rétracter Zerux IA" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 5, borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-2)', cursor: 'pointer' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button type="button" onClick={() => setActiveTab('chat')} title="Chatbot" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: activeTab === 'chat' ? 'var(--color-input-bg)' : 'transparent', color: activeTab === 'chat' ? 'var(--color-text)' : 'var(--color-text-2)', cursor: 'pointer' }}><Bot size={15} /></button>
        <button type="button" onClick={() => setActiveTab('ia-verif')} title="Vérification IA" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: activeTab === 'ia-verif' ? 'var(--color-input-bg)' : 'transparent', color: activeTab === 'ia-verif' ? 'var(--color-text)' : 'var(--color-text-2)', cursor: 'pointer' }}><Sparkles size={15} /></button>
        <button type="button" onClick={() => setActiveTab('historique')} title="Historique" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: activeTab === 'historique' ? 'var(--color-input-bg)' : 'transparent', color: activeTab === 'historique' ? 'var(--color-text)' : 'var(--color-text-2)', cursor: 'pointer' }}><History size={15} /></button>
      </div>

      {activeTab === 'ia-verif' ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} />Vérification IA</strong>
            <button type="button" onClick={onRunVerification} disabled={!rows.length || verificationProgress} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text)', fontSize: 11, fontWeight: 800, cursor: rows.length && !verificationProgress ? 'pointer' : 'default', opacity: rows.length && !verificationProgress ? 1 : 0.5 }}>
              {verificationProgress ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />} Relancer
            </button>
          </div>
          {verificationProgress && <div style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 800 }}>Contrôle IA {verificationProgress.done}/{verificationProgress.total}</div>}
          {verificationReport ? (
            <button type="button" onClick={onOpenVerificationReport} style={{ textAlign: 'left', padding: 12, borderRadius: 8, border: '1px solid var(--color-border)', background: verificationReport.status === 'validated' ? 'rgba(22,163,74,0.08)' : verificationReport.status === 'technical' ? 'rgba(245,158,11,0.10)' : 'rgba(220,38,38,0.08)', color: 'var(--color-text)', cursor: 'pointer' }}>
              <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>{verificationReport.status === 'validated' ? 'Validé IA' : verificationReport.status === 'technical' ? 'Analyse à relancer' : 'Corrections nécessaires'}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{verificationReport.issue_rows || 0} ligne(s) à corriger · {verificationReport.technical_rows || 0} à relancer · {verificationReport.rules_count || 0} règle(s)</div>
            </button>
          ) : verificationSummary ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>Dernier bilan : {verificationSummary.issueRows || 0} correction(s), {verificationSummary.technicalRows || 0} relance(s).</div>
          ) : <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Aucune vérification IA récente. Importez un fichier ou ajoutez des lignes, puis relancez le contrôle.</div>}
        </div>
      ) : activeTab === 'historique' ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}><History size={14} />Historique grille</strong>
            <button type="button" onClick={onClearHistory} disabled={!historyEntries.length} title="Vider l'historique" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 5, borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: '#dc2626', cursor: historyEntries.length ? 'pointer' : 'default', opacity: historyEntries.length ? 1 : 0.45 }}><Trash2 size={13} /></button>
          </div>
          {historyEntries.length ? historyEntries.map(entry => {
            const canUndo = entry?.undoable && Array.isArray(entry.undoRows) && entry.undoRows.length && !entry.undoneAt
            return (
            <div key={entry.id} style={{ border: `1px solid ${entry.undoneAt ? 'var(--color-border)' : canUndo ? 'rgba(34,197,94,0.65)' : 'var(--color-border)'}`, borderRadius: 8, background: entry.undoneAt ? 'var(--color-surface)' : 'var(--color-input-bg)', padding: 10, opacity: entry.undoneAt ? 0.68 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--color-text)', minWidth: 0 }}>{entry.label}</div>
                {entry.undoable && (
                  <button
                    type="button"
                    onClick={() => onUndoHistoryEntry?.(entry)}
                    disabled={!canUndo || loading}
                    title={entry.undoneAt ? 'Action déjà annulée' : 'Revenir en arrière sur cette action IA'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: entry.undoneAt ? 'var(--color-text-3)' : 'var(--color-primary)', cursor: canUndo && !loading ? 'pointer' : 'default', opacity: canUndo && !loading ? 1 : 0.45, fontSize: 10, fontWeight: 900, flexShrink: 0 }}
                  >
                    <Undo2 size={12} /> {entry.undoneAt ? 'Annulée' : 'Annuler'}
                  </button>
                )}
              </div>
              {entry.details && <div style={{ fontSize: 11, color: 'var(--color-text-2)', whiteSpace: 'pre-wrap', marginTop: 5, lineHeight: 1.35 }}>{entry.details}</div>}
              <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 3 }}>{entry.date}</div>
            </div>
            )
          }) : <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Aucune modification historisée dans cette session.</div>}
        </div>
      ) : (
        <>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length ? messages.map(message => (
              <div key={message.id} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%', padding: '9px 11px', borderRadius: 8, background: message.role === 'user' ? 'var(--color-primary)' : 'var(--color-input-bg)', color: message.role === 'user' ? '#fff' : 'var(--color-text)', fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{message.content}</div>
            )) : <div style={{ margin: 'auto', color: 'var(--color-text-3)', fontSize: 12, textAlign: 'center' }}>Pose une question sur la grille, les lignes, les options ou les incohérences.</div>}
            {loading && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-primary)', fontSize: 12 }}><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Zerux IA réfléchit…</div>}
            <div ref={endRef} />
          </div>
          <div style={{ padding: 10, borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8 }}>
            <textarea ref={inputRef} value={input} onChange={event => setInput?.(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }} placeholder="Dis à Zerux IA quoi vérifier..." rows={1} style={{ flex: 1, resize: 'none', minHeight: 34, maxHeight: 96, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text)', padding: '8px 10px', fontSize: 12, outline: 'none' }} />
            <button type="button" onClick={submit} disabled={loading || !String(input || '').trim()} title="Envoyer" style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: loading || !String(input || '').trim() ? 'default' : 'pointer', opacity: loading || !String(input || '').trim() ? 0.55 : 1 }}><Send size={14} /></button>
          </div>
        </>
      )}
    </aside>
  )
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
  'CR2': ['#164e63','#a5f3fc'], 'CR3': ['#2a4a7f','#a8c8ff'], 'CR4': ['#4a2060','#d8a8ff'],
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
  if (key === 'rc') return upper.match(/\bCR\s*([2-6])\b/)?.[0]?.replace(/\s+/g, '') || null
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

/** Raw perf cell is empty (UI "—", Excel dash, etc.) — must not count as "filled" for +/− compact mode. */
function isUnsetPerfRaw(val) {
  if (val == null) return true
  const s = String(val).trim()
  if (!s) return true
  if (/^[—–‐-−]+$/u.test(s)) return true
  const low = s.toLowerCase()
  if (low === 'null' || low === 'n/a' || low === 'na') return true
  return false
}

/** Excel / JSON peuvent avoir RC=3 (nombre) : les PERF_OPTIONS attendent « CR3 ». */
function coerceExcelPerfRawValue(val, key) {
  if (val == null || (key !== 'rc' && key !== 'pb' && key !== 'cf')) return val
  if (typeof val === 'number' && Number.isFinite(val)) {
    const n = Math.trunc(val)
    if (key === 'rc' && n >= 2 && n <= 6) return `CR${n}`
    if (key === 'pb' && n >= 4 && n <= 7) return `FB${n}`
    if (key === 'cf' && [30, 60, 90, 120].includes(n)) return `EI${n}`
    return val
  }
  if (typeof val === 'string') {
    const s = val.trim()
    if (key === 'rc' && /^[2-6]$/.test(s)) return `CR${s}`
    if (key === 'pb' && /^[4-7]$/.test(s)) return `FB${s}`
  }
  return val
}

function performanceValue(row = {}, resolved = {}, key) {
  const rawIndexByPerf = { rc: 3, pb: 4, cf: 5, blast: 6, belier: 7, prison: 8, acoustic: null }
  const hasManualPerf = row._perfOverrides && Object.keys(row._perfOverrides).length > 0
  if (hasManualPerf) {
    if (key === 'acoustic') return acousticValue(row._raw?.[16]) || null
    if (key === 'blast') return blastValue(row._raw?.[rawIndexByPerf[key]]) || null
    const rawVal = coerceExcelPerfRawValue(row._raw?.[rawIndexByPerf[key]], key)
    if (isUnsetPerfRaw(rawVal)) return null
    return rawVal
  }
  if (Array.isArray(row._raw) && rawIndexByPerf[key] != null && isUnsetPerfRaw(row._raw[rawIndexByPerf[key]])) return null
  if (key === 'acoustic') return row._overrideAcoustic !== undefined ? row._overrideAcoustic : (resolved._acousticValue || inferredPerformanceValue(row, key))
  if (key === 'blast') return resolved._blastValue || blastValue(row._raw?.[rawIndexByPerf[key]]) || inferredPerformanceValue(row, key)
  const rawFallback = coerceExcelPerfRawValue(row._raw?.[rawIndexByPerf[key]], key)
  if (rawIndexByPerf[key] != null && rawFallback != null && isUnsetPerfRaw(rawFallback)) return null
  return rawFallback ?? inferredPerformanceValue(row, key)
}

/**
 * Perf values read only from _raw slots (no inference from designation / resolved row).
 * Used for compact PERFS on all product rows (import + ligne blanche); expanded strip uses full performanceValue().
 */
function performanceValueRawSlotOnly(row, key) {
  const rawIndexByPerf = { rc: 3, pb: 4, cf: 5, blast: 6, belier: 7, prison: 8, acoustic: null }
  if (key === 'acoustic') {
    if (row._overrideAcoustic !== undefined) return row._overrideAcoustic
    return acousticValue(row._raw?.[16]) || null
  }
  if (key === 'blast') return blastValue(row._raw?.[6]) || null
  const idx = rawIndexByPerf[key]
  if (idx == null) return null
  const rawVal = coerceExcelPerfRawValue(row._raw?.[idx], key)
  if (isUnsetPerfRaw(rawVal)) return null
  return rawVal ?? null
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

const stickyRowMarkerStyle = {
  position: 'sticky',
  left: 0,
  zIndex: 3,
  width: 36,
  minWidth: 36,
  background: 'var(--color-surface)',
  boxShadow: '1px 0 0 var(--color-border)',
}

const stickyRowMarkerHeaderStyle = {
  ...stickyRowMarkerStyle,
  zIndex: 5,
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
  const resolved = resolveRow(row)
  return {
    position,
    designation: row.designation || row.type,
    localisation: row.localisation,
    type: row.type,
    gamme: row.gamme,
    vantail: row.vantail,
    haut_mm: row.haut_mm,
    larg_mm: row.larg_mm,
    rc: performanceValue(row, resolved, 'rc'),
    pb: performanceValue(row, resolved, 'pb'),
    cf: performanceValue(row, resolved, 'cf'),
    blast: performanceValue(row, resolved, 'blast'),
    belier: performanceValue(row, resolved, 'belier'),
    prison: performanceValue(row, resolved, 'prison'),
    acoustic: performanceValue(row, resolved, 'acoustic'),
    prix_base_ht: row.prix_base_ht,
    ref_base: row.ref_base,
    prix_total_min_ht: row.prix_total_min_ht,
    options: row.options,
    equip_extra: row.equip_extra,
    serrure: row.serrure,
    ferme_porte: row.ferme_porte,
    equipements_resolus: {
      serrure: resolved._serrureLabel || null,
      garniture_interieure: resolved._garnIntLabel || null,
      garniture_exterieure: resolved._garnExtLabel || null,
      vitrage: resolved._vitrageLabel || null,
      ferme_porte: resolved._fpLabel || null,
      cremone: row._overrideCremone !== undefined ? row._overrideCremone : resolved._cremoneLabel || null,
      autres: row._overrideAutres !== undefined ? row._overrideAutres : resolved._otherExtras?.map(extra => extra.label).filter(Boolean).join(', ') || null,
      acoustique: resolved._acousticValue || null,
    },
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
  return businessVerdicts(row?._ruleCheck?.verdicts || []).filter(v => v.status === 'violation' || v.status === 'warning')
}

function businessVerdicts(verdicts = []) {
  return verdicts.filter(verdict => verdict.source !== 'validation' && verdict.status && verdict.status !== 'na')
}

function technicalVerdicts(verdicts = []) {
  return verdicts.filter(verdict => verdict.source === 'validation' && verdict.status && verdict.status !== 'na')
}

function applicableSourceVerdicts(verdicts = []) {
  return businessVerdicts(verdicts)
}

function verdictSourceLabel(verdict) {
  if (verdict.source === 'validation') return 'Analyse IA'
  const base = verdict.source === 'experience' ? 'Expérience approuvée' : 'Règle active'
  return verdict.category ? `${base} · ${verdict.category}` : base
}

function ruleCheckFromValidationLine(report, lineResult) {
  const verdicts = lineResult?.verdicts || []
  const applicableVerdicts = businessVerdicts(verdicts)
  return {
    checked_at: report?.generated_at || new Date().toISOString(),
    knowledge_version: report?.knowledge_version || report?.knowledge?.version || null,
    knowledge_updated_at: report?.knowledge_updated_at || report?.knowledge?.updated_at || null,
    rules_count: report?.rules_count || report?.knowledge?.rules_count || 0,
    summary: summarizeLineVerdicts(applicableVerdicts),
    verdicts,
    sources: applicableVerdicts.map(verdict => ({
      source: verdict.source || null,
      source_id: verdict.source_id ?? verdict.rule_id ?? null,
      source_label: verdictSourceLabel(verdict),
      title: verdict.rule_title || 'Source IA',
      code: verdict.rule_code || null,
      status: verdict.status,
      reason: verdict.reason || '',
    })),
  }
}

function ruleCheckFromClientError(error, knowledge = null) {
  const reason = error?.error || error?.details || error?.message || 'Analyse IA indisponible pour cette ligne'
  const verdicts = [{
    source: 'validation',
    status: 'warning',
    rule_title: 'Validation IA de la ligne',
    reason,
    fix: 'Relancer la validation IA lorsque le service est disponible.',
  }]
  return {
    checked_at: new Date().toISOString(),
    knowledge_version: knowledge?.version || null,
    knowledge_updated_at: knowledge?.updated_at || null,
    rules_count: knowledge?.rules_count || 0,
    summary: summarizeLineVerdicts([]),
    verdicts,
    sources: [],
  }
}

function buildValidationReport(rows, meta = {}) {
  const lineReports = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => sectionOf(row) === 'products')
    .map(({ row, index }) => {
      const verdicts = row?._ruleCheck?.verdicts || []
      const business = businessVerdicts(verdicts)
      const issues = business.filter(verdict => verdict.status === 'warning' || verdict.status === 'violation')
      const ok = business.filter(verdict => verdict.status === 'ok')
      const technical = technicalVerdicts(verdicts)
      const resolved = resolveRow(row)
      return {
        position: index,
        label: rowLetterLabel(index),
        designation: resolved.type || row.designation || row.type || `Ligne ${index + 1}`,
        gamme: row.gamme || null,
        vantail: row.vantail || null,
        issues,
        ok,
        technical,
        verdicts,
      }
    })
  const summary = { ok: 0, warning: 0, violation: 0, na: 0 }
  const sourceMap = new Map()
  for (const line of lineReports) {
    for (const verdict of businessVerdicts(line.verdicts)) {
      summary[verdict.status] = (summary[verdict.status] || 0) + 1
      const key = verdictKey(verdict) || `${verdict.rule_title}-${verdict.status}`
      const current = sourceMap.get(key) || {
        code: verdict.rule_code || null,
        title: verdict.rule_title || 'Source IA',
        source: verdict.source || 'rule',
        status: verdict.status,
        count: 0,
      }
      current.count += 1
      if (verdict.status === 'violation' || (verdict.status === 'warning' && current.status === 'ok')) current.status = verdict.status
      sourceMap.set(key, current)
    }
  }
  const issueLines = lineReports.filter(line => line.issues.length > 0)
  const technicalLines = lineReports.filter(line => line.technical.length > 0)
  const cleanLines = lineReports.filter(line => !line.issues.length && !line.technical.length)
  return {
    generated_at: meta.generatedAt || new Date().toISOString(),
    mode: meta.mode || 'manual',
    rules_count: meta.rulesCount || meta.knowledge?.rules_count || 0,
    knowledge: meta.knowledge || null,
    knowledge_version: meta.knowledge?.version || null,
    knowledge_updated_at: meta.knowledge?.updated_at || null,
    status: issueLines.length ? 'issues' : (technicalLines.length ? 'technical' : 'validated'),
    total_lines: lineReports.length,
    validated_rows: cleanLines.length,
    issue_rows: issueLines.length,
    technical_rows: technicalLines.length,
    applicable_sources: [...sourceMap.values()].reduce((sum, source) => sum + source.count, 0),
    sources: [...sourceMap.values()].sort((leftSource, rightSource) => (rightSource.status === 'violation') - (leftSource.status === 'violation') || (rightSource.status === 'warning') - (leftSource.status === 'warning') || rightSource.count - leftSource.count),
    summary,
    lines: lineReports,
  }
}

function isRuleCheckStale(check, knowledge) {
  if (!knowledge?.version) return false
  if (!check) return (knowledge.rules_count || 0) > 0
  return String(check.knowledge_version || '') !== String(knowledge.version)
}

function needsRuleCheckUpdate(row, knowledge) {
  if (!row?._ruleCheck) return !knowledge || (knowledge.rules_count || 0) > 0
  return isRuleCheckStale(row._ruleCheck, knowledge)
}

function validationDateLabel(value) {
  if (!value) return 'jamais'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

function verdictKey(verdict) {
  return String(verdict?.rule_id ?? verdict?.rule_code ?? verdict?.rule_title ?? '')
}

function compareRuleVerdicts(previous = [], next = []) {
  const before = new Map(previous.map(verdict => [verdictKey(verdict), verdict]))
  const after = new Map(next.map(verdict => [verdictKey(verdict), verdict]))
  const changes = []
  for (const verdict of next) {
    const key = verdictKey(verdict)
    const old = before.get(key)
    if (!old) {
      if (verdict.status !== 'na') changes.push({ type: 'new', verdict })
      continue
    }
    if (old.status !== verdict.status || (old.reason || '') !== (verdict.reason || '') || (old.fix || '') !== (verdict.fix || '')) {
      changes.push({ type: 'changed', before: old, verdict })
    }
  }
  for (const verdict of previous) {
    const key = verdictKey(verdict)
    if (!after.has(key) && verdict.status !== 'na') changes.push({ type: 'removed', before: verdict })
  }
  return changes
}

function rulePopoverSummary(row, knowledge) {
  if (row?._ruleChecking) return 'Analyse IA en cours...'
  const check = row?._ruleCheck
  const stale = isRuleCheckStale(check, knowledge)
  if (!check) return stale ? 'Aucune analyse IA avec la base R&D actuelle.' : 'Aucune analyse IA enregistrée pour cette ligne.'
  const summary = check.summary || summarizeLineVerdicts(check.verdicts || [])
  const sources = applicableSourceVerdicts(check.verdicts || [])
  const technicalIssues = technicalVerdicts(check.verdicts || [])
  const issues = (summary.violation || 0) + (summary.warning || 0)
  const lines = [
    stale ? 'Analyse IA à mettre à jour.' : 'Analyse IA à jour.',
    `${check.rules_count || 0} règle(s)/expérience(s) disponibles dans la base.`,
    `${sources.length} source(s) applicable(s) à cette ligne.`,
    technicalIssues.length ? 'Analyse technique à relancer.' : (issues ? `${summary.violation || 0} violation(s), ${summary.warning || 0} attention(s).` : 'Aucun blocage détecté.'),
    `Dernière analyse : ${validationDateLabel(check.checked_at)}.`,
  ]
  if (sources.length) lines.push(sources.slice(0, 3).map(verdict => `${verdict.rule_code ? `${verdict.rule_code} · ` : ''}${verdict.rule_title}`).join('\n'))
  return lines.join('\n')
}

function VerifyRulesModal({ row, rowIndex = 0, currentKnowledge = null, onClose, onApplyResult }) {
  const [loading, setLoading] = useState(false)
  const [activeCheck, setActiveCheck] = useState(row?._ruleCheck || null)
  const [lastChanges, setLastChanges] = useState(row?._ruleCheck?._lastChanges || [])
  const [hasRun, setHasRun] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setActiveCheck(row?._ruleCheck || null)
    setLastChanges(row?._ruleCheck?._lastChanges || [])
    setHasRun(false)
    setError('')
  }, [row])

  const runAnalysis = async () => {
    setLoading(true); setError('')
    try {
      const previous = activeCheck
      const lineLike = lineLikeForRuleValidation(row, rowIndex)
      const data = await api.post('/devis/validate-lines', { lines: [lineLike] }, { timeout: 180000 })
      const lineResult = data?.lines?.[0] || { position: rowIndex, verdicts: [] }
      const nextCheck = ruleCheckFromValidationLine(data, lineResult)
      const changes = compareRuleVerdicts(previous?.verdicts || [], nextCheck.verdicts || [])
      nextCheck._lastChanges = changes
      setActiveCheck(nextCheck)
      setLastChanges(changes)
      setHasRun(true)
      onApplyResult?.(rowIndex, nextCheck, data?.knowledge || null)
    } catch (err) {
      setError(err?.error || err?.details || err?.message || 'Erreur analyse')
    } finally {
      setLoading(false)
    }
  }

  const verdicts = activeCheck?.verdicts || []
  const shownVerdicts = businessVerdicts(verdicts)
  const summary = activeCheck?.summary || summarizeLineVerdicts(shownVerdicts)
  const sourceVerdicts = applicableSourceVerdicts(verdicts)
  const technicalIssues = technicalVerdicts(verdicts)
  const stale = isRuleCheckStale(activeCheck, currentKnowledge)
  const linePreview = lineLikeForRuleValidation(row, rowIndex)
  const meta = [
    linePreview.type || row?.type,
    linePreview.gamme,
    linePreview.vantail,
  ].filter(Boolean).join(' · ')
  const perfPreview = ['rc','pb','cf','blast','belier','prison','acoustic']
    .map(key => [PERF_LABELS[key], performanceValue(row, resolveRow(row), key)])
    .filter(([, value]) => value != null)
    .map(([label, value]) => `${label} ${value}`)
    .join(' · ')

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '22px 24px', width: 700, maxWidth: '96vw', maxHeight: '84vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.28)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 14, color: 'var(--color-primary)' }}>
            <ShieldCheck size={15} /> Analyse IA ligne {rowLetterLabel(rowIndex)}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', padding: 4 }}><X size={15} /></button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginBottom: 12, padding: '8px 10px', background: 'var(--color-input-bg)', borderRadius: 6, lineHeight: 1.55 }}>
          <div style={{ fontWeight: 800, color: 'var(--color-text)' }}>{row.designation || row.type || 'Ligne'}</div>
          <div>{meta || 'Type non renseigné'} · {row.haut_mm || '—'}×{row.larg_mm || '—'} mm · {row.prix_base_ht ? `${Number(row.prix_base_ht).toLocaleString('fr-FR')} € HT` : 'prix N/A'}</div>
          {perfPreview && <div>{perfPreview}</div>}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', lineHeight: 1.5 }}>
            <div>Base IA actuelle : {currentKnowledge?.rules_count ?? activeCheck?.rules_count ?? 0} règle(s)/expérience(s).</div>
            <div>Dernière analyse : {validationDateLabel(activeCheck?.checked_at)}.</div>
          </div>
          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 6, border: `1px solid ${stale ? '#dc2626' : 'var(--color-primary)'}`, background: stale ? 'rgba(220,38,38,0.12)' : 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))', color: stale ? '#dc2626' : 'var(--color-primary)', fontSize: 11, fontWeight: 800, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.75 : 1 }}
          >
            {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
            {activeCheck ? 'Relancer l’analyse IA' : 'Lancer l’analyse IA'}
          </button>
        </div>

        {stale && (
          <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 7, background: 'rgba(220,38,38,0.10)', color: '#dc2626', fontSize: 11, fontWeight: 800 }}>
            La base R&D a changé depuis cette analyse. Relancez cette ligne pour voir l’effet des nouvelles règles ou expériences approuvées.
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: 'var(--color-text-2)', fontSize: 13 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Analyse en cours...
          </div>
        )}

        {error && <div style={{ color: '#ef4444', fontSize: 12, padding: '10px 0' }}>{error}</div>}

        {!activeCheck && !loading && !error && (
          <div style={{ fontSize: 12, color: 'var(--color-text-2)', padding: '8px 0 14px' }}>
            Aucune analyse IA disponible pour cette ligne. Lancez l’analyse pour vérifier les règles métier et les validations R&D approuvées.
          </div>
        )}

        {activeCheck && !loading && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {[['ok', '#22c55e'], ['warning', '#f59e0b'], ['violation', '#ef4444']].map(([s, c]) =>
                summary[s] > 0 && (
                  <span key={s} style={{ fontSize: 11, fontWeight: 600, color: c, background: `${c}18`, padding: '3px 10px', borderRadius: 99 }}>
                    {summary[s]} {VERDICT_STYLE[s].label}
                  </span>
                )
              )}
              {activeCheck.rules_count === 0 && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Aucune règle approuvée trouvée.</span>}
            </div>

            {hasRun && (
              <div style={{ marginBottom: 14, padding: '8px 10px', borderRadius: 7, background: lastChanges.length ? 'rgba(245,158,11,0.10)' : 'rgba(34,197,94,0.10)', color: lastChanges.length ? '#b45309' : '#16a34a', fontSize: 11 }}>
                <div style={{ fontWeight: 900, marginBottom: lastChanges.length ? 6 : 0 }}>{lastChanges.length ? 'Changements détectés' : 'Aucun changement détecté'}</div>
                {lastChanges.slice(0, 8).map((change, index) => {
                  const verdict = change.verdict || change.before || {}
                  const label = change.type === 'new' ? 'Nouvelle règle' : change.type === 'removed' ? 'Règle retirée' : 'Résultat modifié'
                  const beforeLabel = change.before ? VERDICT_STYLE[change.before.status]?.label || change.before.status : null
                  const afterLabel = change.verdict ? VERDICT_STYLE[change.verdict.status]?.label || change.verdict.status : null
                  return (
                    <div key={`${label}-${index}`} style={{ color: 'var(--color-text-2)', lineHeight: 1.45 }}>
                      <strong>{label}</strong> — {verdict.rule_code ? `${verdict.rule_code} · ` : ''}{verdict.rule_title || 'Règle'}{beforeLabel && afterLabel ? ` : ${beforeLabel} -> ${afterLabel}` : ''}
                    </div>
                  )
                })}
              </div>
            )}

            {shownVerdicts.length === 0 && activeCheck.rules_count > 0 && (
              <div style={{ fontSize: 12, color: '#22c55e', padding: '8px 0' }}>Aucune règle ou expérience pertinente à signaler pour cette ligne.</div>
            )}

            {technicalIssues.length > 0 && (
              <div style={{ marginBottom: 14, padding: '8px 10px', borderRadius: 7, background: 'rgba(245,158,11,0.10)', color: '#b45309', fontSize: 11, lineHeight: 1.45 }}>
                <strong>Analyse IA à relancer.</strong> {technicalIssues[0].reason || 'La réponse du modèle n’a pas pu être lue correctement.'}
              </div>
            )}

            <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 7, background: 'var(--color-input-bg)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--color-text)' }}>Règles et expériences utilisées pour cette ligne</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-3)', fontWeight: 800 }}>{sourceVerdicts.length}/{activeCheck.rules_count || verdicts.length || 0} applicable(s)</span>
              </div>
              {sourceVerdicts.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
                  Aucune règle ou expérience approuvée ne correspond directement aux valeurs de cette ligne.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sourceVerdicts.map((v, sourceIndex) => {
                    const s = VERDICT_STYLE[v.status] || VERDICT_STYLE.na
                    return (
                      <div key={`source-${v.rule_id || v.rule_code || sourceIndex}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) 1fr auto', gap: 8, alignItems: 'start', fontSize: 11 }}>
                        <span style={{ color: v.source === 'experience' ? '#0f766e' : 'var(--color-primary)', fontWeight: 900 }}>{verdictSourceLabel(v)}</span>
                        <span style={{ color: 'var(--color-text-2)', minWidth: 0 }}>
                          <strong style={{ color: 'var(--color-text)' }}>{v.rule_code ? `${v.rule_code} · ` : ''}{v.rule_title || 'Source IA'}</strong>
                          {v.source_excerpt ? <span style={{ display: 'block', marginTop: 2, color: 'var(--color-text-3)' }}>{v.source_excerpt}</span> : null}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: s.text, background: s.bg, padding: '2px 7px', borderRadius: 99 }}>{s.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

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

function ValidationSummaryModal({ report, onClose, onReviewLine }) {
  if (!report) return null
  const statusMeta = report.status === 'validated'
    ? { label: 'Validé IA', color: '#16a34a', bg: 'rgba(22,163,74,0.12)', border: 'rgba(22,163,74,0.35)', icon: <Check size={16} /> }
    : report.status === 'technical'
      ? { label: 'Analyse IA à relancer', color: '#b45309', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', icon: <AlertTriangle size={16} /> }
      : { label: 'Problème à corriger', color: '#dc2626', bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.35)', icon: <X size={16} /> }
  const issueLines = report.lines.filter(line => line.issues.length > 0)
  const technicalLines = report.lines.filter(line => line.technical.length > 0)
  const okSources = report.sources.filter(source => source.status === 'ok')
  const problematicSources = report.sources.filter(source => source.status === 'warning' || source.status === 'violation')
  const noSourceCount = report.lines.filter(line => !line.issues.length && !line.ok.length && !line.technical.length).length
  const statCell = (label, value, color = 'var(--color-text)') => (
    <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-input-bg)', border: '1px solid var(--color-border)' }}>
      <div style={{ fontSize: 18, fontWeight: 950, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--color-text-3)', fontWeight: 800 }}>{label}</div>
    </div>
  )
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div onClick={event => event.stopPropagation()} style={{ width: 780, maxWidth: '96vw', maxHeight: '88vh', overflowY: 'auto', background: 'var(--color-surface)', borderRadius: 10, border: '1px solid var(--color-border)', boxShadow: '0 16px 50px rgba(0,0,0,0.35)' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <ShieldCheck size={18} color="var(--color-primary)" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 900 }}>Bilan validation IA</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>Contrôle règles + expériences ligne par ligne · {validationDateLabel(report.generated_at)}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-3)', cursor: 'pointer', padding: 4 }}><X size={16} /></button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 8, background: statusMeta.bg, border: `1px solid ${statusMeta.border}`, color: statusMeta.color, fontWeight: 950 }}>
            {statusMeta.icon}
            <span>{statusMeta.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: 'var(--color-text-2)' }}>{report.rules_count || 0} source(s) disponibles dans la base R&D</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
            {statCell('lignes analysées', report.total_lines)}
            {statCell('lignes validées', report.validated_rows, '#16a34a')}
            {statCell('à corriger', report.issue_rows, report.issue_rows ? '#dc2626' : '#16a34a')}
            {statCell('à relancer', report.technical_rows, report.technical_rows ? '#b45309' : '#16a34a')}
            {statCell('sources appliquées', report.applicable_sources)}
          </div>

          {issueLines.length > 0 && (
            <div style={{ border: '1px solid rgba(220,38,38,0.28)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', background: 'rgba(220,38,38,0.10)', color: '#dc2626', fontSize: 11, fontWeight: 950 }}>Lignes à corriger</div>
              {issueLines.slice(0, 12).map(line => (
                <div key={`issue-${line.position}`} style={{ padding: '9px 10px', borderTop: '1px solid var(--color-border)', fontSize: 11 }}>
                  <button type="button" onClick={() => onReviewLine?.(line.position)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-primary)', fontWeight: 900, cursor: 'pointer' }}>Ligne {line.label}</button>
                  <span style={{ marginLeft: 6, fontWeight: 800 }}>{line.designation}</span>
                  {line.issues.map((verdict, issueIndex) => (
                    <div key={`issue-${line.position}-${issueIndex}`} style={{ marginTop: 4, color: 'var(--color-text-2)', lineHeight: 1.45 }}>
                      <strong style={{ color: verdict.status === 'violation' ? '#dc2626' : '#b45309' }}>{verdict.rule_code ? `${verdict.rule_code} · ` : ''}{verdict.rule_title}</strong>
                      {verdict.reason ? ` : ${verdict.reason}` : ''}
                      {verdict.fix ? <span style={{ color: '#dc2626' }}> Correctif : {verdict.fix}</span> : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {problematicSources.length > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-input-bg)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 950, marginBottom: 7 }}>Règles ou expériences relevées</div>
              {problematicSources.slice(0, 10).map(source => (
                <div key={`${source.code || source.title}-${source.status}`} style={{ display: 'flex', gap: 8, justifyContent: 'space-between', fontSize: 11, lineHeight: 1.45 }}>
                  <span>{source.code ? `${source.code} · ` : ''}{source.title}</span>
                  <span style={{ color: source.status === 'violation' ? '#dc2626' : '#b45309', fontWeight: 900 }}>{source.count} ligne(s)</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-input-bg)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 950, marginBottom: 7 }}>Appliqué et conforme</div>
            {okSources.length ? okSources.slice(0, 12).map(source => (
              <div key={`${source.code || source.title}-ok`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, lineHeight: 1.45 }}>
                <span>{source.code ? `${source.code} · ` : ''}{source.title}</span>
                <span style={{ color: '#16a34a', fontWeight: 900 }}>{source.count} ligne(s)</span>
              </div>
            )) : <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Aucune source conforme spécifique remontée par l’IA.</div>}
            {noSourceCount > 0 && <div style={{ marginTop: 7, fontSize: 11, color: '#16a34a', fontWeight: 800 }}>{noSourceCount} ligne(s) sans règle ou expérience spécifique applicable.</div>}
          </div>

          {technicalLines.length > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.28)', fontSize: 11, color: '#b45309' }}>
              <strong>{technicalLines.length} ligne(s) à relancer.</strong> Le modèle n’a pas renvoyé une réponse exploitable sur toutes les lignes.
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 13px', borderRadius: 6, border: 'none', background: statusMeta.color, color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>Fermer le bilan</button>
        </div>
      </div>
    </div>
  )
}

// ─── Composant ligne principale ──────────────────────────────────────────────
function MainRow({ row, index, displayIndex = index, expanded, onToggle, change, tva, multGlobal, editMode, onUpdate, onRecompute, onDelete, onSaveAsRule, onVerifyRules, assistantHighlight = null, validationKnowledge = null, hiddenCols = new Set(), hiddenDimensionCols = new Set() }) {
  const r = resolveRow(row, change, tva, multGlobal)
  const qty = Number.isFinite(r.qty) ? r.qty : 1
  const isAmountSection = sectionOf(row) !== 'products'
  const dimensionHiddenStyle = (key) => hiddenDimensionCols.has(key) ? { display: 'none' } : {}
  const ruleSummary = row._ruleCheck?.summary || null
  const ruleIssues = blockingVerdicts(row)
  const ruleStale = isRuleCheckStale(row._ruleCheck, validationKnowledge)
  // Perf strip expand/collapse lives on the row so it survives remounts (new blank lines).
  const showEmptyPerfs = row._perfStripShowAll === true
  const perfKeys = ['rc', 'pb', 'cf', 'blast', 'belier', 'prison', 'acoustic']
  const rawIndexByPerf = { rc: 3, pb: 4, cf: 5, blast: 6, belier: 7, prison: 8, acoustic: null }
  // Compact = _raw slots only (xlsx / import parity) for every product row; "+" exposes empty slots, "−" folds after expand.
  const perfKeyVisibleInStrip = (k) => {
    if (showEmptyPerfs) return performanceValue(row, r, k)
    return performanceValueRawSlotOnly(row, k)
  }
  const visiblePerfKeys = isAmountSection ? [] : (editMode && !showEmptyPerfs
    ? perfKeys.filter(key => perfKeyVisibleInStrip(key) != null)
    : perfKeys)
  const hiddenPerfCount = perfKeys.length - visiblePerfKeys.length
  const canCollapseEmptyPerfs = editMode && !isAmountSection && showEmptyPerfs
  const assistantActive = Boolean(assistantHighlight)
  const assistantFieldSet = new Set((assistantHighlight?.fieldsByIndex?.[index] || []).map(String))
  const assistantCellStyle = (...fields) => fields.some(field => assistantFieldSet.has(field)) ? ASSISTANT_CELL_HIGHLIGHT_STYLE : {}
  return (
    <tr
      onClick={onToggle}
      style={{
        cursor: 'pointer',
        background: assistantActive
          ? 'linear-gradient(90deg, rgba(34,197,94,0.24), rgba(34,197,94,0.08) 55%, transparent)'
          : expanded ? 'color-mix(in srgb, var(--color-primary) 5%, var(--color-surface))' : undefined,
        boxShadow: assistantActive ? 'inset 4px 0 0 #22c55e, inset 0 1px 0 rgba(34,197,94,0.65), inset 0 -1px 0 rgba(34,197,94,0.45)' : undefined,
        outline: assistantActive ? '1px solid rgba(34,197,94,0.55)' : undefined,
        outlineOffset: -1,
        transition: 'background 0.25s, box-shadow 0.25s, outline 0.25s',
      }}
    >
      {/* # */}
      <Td style={{ ...stickyRowMarkerStyle, color: 'var(--color-text-3)', fontWeight: 700 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {rowLetterLabel(displayIndex)}
          {r._recomputing && <RefreshCw size={9} style={{ animation: 'spin 1s linear infinite' }} />}
        </span>
      </Td>
      {/* Désignation */}
      <Td style={{ minWidth: 160, fontWeight: 600, ...assistantCellStyle('type', 'type_porte', 'designation', 'gamme', 'vantail') }}>
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
      <Td style={{ minWidth: 90, width: 110, padding: 0, ...assistantCellStyle('localisation') }}>
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
      <Td style={{ minWidth: 430, width: 430, fontSize: 10, color: 'var(--color-text-2)', verticalAlign: 'top', ...assistantCellStyle('rc', 'pb', 'cf', 'blast', 'belier', 'prison', 'acoustic') }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'stretch' }}>
          {editMode ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'flex-end', minHeight: 35, width: '100%', overflowX: 'auto' }}>
              {/* +/− first so they stay visible when perf controls wrap to several lines (narrow cell). */}
              {canCollapseEmptyPerfs && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: '0 0 28px' }}>
                  <span style={{ height: 8, lineHeight: 1 }} />
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onUpdate?.({ _perfStripShowAll: false }) }}
                    title="Masquer les performances vides"
                    style={perfActionButtonStyle}
                  >
                    <Minus size={13} strokeWidth={2.5} />
                  </button>
                </div>
              )}
              {!isAmountSection && hiddenPerfCount > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: '0 0 28px' }}>
                  <span style={{ height: 8, lineHeight: 1 }} />
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onUpdate?.({ _perfStripShowAll: true }) }}
                    title={`Afficher ${hiddenPerfCount} performance${hiddenPerfCount > 1 ? 's' : ''} vide${hiddenPerfCount > 1 ? 's' : ''}`}
                    style={perfActionButtonStyle}
                  >
                    <Plus size={13} strokeWidth={2.5} />
                  </button>
                </div>
              )}
              {visiblePerfKeys.map(key => {
                const rawIdx = rawIndexByPerf[key]
                const cur = performanceValue(row, r, key)
                const isSet = cur != null
                const controlWidth = Math.max(PERF_CONTROL_WIDTH[key] || 58, 76)
                return (
                  <div key={key} onClick={e => e.stopPropagation()} style={{ position: 'relative', flex: `0 0 ${controlWidth}px`, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 8, lineHeight: 1, color: 'var(--color-text-3)', fontWeight: 900, textTransform: 'uppercase', textAlign: 'center' }}>{PERF_LABELS[key]}</span>
                    <PrettyCellSelect
                      value={cur ?? ''}
                      options={PERF_OPTIONS[key]}
                      onCommit={value => {
                        const s = value == null ? '' : String(value).trim()
                        const cleared = value == null || value === '' || isUnsetPerfRaw(s)
                        const v = cleared ? null : value
                        if (key === 'acoustic') {
                          // Rebuild _raw[16] with or without the acoustic value so the
                          // server recomputes the price (acoustic treatment is priced server-side).
                          const raw16 = String(row._raw?.[16] ?? '')
                          const stripped = stripAcousticInfo(raw16)
                          const newRaw16 = v ? (stripped ? `${stripped} ${v}` : v) : (stripped || '')
                          onRecompute?.({ _raw_16: newRaw16, _perfOverrides: { ...(row._perfOverrides || {}), [key]: true } })
                        } else {
                          onRecompute?.({ [`_raw_${rawIdx}`]: v, _perfOverrides: { ...(row._perfOverrides || {}), [key]: true } })
                        }
                      }}
                      title={key === 'acoustic' ? 'Acoustique' : key.toUpperCase()}
                      width={controlWidth}
                      active={isSet}
                    />
                  </div>
                )
              })}
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
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ textAlign: 'right', width: 55, padding: 0, ...assistantCellStyle('haut_mm', 'hauteur_mm'), ...dimensionHiddenStyle('haut_ht') }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableNumber value={r.haut_mm} onCommit={v => onRecompute?.({ haut_mm: v })} step={10} min={100} max={9999} width="100%" textAlign="right" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{r.haut_mm ?? '—'}</span>}
      </Td>
      {/* L */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ textAlign: 'right', width: 55, padding: 0, ...assistantCellStyle('larg_mm', 'largeur_mm'), ...dimensionHiddenStyle('larg_ht') }}>
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
      <Td style={{ width: 74, textAlign: 'center', padding: 0, ...assistantCellStyle('thermolaquage') }}>
        {isAmountSection ? <span style={{ fontSize: 9, color: 'var(--color-text-3)' }}>—</span> : editMode ? (
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', padding: '2px 3px' }}>
            {r._thermolaquageRef && <span style={{ fontSize: 8, color: 'var(--color-text-3)', fontWeight: 700 }}>réf.{r._thermolaquageRef}</span>}
            <PrettyCellSelect
              value={r._thermolaquageType || ''}
              options={[{ value: '', label: '—' }, { value: 'RAL', label: 'RAL' }, { value: 'NCS', label: 'NCS' }]}
              onCommit={value => {
                const raw = Array.isArray(row._raw) ? [...row._raw] : new Array(17).fill(null)
                while (raw.length < 17) raw.push(null)
                raw[16] = setThermolaquageInRawValue(raw[16], value || null)
                onRecompute?.({ _raw_override: raw })
              }}
              title="Thermolaquage"
              width={74}
              height={24}
              active={!!r.thermolaquage}
            />
          </div>
        ) : (
          <span title={r._thermolaquageLabel || ''} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1, fontSize: 9, fontWeight: 800, color: r.thermolaquage ? '#b45309' : 'var(--color-text-3)' }}>
            <span>{r._thermolaquageType || '—'}</span>
            {r._thermolaquageRef && <span style={{ fontSize: 8, color: 'var(--color-text-3)' }}>réf.{r._thermolaquageRef}</span>}
          </span>
        )}
      </Td>
      {/* Serrure */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 80, ...assistantCellStyle('serrure') }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableText value={mainEquipLabel(row._raw?.[12] ?? r._serrureLabel ?? '')} onCommit={v => onRecompute?.({ [`_raw_12`]: v })} placeholder="serrure…" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{mainEquipLabel(row._raw?.[12] || r._serrureLabel) || '—'}</span>}
      </Td>
      {/* Garn int */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 70, ...assistantCellStyle('garniture_int') }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableText value={mainEquipLabel(row._raw?.[13] ?? r._garnIntLabel ?? '')} onCommit={v => onRecompute?.({ [`_raw_13`]: v })} placeholder="garn. int…" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{mainEquipLabel(row._raw?.[13] || r._garnIntLabel) || '—'}</span>}
      </Td>
      {/* Garn ext */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 70, ...assistantCellStyle('garniture_ext') }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableText value={mainEquipLabel(row._raw?.[14] ?? r._garnExtLabel ?? '')} onCommit={v => onRecompute?.({ [`_raw_14`]: v })} placeholder="garn. ext…" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{mainEquipLabel(row._raw?.[14] || r._garnExtLabel) || '—'}</span>}
      </Td>
      {/* Vitrage */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 130, ...assistantCellStyle('vitrage', 'notes'), ...(hiddenCols.has('vitrage') ? { display: 'none' } : {}) }}>
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
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 60, ...assistantCellStyle('ferme_porte'), ...(hiddenCols.has('fp') ? { display: 'none' } : {}) }}>
        {editMode
          ? (isAmountSection ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span> : <EditableText value={mainEquipLabel(row._raw?.[15] ?? r._fpLabel ?? '')} onCommit={v => onRecompute?.({ [`_raw_15`]: v })} placeholder="FP…" />)
          : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>{mainEquipLabel(row._raw?.[15] || r._fpLabel) || '—'}</span>}
      </Td>
      {/* Crémone */}
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 110, ...assistantCellStyle('cremone'), ...(hiddenCols.has('cremone') ? { display: 'none' } : {}) }}>
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
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 140, ...assistantCellStyle('autres'), ...(hiddenCols.has('autres') ? { display: 'none' } : {}) }}>
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
      <Td palette={editMode ? 'yellow' : 'normal'} style={{ padding: 0, minWidth: 90, ...assistantCellStyle('acoustic'), ...(hiddenCols.has('acoustic') ? { display: 'none' } : {}) }}>
        {isAmountSection
          ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block' }}>—</span>
          : (r._acousticValue
              ? <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block', fontWeight: 600 }}>
                  {r._acousticValue}{r._acousticRef ? ` · réf.${r._acousticRef}` : ''}
                </span>
              : <span style={{ fontSize: 11, padding: '2px 6px', display: 'inline-block', color: 'var(--color-text-2)' }}>—</span>)}
      </Td>
      {/* PU HT */}
      <Td palette="gray" style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', ...assistantCellStyle('prix_base_ht') }}>
        {editMode && isAmountSection
          ? <EditableNumber value={r.prix_base_ht ?? 0} onCommit={v => onUpdate?.({ prix_base_ht: v, prix_total_min_ht: v, total_ligne_ht: v })} step={10} min={0} max={999999} width="100%" textAlign="right" />
          : (r._pu > 0 ? r._pu.toLocaleString('fr-FR') + ' €' : '—')}
      </Td>
      {/* Remise */}
      <Td palette="yellow" style={{ textAlign: 'center', width: 90, padding: 0, ...assistantCellStyle('multiple') }}>
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
      <Td palette="yellow" style={{ textAlign: 'center', width: 90, padding: 0, ...assistantCellStyle('qty') }}>
        <EditableNumber value={qty} onCommit={v => onUpdate?.({ qty: v })} step={1} min={1} max={9999} width="100%" />
      </Td>
      {/* Total HT */}
      <Td palette="blue" style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', fontSize: 12, minWidth: 116 }}>
        {r._pu > 0 ? r._totalHt.toLocaleString('fr-FR') + ' €' : '—'}
      </Td>
      <Td style={{ width: editMode ? 72 : 32, textAlign: 'center', padding: 0 }}>
        {(editMode || !isAmountSection) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            {!isAmountSection && (
              <>
                <Popover content={rulePopoverSummary(row, validationKnowledge)} maxWidth={260}>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onVerifyRules?.() }}
                    title={ruleStale ? 'Analyse IA à mettre à jour' : 'Voir l’analyse IA de cette ligne'}
                    style={{ width: 22, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: ruleStale ? 'rgba(220,38,38,0.10)' : 'transparent', color: ruleStale ? '#dc2626' : 'var(--color-primary)', cursor: 'pointer', borderRadius: 3 }}
                  >
                    {row._ruleChecking ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={12} />}
                  </button>
                </Popover>
                {editMode && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onSaveAsRule?.() }}
                    title="Enregistrer comme règle R&D"
                    style={{ width: 22, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#0f766e', cursor: 'pointer', borderRadius: 3 }}
                  >
                    <BookOpen size={12} />
                  </button>
                )}
              </>
            )}
            {editMode && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onDelete?.() }}
                title="Supprimer la ligne"
                style={{ width: 22, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#a33c3c', cursor: 'pointer', borderRadius: 3 }}
              >
                <Trash2 size={13} />
              </button>
            )}
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
      <td style={{ ...amountHeaderCellStyle, ...stickyRowMarkerHeaderStyle }}>#</td>
      <td colSpan={6} style={amountHeaderCellStyle}>{isTransport ? 'Poste transport' : 'Libellé calcul'}</td>
      <td colSpan={detailSpan} style={amountHeaderCellStyle}>{isTransport ? 'Destination / note' : 'Détail / condition'}</td>
      <td colSpan={3} style={amountHeaderCellStyle}>{isTransport ? 'Règle' : 'Référence'}</td>
      <td colSpan={2} style={amountHeaderCellStyle}>{isTransport ? 'Tranches' : 'Source'}</td>
      <td style={{ ...amountHeaderCellStyle, ...CELL.gray, textAlign: 'right' }}>PU HT</td>
      <td style={{ ...amountHeaderCellStyle, ...CELL.yellow, textAlign: 'center' }}>Remise</td>
      <td style={{ ...amountHeaderCellStyle, ...CELL.yellow, textAlign: 'center' }}>Q.</td>
      <td style={{ ...amountHeaderCellStyle, ...CELL.blue, textAlign: 'right', minWidth: 116, whiteSpace: 'nowrap' }}>Total HT</td>
      <td style={{ ...amountHeaderCellStyle, width: 32 }}></td>
    </tr>
  )
}

function AmountRow({ row, index, displayIndex = index, change, tva, multGlobal, editMode, defaultTransportAddress = '', onUpdate, onTransportAddressCommit, onDelete, assistantHighlight = null, hiddenDimensionCount = 0 }) {
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
  const assistantActive = Boolean(assistantHighlight)

  return (
    <tr style={{
      background: assistantActive ? 'linear-gradient(90deg, rgba(34,197,94,0.24), rgba(34,197,94,0.08) 55%, transparent)' : 'color-mix(in srgb, var(--color-primary) 2%, transparent)',
      boxShadow: assistantActive ? 'inset 4px 0 0 #22c55e, inset 0 1px 0 rgba(34,197,94,0.65), inset 0 -1px 0 rgba(34,197,94,0.45)' : undefined,
      outline: assistantActive ? '1px solid rgba(34,197,94,0.55)' : undefined,
      outlineOffset: -1,
      transition: 'background 0.25s, box-shadow 0.25s, outline 0.25s',
    }}>
      <Td style={{ ...stickyRowMarkerStyle, color: 'var(--color-text-3)', fontWeight: 700 }}>
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
      <Td palette="blue" style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', fontSize: 12, minWidth: 116 }}>
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
  rc:     [{ value: null, label: '—' }, { value: 'CR2', label: 'CR2' }, { value: 'CR3', label: 'CR3' }, { value: 'CR4', label: 'CR4' }, { value: 'CR5', label: 'CR5' }, { value: 'CR6', label: 'CR6' }],
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

/** New user-added product row ("ligne blanche"): empty at creation, not from xlsx import. */
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
    /** When true, show all perf selectors (+ expanded); persisted on row like xlsx UX. */
    _perfStripShowAll: false,
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

const GRID_INTENT_RAW_SLOTS = {
  rc: 3,
  pb: 4,
  cf: 5,
  blast: 6,
  belier: 7,
  prison: 8,
  serrure: 12,
  garniture_int: 13,
  garniture_ext: 14,
  ferme_porte: 15,
}

const GRID_INTENT_FIELD_LABELS = {
  hauteur_mm: 'hauteur',
  largeur_mm: 'largeur',
  localisation: 'localisation',
  designation: 'désignation',
  type_porte: 'type produit',
  gamme: 'gamme',
  vantail: 'vantail',
  prix_base_ht: 'prix base HT',
  ref_base: 'référence base',
  qty: 'quantité',
  multiple: 'remise/coefficient',
  rc: 'résistance CR/RC',
  pb: 'pare-balles',
  cf: 'coupe-feu',
  blast: 'blast',
  belier: 'anti-bélier',
  prison: 'prison',
  acoustic: 'acoustique',
  serrure: 'serrure',
  garniture_int: 'garniture int.',
  garniture_ext: 'garniture ext.',
  vitrage: 'vitrage/remplissage',
  ferme_porte: 'ferme-porte',
  cremone: 'crémone',
  autres: 'autres équipements',
  thermolaquage: 'thermolaquage',
  notes: 'note',
  options_add: 'option ajoutée',
  options_remove: 'option supprimée',
}

const GRID_INTENT_HIGHLIGHT_FIELDS = {
  hauteur_mm: ['haut_mm', 'hauteur_mm'],
  largeur_mm: ['larg_mm', 'largeur_mm'],
  type_porte: ['type', 'type_porte'],
  designation: ['designation'],
  localisation: ['localisation'],
  gamme: ['gamme'],
  vantail: ['vantail'],
  prix_base_ht: ['prix_base_ht'],
  ref_base: ['ref_base'],
  qty: ['qty'],
  multiple: ['multiple'],
  rc: ['rc'],
  pb: ['pb'],
  cf: ['cf'],
  blast: ['blast'],
  belier: ['belier'],
  prison: ['prison'],
  acoustic: ['acoustic'],
  serrure: ['serrure'],
  garniture_int: ['garniture_int'],
  garniture_ext: ['garniture_ext'],
  vitrage: ['vitrage'],
  ferme_porte: ['ferme_porte'],
  cremone: ['cremone'],
  autres: ['autres'],
  thermolaquage: ['thermolaquage'],
  notes: ['notes'],
  options_add: ['autres'],
  options_remove: ['autres'],
}

function cloneGridRow(row) {
  try { return JSON.parse(JSON.stringify(row)) } catch { return { ...(row || {}) } }
}

function gridIntentHighlightFieldsForKey(key) {
  return GRID_INTENT_HIGHLIGHT_FIELDS[key] || [key]
}

function gridIntentValueLabel(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value == null || value === '') return '—'
  return String(value)
}

function compactGridRowForIntent(row, index) {
  const resolved = resolveRow(row)
  return {
    rowKey: String(row._lineId || row.id || row._clientKey || `row-${index}`),
    id: row._lineId || row.id || null,
    ligne: rowLetterLabel(index),
    line_section: sectionOf(row),
    designation: row.designation || row.type || '',
    type: row.type || row.type_porte || '',
    gamme: row.gamme || '',
    vantail: row.vantail || '',
    haut_mm: row.haut_mm ?? row.hauteur_mm ?? resolved.haut_mm ?? null,
    larg_mm: row.larg_mm ?? row.largeur_mm ?? resolved.larg_mm ?? null,
    localisation: row.localisation || '',
    ref_base: row.ref_base || '',
    rc: performanceValue(row, resolved, 'rc'),
    pb: performanceValue(row, resolved, 'pb'),
    cf: performanceValue(row, resolved, 'cf'),
    blast: performanceValue(row, resolved, 'blast'),
    belier: performanceValue(row, resolved, 'belier'),
    prison: performanceValue(row, resolved, 'prison'),
    acoustic: performanceValue(row, resolved, 'acoustic'),
    serrure: mainEquipLabel(row._raw?.[12] ?? resolved._serrureLabel ?? ''),
    garniture_int: mainEquipLabel(row._raw?.[13] ?? resolved._garnIntLabel ?? ''),
    garniture_ext: mainEquipLabel(row._raw?.[14] ?? resolved._garnExtLabel ?? ''),
    ferme_porte: mainEquipLabel(row._raw?.[15] ?? resolved._fpLabel ?? ''),
    vitrage: stripAcousticInfo(row._raw?.[16]) || mainEquipLabel(resolved._vitrageLabel || ''),
    cremone: row._overrideCremone ?? mainEquipLabel(resolved._cremoneLabel || ''),
    autres: row._overrideAutres ?? resolved._otherExtras?.map(item => mainEquipLabel(item.label)).join(', ') ?? '',
    qty: row.qty ?? 1,
    multiple: row.multiple ?? null,
    prix_base_ht: row.prix_base_ht ?? null,
    options: Array.isArray(row.options) ? row.options : [],
    alertes: Array.isArray(row.alertes) ? row.alertes : [],
    _raw: Array.isArray(row._raw) ? row._raw : [],
  }
}

function normalizeIntentOptionList(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,;|]+/u)
  return list.map(item => String(item || '').trim()).filter(Boolean).slice(0, 12)
}

function buildGridIntentRowPatch(row, patch = {}) {
  const raw = Array.isArray(row._raw) ? [...row._raw] : new Array(17).fill(null)
  while (raw.length < 17) raw.push(null)
  const rowPatch = {}
  const labels = []
  const fieldChanges = []
  let rawChanged = false
  let needsRecompute = false
  let perfOverrides = row._perfOverrides || null

  const setRaw = (index, value, perfKey = null) => {
    raw[index] = value || null
    rawChanged = true
    needsRecompute = true
    if (perfKey) perfOverrides = { ...(perfOverrides || {}), [perfKey]: true }
  }
  const addLabel = (key, value) => {
    labels.push(`${GRID_INTENT_FIELD_LABELS[key] || key} → ${gridIntentValueLabel(value)}`)
    fieldChanges.push({ field: key, fieldLabel: GRID_INTENT_FIELD_LABELS[key] || key, newValue: gridIntentValueLabel(value) })
  }

  for (const [key, value] of Object.entries(patch || {})) {
    if (value == null || value === '') continue
    if (key === 'hauteur_mm') {
      const height = Number(value)
      if (Number.isFinite(height)) {
        rowPatch.haut_mm = height
        rowPatch.hauteur_mm = height
        raw[2] = height
        rawChanged = true
        needsRecompute = true
        addLabel(key, height)
      }
    } else if (key === 'largeur_mm') {
      const width = Number(value)
      if (Number.isFinite(width)) {
        rowPatch.larg_mm = width
        rowPatch.largeur_mm = width
        raw[1] = width
        rawChanged = true
        needsRecompute = true
        addLabel(key, width)
      }
    } else if (key === 'type_porte') {
      rowPatch.type = String(value)
      rowPatch.type_porte = String(value)
      raw[0] = String(value)
      rawChanged = true
      needsRecompute = true
      addLabel(key, value)
    } else if (key === 'localisation' || key === 'designation' || key === 'gamme' || key === 'vantail' || key === 'ref_base' || key === 'notes') {
      rowPatch[key === 'notes' ? 'notes' : key] = String(value)
      if (key === 'notes') rowPatch.alertes = [String(value)]
      addLabel(key, value)
    } else if (key === 'prix_base_ht') {
      const amount = Number(value)
      if (Number.isFinite(amount)) {
        rowPatch.prix_base_ht = amount
        rowPatch.prix_total_min_ht = amount
        rowPatch.total_ligne_ht = amount
        addLabel(key, amount)
      }
    } else if (key === 'qty') {
      const qty = Number(value)
      if (Number.isFinite(qty) && qty > 0) {
        rowPatch.qty = Math.round(qty)
        addLabel(key, rowPatch.qty)
      }
    } else if (key === 'multiple') {
      const multiple = Number(value)
      if (Number.isFinite(multiple)) {
        rowPatch.multiple = multiple
        addLabel(key, multiple)
      }
    } else if (Object.prototype.hasOwnProperty.call(GRID_INTENT_RAW_SLOTS, key)) {
      setRaw(GRID_INTENT_RAW_SLOTS[key], String(value), ['rc', 'pb', 'cf', 'blast', 'belier', 'prison'].includes(key) ? key : null)
      addLabel(key, value)
    } else if (key === 'vitrage') {
      const currentAcoustic = acousticValue(raw[16])
      raw[16] = currentAcoustic ? `${String(value).trim()} ${currentAcoustic}` : String(value).trim()
      rawChanged = true
      needsRecompute = true
      addLabel(key, value)
    } else if (key === 'acoustic') {
      const stripped = stripAcousticInfo(raw[16])
      raw[16] = stripped ? `${stripped} ${value}` : String(value)
      rawChanged = true
      needsRecompute = true
      perfOverrides = { ...(perfOverrides || {}), acoustic: true }
      addLabel(key, value)
    } else if (key === 'thermolaquage') {
      raw[16] = setThermolaquageInRawValue(raw[16], value)
      rawChanged = true
      needsRecompute = true
      addLabel(key, value)
    } else if (key === 'cremone') {
      rowPatch._overrideCremone = String(value)
      addLabel(key, value)
    } else if (key === 'autres') {
      rowPatch._overrideAutres = String(value)
      addLabel(key, value)
    } else if (key === 'options_add') {
      const additions = normalizeIntentOptionList(value)
      if (additions.length) {
        const existing = Array.isArray(row.options) ? row.options : []
        rowPatch.options = [...existing, ...additions.map(label => ({ label, prix: 0, note: 'Ajout Zerux IA' }))]
        addLabel(key, additions)
      }
    } else if (key === 'options_remove') {
      const removals = normalizeIntentOptionList(value).map(item => item.toLowerCase())
      if (removals.length) {
        const existing = Array.isArray(row.options) ? row.options : []
        rowPatch.options = existing.filter(option => !removals.some(removal => equipmentText(option).toLowerCase().includes(removal)))
        addLabel(key, value)
      }
    }
  }

  if (rawChanged) rowPatch._raw = raw
  if (perfOverrides) rowPatch._perfOverrides = perfOverrides
  return { rowPatch, labels, fieldChanges, needsRecompute }
}

async function recomputeIntentRow(row, patch, qty) {
  if (!hasAuthToken() || sectionOf(row) !== 'products') return row
  const raw = Array.isArray(row._raw) ? [...row._raw] : new Array(17).fill(null)
  while (raw.length < 17) raw.push(null)
  const res = await api.post('/devis/recompute-row', { row: raw, qty: Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1 }, { timeout: 30000 })
  if (!res?.result) return row
  return {
    ...row,
    ...res.result,
    ...patch,
    _raw: raw,
    _manualBlank: row._manualBlank,
    _perfStripShowAll: row._perfStripShowAll,
    _perfOverrides: patch._perfOverrides || row._perfOverrides,
    qty: patch.qty ?? row.qty,
    multiple: patch.multiple ?? row.multiple,
    change_override: patch.change_override ?? row.change_override,
    localisation: patch.localisation ?? row.localisation,
  }
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

const prettyCellSelectStyles = ({ width = 64, height = 26, active = false } = {}) => ({
  control: (base, state) => ({
    ...base,
    width,
    minWidth: width,
    minHeight: height,
    height,
    borderRadius: 6,
    border: state.isFocused
      ? '1px solid var(--color-primary)'
      : active ? '1px solid #d97706' : '1px solid var(--color-border)',
    background: active ? '#fbbf24' : 'var(--color-surface)',
    boxShadow: 'none',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 900,
  }),
  valueContainer: (base) => ({ ...base, height, padding: '0 2px 0 7px' }),
  input: (base) => ({ ...base, margin: 0, padding: 0, color: active ? '#111827' : 'var(--color-text)' }),
  singleValue: (base) => ({ ...base, color: active ? '#111827' : 'var(--color-text-2)', fontSize: 10, fontWeight: 900, overflow: 'visible', maxWidth: 'none' }),
  placeholder: (base) => ({ ...base, color: 'var(--color-text-3)', fontSize: 10, fontWeight: 900 }),
  indicatorsContainer: (base) => ({ ...base, height }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base) => ({ ...base, padding: '0 4px 0 1px', color: active ? '#111827' : 'var(--color-text-3)' }),
  clearIndicator: () => ({ display: 'none' }),
  menu: (base) => ({
    ...base,
    width: Math.max(width, 112),
    minWidth: Math.max(width, 112),
    fontSize: 12,
    zIndex: 9999,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
    borderRadius: 8,
    boxShadow: '0 8px 22px rgba(0,0,0,0.22)',
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  option: (base, state) => ({
    ...base,
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.25,
    padding: '8px 10px',
    cursor: 'pointer',
    background: state.isSelected
      ? 'var(--color-primary)'
      : state.isFocused ? 'var(--color-input-bg)' : 'var(--color-surface)',
    color: state.isSelected ? '#fff' : 'var(--color-text)',
    ':active': {
      ...base[':active'],
      background: 'var(--color-primary)',
      color: '#fff',
    },
  }),
})

function PrettyCellSelect({ value, options, onCommit, title, width = 64, height = 26, active = false }) {
  const normalizedOptions = (options || []).map(option => (
    typeof option === 'string' ? { value: option, label: option } : { value: option.value ?? '', label: option.label ?? option.value ?? '—' }
  ))
  const selected = normalizedOptions.find(option => String(option.value ?? '') === String(value ?? ''))
    || (value != null && value !== '' ? { value, label: String(value) } : null)
  return (
    <div title={title} onClick={event => event.stopPropagation()} style={{ width, height }}>
      <Select
        value={selected}
        options={normalizedOptions}
        onChange={(option) => onCommit(option ? option.value : null)}
        getOptionValue={option => String(option.value ?? '')}
        getOptionLabel={option => option.label ?? String(option.value ?? '')}
        isSearchable={false}
        isClearable={false}
        styles={prettyCellSelectStyles({ width, height, active })}
        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        menuPosition="fixed"
      />
    </div>
  )
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
      setParseError(e?.error || e?.details || e?.message || 'Erreur parsing Zerux IA')
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
                Décrivez la ligne en texte libre. Zerux IA va la parser automatiquement.
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

          {/* STEP 1 — Vérification (résultat Zerux IA) */}
          {step === 1 && parsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-2)' }}>
                Voici ce que Zerux IA a compris. Vérifiez et cliquez sur "Calculer le prix".
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
                {parsing ? 'Zerux IA analyse…' : 'Analyser avec Zerux IA'}
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
  devisId = null,
  versionId = null,
  initialRows = null,
  assistantHighlights = null,
  defaultTransportAddress = '',
  startWithBlank = false,
  onRowsChange = null,
  onRowsCommit = null,
  onRowsBulkCommit = null,
  onRowsDelete = null,
  onGridAssistantRowsCommit = null,
  onGridAssistantAction = null,
  showAssistantPanel = !embedded,
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
  const [validationKnowledge, setValidationKnowledge] = useState(null)
  const [validationProgress, setValidationProgress] = useState(null)
  const [lastValidationReport, setLastValidationReport] = useState(null)
  const [validationSummaryModal, setValidationSummaryModal] = useState(null)
  const [refreshingRuleChecks, setRefreshingRuleChecks] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [toast, setToast] = useState(null) // { msg, kind: 'success'|'error', id }
  const toastTimerRef = useRef(null)
  const [assistantMessages, setAssistantMessages] = useState([])
  const [assistantInput, setAssistantInput] = useState('')
  const [assistantLoading, setAssistantLoading] = useState(false)
  const assistantEndRef = useRef(null)
  const assistantInputRef = useRef(null)
  const [quickAssistantHighlights, setQuickAssistantHighlights] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('devisGridAssistantHighlights') || 'null')
      return !embedded && saved && typeof saved === 'object' ? saved : null
    } catch { return null }
  })
  const [gridHistoryEntries, setGridHistoryEntries] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('devisGridActionHistory') || '[]')
      return !embedded && Array.isArray(saved) ? saved.slice(0, 80) : []
    } catch { return [] }
  })
  const recordGridHistory = useCallback((label, details = '', meta = {}) => {
    const entry = {
      id: meta.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label,
      details,
      date: new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      ...meta,
    }
    setGridHistoryEntries(previous => [entry, ...previous].slice(0, 80))
  }, [embedded])
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
  const effectiveAssistantHighlights = assistantHighlights || quickAssistantHighlights
  const assistantHighlightIds = useMemo(() => new Set((effectiveAssistantHighlights?.ids || []).map(String)), [effectiveAssistantHighlights])
  const assistantHighlightIndexes = useMemo(() => new Set(effectiveAssistantHighlights?.indexes || []), [effectiveAssistantHighlights])
  useEffect(() => { try { localStorage.setItem('devisGridChange', String(change)) } catch { /* noop */ } }, [change])
  useEffect(() => { try { localStorage.setItem('devisGridTva', String(tva)) } catch { /* noop */ } }, [tva])
  useEffect(() => { try { localStorage.setItem('devisGridMultGlobal', String(multGlobal)) } catch { /* noop */ } }, [multGlobal])
  useEffect(() => { try { localStorage.setItem('devisGridEditMode', editMode ? '1' : '0') } catch { /* noop */ } }, [editMode])
  const refreshValidationKnowledge = useCallback(async () => {
    if (!hasAuthToken()) return null
    try {
      const knowledge = await api.get('/devis/validation-knowledge')
      setValidationKnowledge(knowledge)
      return knowledge
    } catch {
      return null
    }
  }, [])
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
  // Ref vers les rows courants — permet à recomputeRow de lire sans passer par un updater
  const rowsRef = useRef(rows)
  useEffect(() => { rowsRef.current = rows }, [rows])
  const replaceRows = useCallback((nextRows) => {
    rowsRef.current = nextRows
    setRows(nextRows)
  }, [])
  const initialRowsInitializedRef = useRef(false)
  useEffect(() => {
    if (!Array.isArray(initialRows)) return
    const nextRows = initialRows.length > 0
      ? applyDefaultTransportAddress(normalizeCalculationRows(splitCalculationOptions(initialRows)), defaultTransportAddress)
      : (initialRowsInitializedRef.current ? [] : (startWithBlank ? [createBlankGridRow()] : []))
    initialRowsInitializedRef.current = true
    replaceRows(nextRows)
  }, [defaultTransportAddress, initialRows, replaceRows, startWithBlank])
  useEffect(() => {
    try { localStorage.setItem('devisGridSidebarCollapsed', sidebarCollapsed ? '1' : '0') } catch { /* noop */ }
  }, [sidebarCollapsed])
  useEffect(() => {
    try { localStorage.setItem('devisGridHiddenDimensionCols', JSON.stringify([...hiddenDimensionCols])) } catch { /* noop */ }
  }, [hiddenDimensionCols])
  useEffect(() => {
    refreshValidationKnowledge()
    const onFocus = () => refreshValidationKnowledge()
    const onVisible = () => { if (!document.hidden) refreshValidationKnowledge() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(refreshValidationKnowledge, 60000)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [refreshValidationKnowledge])

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
    replaceRows(nextRows)
    onRowsCommit?.(nextRows[i], i, patch)
    const silentUi = patch && Object.keys(patch).length === 1 && Object.prototype.hasOwnProperty.call(patch, '_perfStripShowAll')
    if (!silentUi) {
      recordGridHistory(`Ligne ${rowLetterLabel(i)} modifiée`)
      showToast('Enregistré', 'success')
    }
  }, [onRowsCommit, recordGridHistory, replaceRows, showToast])

  const addRow = useCallback((newRow) => {
    const nextRows = [...rowsRef.current, newRow]
    replaceRows(nextRows)
    onRowsCommit?.(newRow, nextRows.length - 1, { _created: true })
    if (newRow?.source === 'ia' || newRow?._ia) {
      recordGridHistory(`Ligne ${rowLetterLabel(nextRows.length - 1)} ajoutée par IA`)
      showToast('Ligne IA ajoutée', 'success')
    } else {
      recordGridHistory(`Ligne ${rowLetterLabel(nextRows.length - 1)} ajoutée`)
      showToast('Ligne ajoutée', 'success')
    }
  }, [onRowsCommit, recordGridHistory, replaceRows, showToast])

  const addBlankRow = useCallback(() => {
    const nextRows = [...rowsRef.current, createBlankGridRow()]
    replaceRows(nextRows)
    setEditMode(true)
    setExpandedRows(prev => new Set([...prev, nextRows.length - 1]))
    recordGridHistory(`Ligne ${rowLetterLabel(nextRows.length - 1)} blanche ajoutée`)
    showToast('Ligne blanche ajoutée', 'success')
  }, [recordGridHistory, replaceRows, showToast])

  useEffect(() => {
    if (embedded) return
    try { localStorage.setItem('devisGridActionHistory', JSON.stringify(gridHistoryEntries)) } catch { /* noop */ }
  }, [embedded, gridHistoryEntries])

  useEffect(() => {
    if (embedded) return
    try {
      if (quickAssistantHighlights) localStorage.setItem('devisGridAssistantHighlights', JSON.stringify(quickAssistantHighlights))
      else localStorage.removeItem('devisGridAssistantHighlights')
    } catch { /* noop */ }
  }, [embedded, quickAssistantHighlights])

  useEffect(() => {
    assistantEndRef.current?.scrollIntoView({ block: 'end' })
  }, [assistantMessages, assistantLoading])

  const applyQuickGridIntentEdits = useCallback(async (edits = [], reply = '', prompt = '') => {
    if (!Array.isArray(edits) || !edits.length) return null
    let nextRows = rowsRef.current.map(row => ({ ...row }))
    const applied = []
    for (const edit of edits) {
      const index = Number(edit?.lineIndex)
      if (!Number.isInteger(index) || index < 0 || index >= nextRows.length) continue
      const before = nextRows[index]
      if (!before || sectionOf(before) !== 'products') continue
      const { rowPatch, labels, fieldChanges, needsRecompute } = buildGridIntentRowPatch(before, edit.patch || {})
      if (!Object.keys(rowPatch).length) continue
      let after = { ...before, ...rowPatch }
      if (needsRecompute) {
        try {
          after = await recomputeIntentRow(after, rowPatch, after.qty)
        } catch (err) {
          console.warn('[quick-grid-intent] recompute failed', err)
        }
      }
      nextRows[index] = after
      const highlightFields = [...new Set((fieldChanges || []).flatMap(change => gridIntentHighlightFieldsForKey(change.field)))]
      applied.push({ index, labels, before: cloneGridRow(before), highlightFields })
    }
    if (!applied.length) return null
    const beforeRows = rowsRef.current.map(row => cloneGridRow(row))
    replaceRows(nextRows)
    onRowsChange?.(nextRows)
    if (onGridAssistantRowsCommit) await onGridAssistantRowsCommit(nextRows, { type: 'apply', applied, beforeRows })
    else await onRowsBulkCommit?.(nextRows)
    setExpandedRows(previous => new Set([...previous, ...applied.map(item => item.index)]))
    const historyId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const highlights = {
      id: historyId,
      source: 'quick-grid-intent',
      indexes: applied.map(item => item.index),
      fieldsByIndex: applied.reduce((acc, item) => ({ ...acc, [item.index]: item.highlightFields }), {}),
    }
    setQuickAssistantHighlights(highlights)
    const details = applied
      .map(item => `Ligne ${rowLetterLabel(item.index)} : ${item.labels.join(', ')}`)
      .join('\n')
    recordGridHistory(`Zerux IA : ${applied.length} ligne${applied.length > 1 ? 's' : ''} modifiée${applied.length > 1 ? 's' : ''}`, details, {
      id: historyId,
      source: 'quick-grid-intent',
      undoable: true,
      undoRows: applied.map(item => ({ index: item.index, row: item.before, fields: item.highlightFields })),
      highlights,
    })
    onGridAssistantAction?.({
      id: historyId,
      label: `Zerux IA : ${applied.length} ligne${applied.length > 1 ? 's' : ''} modifiée${applied.length > 1 ? 's' : ''}`,
      prompt: prompt || reply,
      origin: 'ai',
      beforeRows,
      afterRows: nextRows,
      applied,
    })
    showToast(`Zerux IA a modifié ${applied.length} ligne${applied.length > 1 ? 's' : ''}`, 'success')
    return [reply, details].filter(Boolean).join('\n\n')
  }, [onGridAssistantAction, onGridAssistantRowsCommit, onRowsBulkCommit, onRowsChange, recordGridHistory, replaceRows, showToast])

  const undoQuickGridHistoryEntry = useCallback(async (entry) => {
    if (!entry?.undoable || entry.undoneAt || !Array.isArray(entry.undoRows) || !entry.undoRows.length) return
    const restoreItems = entry.undoRows
      .map(item => ({ index: Number(item.index), row: item.row, fields: Array.isArray(item.fields) ? item.fields : [] }))
      .filter(item => Number.isInteger(item.index) && item.index >= 0 && item.index < rowsRef.current.length && item.row)
    if (!restoreItems.length) return
    const restoreMap = new Map(restoreItems.map(item => [item.index, cloneGridRow(item.row)]))
    const nextRows = rowsRef.current.map((row, index) => restoreMap.has(index) ? restoreMap.get(index) : row)
    const beforeRows = rowsRef.current.map(row => cloneGridRow(row))
    replaceRows(nextRows)
    onRowsChange?.(nextRows)
    if (onGridAssistantRowsCommit) await onGridAssistantRowsCommit(nextRows, { type: 'undo', applied: restoreItems, beforeRows })
    else await onRowsBulkCommit?.(nextRows)
    setExpandedRows(previous => new Set([...previous, ...restoreItems.map(item => item.index)]))
    const highlights = {
      id: `${entry.id || Date.now()}-undo`,
      source: 'quick-grid-intent-undo',
      indexes: restoreItems.map(item => item.index),
      fieldsByIndex: restoreItems.reduce((acc, item) => ({ ...acc, [item.index]: item.fields }), {}),
    }
    setQuickAssistantHighlights(highlights)
    const undoneAt = new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    setGridHistoryEntries(previous => previous.map(item => item.id === entry.id ? { ...item, undoneAt } : item))
    onGridAssistantAction?.({
      id: highlights.id,
      label: 'Zerux IA : action annulée',
      prompt: 'Annulation depuis l’historique grille',
      origin: 'ai',
      beforeRows,
      afterRows: nextRows,
      applied: restoreItems,
      undoOf: entry.id,
    })
    showToast('Action IA annulée', 'success')
  }, [onGridAssistantAction, onGridAssistantRowsCommit, onRowsBulkCommit, onRowsChange, replaceRows, showToast])

  const looksLikeGridChangeRequest = useCallback((text) => /\b(modifi|changer|change|mettre|mets|passer|remplacer|ajouter|supprimer|retirer|hauteur|huteur|largeur|quantit[ée]|qte|serrure|garniture|vitrage|ferme.?porte|cr[2-6]|rc[2-6]|fb[4-7]|ei\s*(30|60|90|120)|anti.?feu|coupe.?feu|option|thermolaquage|ral|ncs)\b/i.test(String(text || '')), [])

  const askQuickGridAssistant = useCallback(async (question = assistantInput) => {
    const text = String(question || '').trim()
    if (!text || assistantLoading) return
    const nextUserMessage = { id: `${Date.now()}-user`, role: 'user', content: text }
    setAssistantMessages(previous => [...previous, nextUserMessage])
    setAssistantInput('')
    setAssistantLoading(true)
    try {
      if (rowsRef.current.length) {
        try {
          const intent = await api.post('/devis/grid-intent', {
            question: text,
            rows: rowsRef.current.slice(0, 120).map(compactGridRowForIntent),
          }, { timeout: 120000 })
          if (intent?.ok && Array.isArray(intent.edits) && intent.edits.length) {
            const appliedAnswer = await applyQuickGridIntentEdits(intent.edits, intent.reply || 'Modifications appliquées.', text)
            if (appliedAnswer) {
              setAssistantMessages(previous => [...previous, { id: `${Date.now()}-assistant`, role: 'assistant', content: appliedAnswer }])
              return
            }
          }
          if (looksLikeGridChangeRequest(text) && intent?.reply) {
            setAssistantMessages(previous => [...previous, { id: `${Date.now()}-assistant-clarify`, role: 'assistant', content: intent.reply }])
            return
          }
        } catch (intentErr) {
          console.warn('[quick-grid-intent]', intentErr)
        }
      }
      const data = await api.post('/devis/ask', {
        rows: rowsRef.current,
        question: text,
        scope: 'all',
        history: assistantMessages.slice(-8).map(message => ({ role: message.role, content: message.content })),
        devis_id: devisId,
        version_id: versionId,
      }, { timeout: 120000 })
      setAssistantMessages(previous => [...previous, { id: `${Date.now()}-assistant`, role: 'assistant', content: data?.answer || 'Je n’ai pas reçu de réponse exploitable.' }])
    } catch (err) {
      setAssistantMessages(previous => [...previous, { id: `${Date.now()}-assistant-error`, role: 'assistant', content: `Erreur IA : ${err?.error || err?.message || 'demande impossible'}` }])
    } finally {
      setAssistantLoading(false)
    }
  }, [applyQuickGridIntentEdits, assistantInput, assistantLoading, assistantMessages, devisId, looksLikeGridChangeRequest, versionId])

  const addSectionRow = useCallback((section) => {
    const nextRows = [...rowsRef.current, createAmountRow(section, '', { defaultTransportAddress })]
    replaceRows(nextRows)
    setEditMode(true)
    setExpandedRows(prev => new Set([...prev, nextRows.length - 1]))
    onRowsCommit?.(nextRows[nextRows.length - 1], nextRows.length - 1, { _created: true })
    recordGridHistory(section === 'transport' ? 'Ligne transport ajoutée' : 'Ligne calcul ajoutée')
    showToast(section === 'transport' ? 'Ligne transport ajoutée' : 'Ligne calcul ajoutée', 'success')
  }, [defaultTransportAddress, onRowsCommit, recordGridHistory, replaceRows, showToast])

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
      replaceRows(nextRows)
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
    replaceRows(nextRows)
    onRowsCommit?.(nextRows[i], i, patch)
  }, [onRowsCommit, replaceRows, showToast])

  const deleteRow = useCallback((i) => {
    const row = rowsRef.current[i]
    if (!row) return
    const label = row.type || row.designation || `ligne ${i + 1}`
    setConfirmDialog({
      title: 'Supprimer la ligne',
      message: `Supprimer définitivement la ligne ${i + 1} — ${label} ?`,
      danger: true,
      confirmLabel: 'Supprimer',
      onConfirm: () => {
        const nextRows = rowsRef.current.filter((_, idx) => idx !== i)
        replaceRows(nextRows)
        setExpandedRows(prev => new Set([...prev].filter(idx => idx !== i).map(idx => idx > i ? idx - 1 : idx)))
        onRowsDelete?.(row, i)
        recordGridHistory(`Ligne ${rowLetterLabel(i)} supprimée`)
        showToast('Ligne supprimée', 'success')
      },
    })
  }, [onRowsDelete, recordGridHistory, replaceRows, showToast])

  const recomputeRow = useCallback((i, patch) => {
    // Lire les rows via ref (pas d'updater) pour éviter le double-appel Strict Mode
    const cur = rowsRef.current[i]
    if (!cur) return
    if (sectionOf(cur) !== 'products') {
      updateRow(i, patch)
      return
    }
    if (!hasAuthToken()) {
      showToast('Session expirée : reconnectez-vous pour recalculer', 'error')
      return
    }
    const raw = patch._raw_override
      ? [...patch._raw_override]
      : Array.isArray(cur._raw) ? [...cur._raw] : new Array(17).fill(null)
    while (raw.length < 17) raw.push(null)
    raw[0] = patch.type ?? raw[0] ?? cur.type ?? cur.designation ?? null
    raw[1] = patch.larg_mm ?? raw[1] ?? cur.larg_mm ?? cur.largeur_mm ?? null
    raw[2] = patch.haut_mm ?? raw[2] ?? cur.haut_mm ?? cur.hauteur_mm ?? null
    for (let idx = 3; idx <= 16; idx++) {
      const k = `_raw_${idx}`
      if (Object.prototype.hasOwnProperty.call(patch, k)) raw[idx] = patch[k]
    }
    const { qty, multiple, change_override, _lineId, _dbPosition, _manualBlank, _perfStripShowAll, localisation } = cur
    const perfOverrides = patch._perfOverrides || cur._perfOverrides || null
    // Maj optimiste immédiate
    replaceRows(rowsRef.current.map((r, idx) => idx === i ? {
      ...r,
      ...(patch.type != null ? { type: patch.type } : {}),
      ...(patch.haut_mm != null ? { haut_mm: patch.haut_mm } : {}),
      ...(patch.larg_mm != null ? { larg_mm: patch.larg_mm } : {}),
      ...(perfOverrides ? { _perfOverrides: perfOverrides } : {}),
      _raw: raw,
      _recomputing: true,
    } : r))
    // Appel API — hors de tout updater → jamais dupliqué par Strict Mode
    const qtyInt = Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1
    api.post('/devis/recompute-row', { row: raw, qty: qtyInt }, { timeout: 30000 })
      .then(res => {
        const result = res?.result
        if (!result) return
        const recomputedRow = {
          ...result,
          _raw: raw,
          _lineId,
          _dbPosition,
          _manualBlank,
          _perfStripShowAll,
          localisation,
          qty,
          multiple,
          change_override,
          ...(perfOverrides ? { _perfOverrides: perfOverrides } : {}),
          _recomputing: false,
        }
        replaceRows(rowsRef.current.map((r, idx) => idx === i ? {
          ...recomputedRow,
        } : r))
        onRowsCommit?.(recomputedRow, i, { _recomputed: true })
        showToast('Recalculé et enregistré', 'success')
      })
      .catch(err => {
        console.error('recompute-row error', err)
        replaceRows(rowsRef.current.map((r, idx) => idx === i ? { ...r, _recomputing: false, _recomputeError: String(err?.error || err?.message || err) } : r))
        showToast('Erreur recalcul', 'error')
      })
  }, [onRowsCommit, replaceRows, showToast, updateRow])

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

  const persistValidationReport = useCallback(async (report) => {
    if (!devisId || !versionId || !report?.total_lines) return
    try {
      await api.post(`/devis/${devisId}/rule-checks`, { version_id: versionId, report })
    } catch (err) {
      console.error('rule-check report persist error', err)
    }
  }, [devisId, versionId])

  const validateEntriesProgressively = useCallback(async ({ targetEntries, baseRows, mode = 'manual' }) => {
    if (!targetEntries.length) return { rows: baseRows, report: null }
    let workingRows = baseRows
    let completed = 0
    let latestKnowledge = validationKnowledge
    let rulesCount = validationKnowledge?.rules_count || 0
    const total = targetEntries.length
    setValidationProgress({ active: true, mode, done: 0, total, issueRows: 0, technicalRows: 0 })

    await runClientLimited(targetEntries, VALIDATION_PARALLELISM, async (entry) => {
      let nextCheck = null
      try {
        const report = await api.post('/devis/validate-lines', {
          lines: [lineLikeForRuleValidation(entry.row, entry.index)],
          concurrency: 1,
        }, { timeout: 180000 })
        if (report?.knowledge) {
          latestKnowledge = report.knowledge
          setValidationKnowledge(report.knowledge)
        }
        rulesCount = report?.rules_count || rulesCount
        const lineResult = report?.lines?.[0] || { position: entry.index, verdicts: [] }
        nextCheck = ruleCheckFromValidationLine(report, lineResult)
      } catch (validationError) {
        nextCheck = ruleCheckFromClientError(validationError, latestKnowledge)
      }
      nextCheck._lastChanges = compareRuleVerdicts(entry.row?._ruleCheck?.verdicts || [], nextCheck.verdicts || [])
      workingRows = workingRows.map((currentRow, rowIndex) => rowIndex === entry.index ? { ...currentRow, _ruleChecking: false, _ruleCheck: nextCheck } : currentRow)
      completed += 1
      const partialReport = buildValidationReport(workingRows, { mode, rulesCount, knowledge: latestKnowledge })
      replaceRows(workingRows)
      onRowsChange?.(workingRows)
      setValidationProgress({ active: completed < total, mode, done: completed, total, issueRows: partialReport.issue_rows, technicalRows: partialReport.technical_rows })
    })

    const finalReport = buildValidationReport(workingRows, { mode, rulesCount, knowledge: latestKnowledge })
    setValidationProgress(null)
    setImportValidationSummary({ ...(finalReport.summary || {}), issueRows: finalReport.issue_rows, technicalRows: finalReport.technical_rows, rules_count: finalReport.rules_count || 0 })
    setLastValidationReport(finalReport)
    setValidationSummaryModal(finalReport)
    await persistValidationReport(finalReport)
    return { rows: workingRows, report: finalReport }
  }, [onRowsChange, persistValidationReport, replaceRows, validationKnowledge])

  const handleFile = async (file) => {
    if (!file) return
    setLoading(true)
    setError(null)
    setImportValidationSummary(null)
    setLastValidationReport(null)
    setValidationSummaryModal(null)
    setValidationProgress(null)
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
      replaceRows(sectionedRows)
      onRowsChange?.(sectionedRows)
      await onRowsBulkCommit?.(sectionedRows)
      setFileName(file.name)
      recordGridHistory(`Import XLSX : ${file.name} (${sectionedRows.length} ligne${sectionedRows.length !== 1 ? 's' : ''})`)
      setExpandedRows(new Set())
      const productEntries = sectionedRows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => sectionOf(row) === 'products')
      if (productEntries.length) {
        setValidatingImport(true)
        const indexSet = new Set(productEntries.map(entry => entry.index))
        const checkingRows = sectionedRows.map((row, index) => indexSet.has(index) ? { ...row, _ruleChecking: true, _ruleCheck: null } : row)
        replaceRows(checkingRows)
        onRowsChange?.(checkingRows)
        try {
          const { rows: checkedRows, report } = await validateEntriesProgressively({ targetEntries: productEntries, baseRows: checkingRows, mode: 'import' })
          if (report?.issue_rows) {
            setExpandedRows(new Set(report.lines.filter(line => line.issues.length > 0).map(line => line.position)))
            showToast(`${report.issue_rows} ligne(s) à vérifier après contrôle règles`, 'error')
          } else if (report?.technical_rows) {
            showToast(`${report.technical_rows} ligne(s) à relancer après contrôle IA`, 'error')
          } else {
            showToast('Import contrôlé : règles et expériences OK', 'success')
          }
        } catch (validationError) {
          replaceRows(rowsRef.current.map(row => ({ ...row, _ruleChecking: false })))
          setValidationProgress(null)
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
    setConfirmDialog({
      title: 'Vider le tableau',
      message: `Vider définitivement le tableau (${currentCount} ligne${currentCount > 1 ? 's' : ''}) ?`,
      danger: true,
      confirmLabel: 'Vider',
      onConfirm: async () => {
        const nextRows = []
        setLoading(true)
        setError(null)
        try {
          await onRowsBulkCommit?.(nextRows)
          replaceRows(nextRows)
          setFileName(null)
          setImportValidationSummary(null)
          setLastValidationReport(null)
          setValidationSummaryModal(null)
          setValidationProgress(null)
          setExpandedRows(new Set())
          recordGridHistory('Grille vidée')
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
      },
    })
  }, [fileName, onRowsBulkCommit, onRowsChange, recordGridHistory, replaceRows, showToast])

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
    setVerifyRulesModal({ rowIdx, row })
  }, [])

  const applyRuleCheckResult = useCallback((rowIdx, nextCheck, knowledge = null) => {
    if (knowledge) setValidationKnowledge(knowledge)
    const nextRows = rowsRef.current.map((row, index) => index === rowIdx ? { ...row, _ruleChecking: false, _ruleCheck: nextCheck } : row)
    replaceRows(nextRows)
    onRowsChange?.(nextRows)
    showToast('Analyse IA mise à jour', 'success')
  }, [onRowsChange, replaceRows, showToast])

  const rerunRuleChecksForIndexes = useCallback(async (rowIndexes = null) => {
    const freshKnowledge = await refreshValidationKnowledge()
    const knowledge = freshKnowledge || validationKnowledge
    const currentRows = rowsRef.current
    const targetEntries = currentRows
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => sectionOf(row) === 'products' && (
        Array.isArray(rowIndexes)
          ? rowIndexes.includes(index)
          : needsRuleCheckUpdate(row, knowledge)
      ))
    if (!targetEntries.length) {
      showToast('Aucune ligne IA à mettre à jour', 'success')
      return
    }
    const indexSet = new Set(targetEntries.map(entry => entry.index))
    setRefreshingRuleChecks(true)
    const checkingRows = currentRows.map((row, index) => indexSet.has(index) ? { ...row, _ruleChecking: true } : row)
    replaceRows(checkingRows)
    onRowsChange?.(checkingRows)
    try {
      const { report } = await validateEntriesProgressively({ targetEntries, baseRows: checkingRows, mode: 'manual' })
      if (report?.issue_rows) {
        setExpandedRows(prev => new Set([...prev, ...report.lines.filter(line => line.issues.length > 0).map(line => line.position)]))
        showToast(`${report.issue_rows} ligne(s) à vérifier après analyse IA`, 'error')
      } else if (report?.technical_rows) {
        showToast(`${report.technical_rows} ligne(s) à relancer après analyse IA`, 'error')
      } else {
        showToast('Analyse IA à jour', 'success')
      }
    } catch (validationError) {
      replaceRows(rowsRef.current.map((row, index) => indexSet.has(index) ? { ...row, _ruleChecking: false } : row))
      setValidationProgress(null)
      showToast(validationError?.error || validationError?.details || validationError?.message || 'Mise à jour IA impossible', 'error')
    } finally {
      setRefreshingRuleChecks(false)
    }
  }, [onRowsChange, refreshValidationKnowledge, showToast, validateEntriesProgressively, validationKnowledge])
  const totalPU  = rows.reduce((s, r) => s + (resolveRow(r, change, tva, multGlobal)._pu), 0)
  const totalHT = rows.reduce((s, r) => s + (resolveRow(r, change, tva, multGlobal)._totalHt || 0), 0)

  // Colonnes masquables : calculer lesquelles ont des données sur les lignes produits
  const productRows = rows.filter(r => sectionOf(r) === 'products')
  const productRowEntries = rows.map((row, index) => ({ row, index })).filter(({ row }) => sectionOf(row) === 'products')
  const ruleUpdateEntries = productRowEntries.filter(({ row }) => needsRuleCheckUpdate(row, validationKnowledge))
  const ruleUpdateCount = ruleUpdateEntries.length
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
            type="button"
            onClick={() => navigate('/home')}
            title="Retour à l'accueil"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-2)', padding: 4, display: 'flex' }}
          >
            <ArrowLeft size={16} />
          </button>
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
            onClick={() => navigate('/home')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', padding: 2, display: 'flex' }}
            title="Retour à l'accueil"
          >
              <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => navigate('/home')}
            title="Retour à l'accueil"
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text)', cursor: 'pointer', fontSize: 12, fontWeight: 700, font: 'inherit', textAlign: 'left' }}
          >
            {title}
          </button>
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
            {validationProgress && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, color: 'var(--color-primary)', fontWeight: 900 }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                IA multi-worker {validationProgress.done}/{validationProgress.total}
                <span style={{ width: 82, height: 5, borderRadius: 99, background: 'var(--color-input-bg)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                  <span style={{ display: 'block', height: '100%', width: `${validationProgress.total ? Math.round((validationProgress.done / validationProgress.total) * 100) : 0}%`, background: 'var(--color-primary)' }} />
                </span>
                {(validationProgress.issueRows || validationProgress.technicalRows) ? `${validationProgress.issueRows || 0} à corriger · ${validationProgress.technicalRows || 0} à relancer` : 'contrôle en cours'}
              </span>
            )}
            {validatingImport && !validationProgress && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--color-primary)', fontWeight: 800 }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Contrôle règles ligne par ligne
              </span>
            )}
            {!validatingImport && !validationProgress && importValidationSummary && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: importValidationSummary.issueRows ? '#dc2626' : importValidationSummary.technicalRows ? '#b45309' : '#16a34a', fontWeight: 800 }}>
                <ShieldCheck size={12} /> {importValidationSummary.issueRows ? `${importValidationSummary.issueRows} ligne(s) à corriger` : importValidationSummary.technicalRows ? `${importValidationSummary.technicalRows} ligne(s) à relancer` : 'Validé IA'}
              </span>
            )}
            {lastValidationReport && !validationProgress && (
              <button
                type="button"
                onClick={() => setValidationSummaryModal(lastValidationReport)}
                title="Rouvrir le bilan final des règles et expériences appliquées"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 8px', background: lastValidationReport.status === 'validated' ? 'rgba(22,163,74,0.10)' : lastValidationReport.status === 'technical' ? 'rgba(245,158,11,0.12)' : 'rgba(220,38,38,0.12)', border: `1px solid ${lastValidationReport.status === 'validated' ? '#16a34a' : lastValidationReport.status === 'technical' ? '#b45309' : '#dc2626'}`, borderRadius: 4, cursor: 'pointer', color: lastValidationReport.status === 'validated' ? '#16a34a' : lastValidationReport.status === 'technical' ? '#b45309' : '#dc2626', fontWeight: 900 }}
              >
                <ShieldCheck size={12} /> Bilan IA
              </button>
            )}
            {productRowEntries.length > 0 && (
              <button
                type="button"
                onClick={() => rerunRuleChecksForIndexes(ruleUpdateCount ? ruleUpdateEntries.map(entry => entry.index) : productRowEntries.map(entry => entry.index))}
                disabled={refreshingRuleChecks || validatingImport}
                title={ruleUpdateCount ? 'Relancer les lignes dont l’analyse IA est périmée ou absente' : 'Relancer l’analyse IA sur toutes les lignes produit'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 8px', background: ruleUpdateCount ? 'rgba(220,38,38,0.12)' : 'var(--color-surface)', border: `1px solid ${ruleUpdateCount ? '#dc2626' : 'var(--color-border)'}`, borderRadius: 4, cursor: refreshingRuleChecks || validatingImport ? 'default' : 'pointer', color: ruleUpdateCount ? '#dc2626' : 'var(--color-text-2)', fontWeight: 800, opacity: refreshingRuleChecks || validatingImport ? 0.7 : 1 }}
              >
                {refreshingRuleChecks ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                {ruleUpdateCount ? `Mise à jour IA (${ruleUpdateCount})` : 'Relancer IA'}
              </button>
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
        <div style={{ flex: 1, minHeight: 0, overflowX: 'scroll', overflowY: 'auto', scrollbarGutter: 'stable', paddingBottom: 10 }}>
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
                  <Th style={stickyRowMarkerHeaderStyle}>#</Th>
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
                  <Th style={{ ...CELL.blue, width: 116, minWidth: 116, whiteSpace: 'nowrap' }}>Total HT</Th>
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
                        assistantHighlight={(assistantHighlightIds.has(String(row._lineId)) || assistantHighlightIndexes.has(i)) ? effectiveAssistantHighlights : null}
                        hiddenDimensionCount={hiddenDimensionCols.size}
                      />
                    )
                  }
                  return (
                  <Fragment key={`row-${i}-${entryIndex}`}>
                    <MainRow row={row} index={i} displayIndex={entry.displayIndex} expanded={expandedRows.has(i)} onToggle={() => toggleRow(i)} change={change} tva={tva} multGlobal={multGlobal} editMode={editMode} onUpdate={(patch) => updateRow(i, patch)} onRecompute={(patch) => recomputeRow(i, patch)} onDelete={() => deleteRow(i)} onSaveAsRule={() => handleSaveAsRule(i)} onVerifyRules={() => handleVerifyRules(i)} assistantHighlight={(assistantHighlightIds.has(String(row._lineId)) || assistantHighlightIndexes.has(i)) ? effectiveAssistantHighlights : null} validationKnowledge={validationKnowledge} hiddenCols={hiddenCols} hiddenDimensionCols={hiddenDimensionCols} />
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
                  <td style={{ padding: '8px 8px', fontWeight: 700, fontSize: 12, textAlign: 'right', borderTop: '2px solid var(--color-border)', background: CELL.gray.background, whiteSpace: 'nowrap', minWidth: 116 }}>
                    {totalPU.toLocaleString('fr-FR')} €
                  </td>
                  <td style={{ borderTop: '2px solid var(--color-border)' }}></td>
                  <td style={{ borderTop: '2px solid var(--color-border)' }}></td>
                  <td colSpan={2} style={{ padding: '8px 12px', fontWeight: 800, fontSize: 14, textAlign: 'right', borderTop: '2px solid var(--color-border)', background: CELL.blue.background, whiteSpace: 'nowrap', minWidth: 132 }}>
                    {totalHT.toLocaleString('fr-FR')} €
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div style={{ padding: '4px 16px', borderTop: '1px solid var(--color-border)', fontSize: 9, color: 'var(--color-text-3)', flexShrink: 0 }}>
          Estimatif — tarif NEXUS 2026-01 · Cliquer sur une ligne pour voir les références et les prix détaillés
        </div>
      </div>

      {showAssistantPanel && (
        <QuickGridAssistantPanel
          rows={rows}
          messages={assistantMessages}
          input={assistantInput}
          setInput={setAssistantInput}
          loading={assistantLoading}
          onAsk={askQuickGridAssistant}
          historyEntries={gridHistoryEntries}
          verificationReport={lastValidationReport}
          verificationProgress={validationProgress}
          verificationSummary={importValidationSummary}
          onRunVerification={() => rerunRuleChecksForIndexes(productRowEntries.map(entry => entry.index))}
          onOpenVerificationReport={() => lastValidationReport && setValidationSummaryModal(lastValidationReport)}
          onClearHistory={() => { setGridHistoryEntries([]); setQuickAssistantHighlights(null) }}
          onUndoHistoryEntry={undoQuickGridHistoryEntry}
          endRef={assistantEndRef}
          inputRef={assistantInputRef}
        />
      )}

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
          row={rows[verifyRulesModal.rowIdx] || verifyRulesModal.row}
          rowIndex={verifyRulesModal.rowIdx}
          currentKnowledge={validationKnowledge}
          onClose={() => setVerifyRulesModal(null)}
          onApplyResult={applyRuleCheckResult}
        />
      )}
      {validationSummaryModal && (
        <ValidationSummaryModal
          report={validationSummaryModal}
          onClose={() => setValidationSummaryModal(null)}
          onReviewLine={(rowIndex) => {
            setExpandedRows(prev => new Set([...prev, rowIndex]))
            setValidationSummaryModal(null)
            setVerifyRulesModal({ rowIdx: rowIndex, row: rowsRef.current[rowIndex] })
          }}
        />
      )}

      {confirmDialog && (
        <div onClick={() => setConfirmDialog(null)} style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={event => event.stopPropagation()} style={{ width: 360, maxWidth: '92vw', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', boxShadow: '0 14px 40px rgba(0,0,0,0.28)', padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--color-text)', marginBottom: 8 }}>{confirmDialog.title}</div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-2)', marginBottom: 14 }}>{confirmDialog.message}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setConfirmDialog(null)} style={{ padding: '7px 11px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text-2)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Annuler</button>
              <button type="button" onClick={async () => { const action = confirmDialog.onConfirm; setConfirmDialog(null); await action?.() }} style={{ padding: '7px 11px', borderRadius: 6, border: '1px solid transparent', background: confirmDialog.danger ? '#dc2626' : 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>{confirmDialog.confirmLabel || 'Confirmer'}</button>
            </div>
          </div>
        </div>
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
