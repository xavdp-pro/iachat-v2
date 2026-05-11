/**
 * DevisStepper.jsx — Stepper-based NEXUS quote workflow
 * Stepper-based quote workflow: Client → Versions → Grid → PDF → HubSpot
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileSpreadsheet, Loader2, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, ArrowLeft, ArrowRight,
  AlertTriangle, Bot, Send, X, FileText, Printer, Copy,
  Check, Info, Euro, Shield, Search, Building2,
  Wrench, Package, Sparkles, RefreshCw, Plus,
  MessageCircleReply, Clock, FolderOpen, LayoutGrid,
  Briefcase, User, Hash, ExternalLink, Download, Columns3, Columns2, Columns,
  Pencil, Trash2, BookOpen,
} from 'lucide-react'
import { MarkdownRenderer } from '../components/MarkdownRenderer.jsx'
import api from '../api/index.js'
import { DevisGridWorkspace, resolveRow, computePassageDimensions } from './DevisGrid.jsx'

// ── Palette by gamme ─────────────────────────────────────────────────────────
const GAMME_COLORS = {
  BASE: '#64748b', CR2: '#0891b2', CR3: '#0ea5e9', CR4: '#2563eb', CR5: '#4f46e5',
  CR6: '#7c3aed', EI60: '#d97706', EI120: '#c2410c', FB6: '#dc2626',
  FB7: '#7f1d1d', ANTI: '#374151', PRISON: '#111827',
}
const gammeColor = (g = '') => {
  const upper = String(g ?? '').toUpperCase()
  return GAMME_COLORS[Object.keys(GAMME_COLORS).find(k => upper.includes(k))] ?? '#354346'
}

const SUGGESTIONS = [
  'Vérifier la gamme et les dimensions',
  'Lister toutes les options disponibles',
  'Vérifier la cohérence des équipements',
  'Quelles sont les alertes importantes ?',
  'Génère une ligne de devis formatée',
  'Quel est le délai de pose estimé ?',
]

const prixFmt = (v) => v != null ? `${Number(v).toLocaleString('fr-FR')} €` : null
const CALCULATION_OPTION_RE = /note de calcul|avis de chantier|avis chantier|calcul explosion/i
const FIRE_PERFORMANCE_RE = /\bEI\s*(30|60|90|120)\b/i
const HEIGHT_AVIS_CHANTIER_RE = /hauteur\s+\d+\s*mm\s+d[ée]passe\s+le\s+max\s+catalogue.*avis\s+de\s+chantier/i

function rowHasFirePerformance(row) {
  return FIRE_PERFORMANCE_RE.test([
    row?.cf,
    row?.coupe_feu,
    row?.feu,
    row?._raw?.[5],
    row?.designation,
    ...(row?.options || []).map(option => JSON.stringify(option)),
  ].filter(Boolean).join(' '))
}

function sanitizeCalculationAlerts(row) {
  const section = row?.line_section || 'products'
  if (!row || section !== 'products' || rowHasFirePerformance(row)) return row
  const alertes = (row.alertes || []).filter(alert => !HEIGHT_AVIS_CHANTIER_RE.test(String(alert || '')))
  return alertes.length === (row.alertes || []).length ? row : { ...row, alertes }
}

function companyDeliveryAddress(company) {
  const properties = company?.properties || company || {}
  return [
    properties.address,
    properties.address2,
    [properties.zip, properties.city].filter(Boolean).join(' '),
    properties.state,
    properties.country,
  ].filter(Boolean).join(', ')
}

function repLetter(index) {
  if (index < 26) return String.fromCharCode(65 + index)
  return String(index + 1)
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try { return JSON.parse(value) || [] } catch { return [] }
}

function dbLineToGridRow(line) {
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
    _raw: line.raw_json ? parseJsonArray(line.raw_json) : undefined,
    qty: line.qty != null ? Number(line.qty) : 1,
    total_ligne_ht: line.total_ligne_ht != null ? Number(line.total_ligne_ht) : null,
  }
  return { ...row, ...computePassageDimensions(row) }
}

function gridRowToLinePayload(row, position) {
  const resolved = typeof resolveRow === 'function' ? resolveRow(row) : row
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
    options_json: row.options || [],
    serrure_ref: row.serrure?.ref || row._serrureLabel || null,
    serrure_prix: row.serrure?.prix ?? null,
    ferme_porte_ref: row.ferme_porte?.ref || row._fpLabel || null,
    ferme_porte_prix: row.ferme_porte?.prix ?? null,
    equipements_json: row.equip_extra || [],
    total_ligne_ht: lineTotal,
    alertes_json: row.alertes || [],
    docs_json: row.docs || [],
  }
}

function compactLineForAI(line, index) {
  const options = parseJsonArray(line.options_json)
    .slice(0, 8)
    .map(option => typeof option === 'string'
      ? option
      : (option?.label || option?.designation || option?.name || option?.ref || null))
    .filter(Boolean)
  return {
    ligne: repLetter(index),
    localisation: line.localisation || null,
    gamme: line.gamme || null,
    vantail: line.vantail || null,
    type: line.type_porte || line.designation || null,
    designation: line.designation || null,
    dimensions: [line.hauteur_mm, line.largeur_mm].filter(value => value != null).join('x') || null,
    prix_ht: line.total_ligne_ht ?? line.prix_total_min_ht ?? line.prix_base_ht ?? null,
    ref_base: line.ref_base || null,
    options,
    alertes: parseJsonArray(line.alertes_json).slice(0, 5),
    docs: parseJsonArray(line.docs_json).slice(0, 10),
  }
}

function parsePerformanceChangeCommand(value) {
  const text = String(value || '')
  const token = '(C\\s*R|R\\s*C)\\s*([2-6])'
  const connector = '(?:en|e\\s*n|vers|par|a|à|->|=>)'
  const match = text.match(new RegExp(`${token}[\\s,;:._-]*(?:${connector})[\\s,;:._-]*${token}`, 'i'))
  if (!match) return null
  const fromPrefix = String(match[1] || '').replace(/\s+/g, '').toUpperCase()
  const toPrefix = String(match[3] || '').replace(/\s+/g, '').toUpperCase()
  const fromLevel = Number(match[2])
  const toLevel = Number(match[4])
  if (!['CR', 'RC'].includes(fromPrefix) || !['CR', 'RC'].includes(toPrefix)) return null
  if (!Number.isFinite(fromLevel) || !Number.isFinite(toLevel) || fromLevel === toLevel) return null
  return { fromPrefix, toPrefix, fromLevel, toLevel, fromToken: `${fromPrefix}${fromLevel}`, toToken: `${toPrefix}${toLevel}` }
}

function performanceLevelPattern(level) {
  return new RegExp(`\\b(?:C\\s*R|R\\s*C)\\s*${level}\\b`, 'gi')
}

function replacePerformanceText(value, fromLevel, toLevel) {
  if (typeof value !== 'string' || !value) return value
  return value.replace(performanceLevelPattern(fromLevel), (match) => {
    const compact = match.replace(/\s+/g, '').toUpperCase()
    const prefix = compact.startsWith('RC') ? 'RC' : 'CR'
    return `${prefix}${toLevel}`
  })
}

function replacePerformanceInValue(value, fromLevel, toLevel) {
  if (typeof value === 'string') return replacePerformanceText(value, fromLevel, toLevel)
  if (Array.isArray(value)) return value.map(item => replacePerformanceInValue(item, fromLevel, toLevel))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePerformanceInValue(item, fromLevel, toLevel)]))
  }
  return value
}

function lineContainsPerformance(line, level) {
  const text = [
    line?.gamme,
    line?.type_porte,
    line?.designation,
    line?.ref_base,
    line?.options_json,
    line?.equipements_json,
    line?.alertes_json,
    line?.docs_json,
  ].filter(Boolean).map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' ')
  return performanceLevelPattern(level).test(text)
}

function applyPerformanceChangeToLine(line, command) {
  const alertes = parseJsonArray(line.alertes_json)
  const pricingNote = command.toLevel < command.fromLevel
    ? `Performance demandée ${command.toToken} : chiffrage conservé sur base ${command.fromToken} selon règle métier de surclassement.`
    : null
  return {
    ...line,
    gamme: replacePerformanceText(line.gamme || '', command.fromLevel, command.toLevel),
    type_porte: replacePerformanceText(line.type_porte || '', command.fromLevel, command.toLevel),
    designation: replacePerformanceText(line.designation || '', command.fromLevel, command.toLevel),
    ref_base: replacePerformanceText(line.ref_base || '', command.fromLevel, command.toLevel) || line.ref_base,
    options_json: replacePerformanceInValue(parseJsonArray(line.options_json), command.fromLevel, command.toLevel),
    equipements_json: replacePerformanceInValue(parseJsonArray(line.equipements_json), command.fromLevel, command.toLevel),
    alertes_json: pricingNote && !alertes.includes(pricingNote) ? [...alertes, pricingNote] : alertes,
    docs_json: parseJsonArray(line.docs_json),
  }
}

function parseGemmaImages(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
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
    if (row.line_section && row.line_section !== 'products') {
      nextRows.push(row)
      continue
    }
    const options = Array.isArray(row.options) ? row.options : []
    const calcOptions = options.filter(option => CALCULATION_OPTION_RE.test(option?.label || ''))
    if (!calcOptions.length) {
      nextRows.push({ ...row, line_section: 'products' })
      continue
    }
    const calcTotal = calcOptions.reduce((sum, option) => sum + registerCalcOption(option), 0)
    const productOptions = options.filter(option => !CALCULATION_OPTION_RE.test(option?.label || ''))
    const productTotal = row.prix_total_min_ht != null ? Math.max(0, Number(row.prix_total_min_ht) - calcTotal) : row.prix_total_min_ht
    nextRows.push({ ...row, line_section: 'products', options: productOptions, prix_total_min_ht: productTotal, total_ligne_ht: productTotal })
  }
  for (const bucket of buckets.values()) {
    if (!(Number(bucket.amount) > 0)) continue
    const notes = [...bucket.notes]
    nextRows.push({
      line_section: 'calculations',
      type: bucket.label,
      designation: bucket.label,
      prix_base_ht: Number(bucket.amount) || 0,
      prix_total_min_ht: Number(bucket.amount) || 0,
      total_ligne_ht: Number(bucket.amount) || 0,
      options: [],
      equip_extra: [],
      alertes: notes,
      notes: notes.join(' — ') || '',
      _generatedFrom: notes.length > 1 ? `${notes.length} lignes produits` : '1 ligne produit',
    })
  }
  return normalizeCalculationRows(nextRows)
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
    const section = row.line_section || 'products'
    const text = `${row.designation || ''} ${row.type || ''} ${(row.alertes || []).join(' ')}`
    if (section === 'products') {
      const cleanRow = sanitizeCalculationAlerts(row)
      nextRows.push(cleanRow)
      for (const alert of cleanRow.alertes || []) {
        if (/avis de chantier|avis chantier/i.test(alert)) addBucket('avis_chantier', 'Avis de chantier', 3700, alert)
        if (/note de calcul|calcul explosion|hors zone bleue/i.test(alert) && !/non requise|NON requise/i.test(alert)) addBucket('note_calcul_explosion', 'Note de calcul explosion (non remisable)', 9300, alert)
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
      line_section: 'calculations',
      type: bucket.label,
      designation: bucket.label,
      prix_base_ht: bucket.amount,
      prix_total_min_ht: bucket.amount,
      total_ligne_ht: bucket.amount,
      options: [],
      equip_extra: [],
      alertes: notes,
      notes: notes.join(' — '),
      _generatedFrom: notes.length > 1 ? `${notes.length} lignes produits` : '1 ligne produit',
    })
  }
  return nextRows
}

const STEP_LABELS = [
  { num: 1, label: 'Client', icon: Building2 },
  { num: 2, label: 'Versions', icon: FolderOpen },
  { num: 3, label: 'Grid devis', icon: LayoutGrid },
  { num: 4, label: 'Préparer PDF', icon: Download },
  { num: 5, label: 'HubSpot', icon: Send },
]

// ── Style helpers ────────────────────────────────────────────────────────────
function iconBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 5, borderRadius: '6px', border: 'none',
    background: 'transparent', color: 'var(--color-text-2)',
    cursor: 'pointer', transition: 'color 0.1s',
  }
}
function ghostBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'transparent', color: 'var(--color-text-2)',
    fontSize: '11px', fontWeight: 600, cursor: 'pointer',
  }
}

function StepperAssistantPanel({
  step,
  currentDevis,
  selectedCompany,
  selectedDeal,
  lines = [],
  messages,
  input,
  setInput,
  loading,
  historyLoading,
  onAsk,
  onEditMessage,
  onClearMessages,
  inputRef,
  endRef,
}) {
  const [editingId, setEditingId] = useState(null)
  const [editingContent, setEditingContent] = useState('')
  const [draft, setDraft] = useState(input || '')
  const [pastedImages, setPastedImages] = useState([])
  const attachmentInputRef = useRef(null)
  const assistantMinWidth = () => 260
  const assistantDefaultWidth = () => 420
  const assistantMaxWidth = () => Math.max(560, typeof window !== 'undefined' ? Math.floor(window.innerWidth * 0.62) : 720)
  const clampAssistantWidth = (value) => Math.min(assistantMaxWidth(), Math.max(assistantMinWidth(), value))
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('devis_stepper_assistant_collapsed') === '1' } catch { return false }
  })
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('devis_stepper_assistant_width'))
      const initial = Number.isFinite(saved) && saved > assistantMinWidth() ? saved : assistantDefaultWidth()
      return clampAssistantWidth(initial)
    } catch { return clampAssistantWidth(assistantDefaultWidth()) }
  })
  const activeStep = STEP_LABELS.find(item => item.num === step)
  const submit = (value = draft) => {
    const text = String(value || '').trim()
    if ((!text && pastedImages.length === 0) || loading) return
    onAsk?.(text, pastedImages)
    setDraft('')
    setPastedImages([])
    requestAnimationFrame(() => {
      if (inputRef?.current) inputRef.current.style.height = '36px'
    })
  }

  const copyMessage = async (content) => {
    try { await navigator.clipboard.writeText(content || '') } catch { /* noop */ }
  }

  const startEditMessage = (message) => {
    setEditingId(message.id)
    setEditingContent(message.content || '')
  }

  const saveEditMessage = async () => {
    if (!editingId || !editingContent.trim()) return
    await onEditMessage?.(editingId, editingContent.trim())
    setEditingId(null)
    setEditingContent('')
  }

  const resizeDraft = () => {
    const el = inputRef?.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = 20 * 5 + 18
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }

  const handleDraftChange = (event) => {
    setDraft(event.target.value)
    requestAnimationFrame(resizeDraft)
  }

  const handleDraftPaste = (event) => {
    const files = Array.from(event.clipboardData?.files || []).filter(file => file.type?.startsWith('image/') || file.type === 'application/pdf')
    if (!files.length) return
    event.preventDefault()
    addAttachmentFiles(files)
  }

  const addAttachmentFiles = (files) => {
    Array.from(files || [])
      .filter(file => file.type?.startsWith('image/') || file.type === 'application/pdf')
      .slice(0, 6)
      .forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => setPastedImages(prev => [...prev, {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name || (file.type === 'application/pdf' ? 'document.pdf' : 'image collee'),
        type: file.type || 'application/octet-stream',
        dataUrl: String(reader.result || ''),
      }])
      reader.readAsDataURL(file)
    })
  }

  useEffect(() => {
    try { localStorage.setItem('devis_stepper_assistant_collapsed', collapsed ? '1' : '0') } catch { /* noop */ }
  }, [collapsed])

  useEffect(() => {
    try { localStorage.setItem('devis_stepper_assistant_width', String(panelWidth)) } catch { /* noop */ }
  }, [panelWidth])

  useEffect(() => { resizeDraft() }, [draft])

  useEffect(() => {
    const onResize = () => setPanelWidth(width => clampAssistantWidth(width || assistantDefaultWidth()))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const startResize = (event) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = panelWidth
    const onMove = (moveEvent) => {
      const nextWidth = clampAssistantWidth(startWidth - (moveEvent.clientX - startX))
      setPanelWidth(nextWidth)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (collapsed) {
    return (
      <aside style={{ width: 44, minWidth: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <button type="button" onClick={() => setCollapsed(false)} title="Ouvrir Gemma 4" style={{ marginTop: 10, width: 30, height: 30, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Bot size={15} />
        </button>
        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', marginTop: 12, fontSize: 11, fontWeight: 800, color: 'var(--color-text-3)', letterSpacing: '0.02em' }}>Gemma 4</div>
      </aside>
    )
  }

  return (
    <aside style={{ width: panelWidth, minWidth: panelWidth, maxWidth: panelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', position: 'relative' }}>
      <div
        role="separator"
        aria-label="Redimensionner Gemma 4"
        onMouseDown={startResize}
        title="Glisser pour agrandir ou réduire Gemma 4"
        style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 2 }}
      />
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Bot size={16} color="var(--color-primary)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Gemma 4</div>
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeStep?.label || `Étape ${step}`} · {currentDevis?.title || currentDevis?.name || 'devis NEXUS'}
          </div>
        </div>
        <button type="button" onClick={onClearMessages} title="Vider le chat" style={{ ...iconBtn(), border: '1px solid var(--color-border)', color: '#dc2626' }}>
          <Trash2 size={13} />
        </button>
        <button type="button" onClick={() => setPanelWidth(clampAssistantWidth(assistantDefaultWidth()))} title="Largeur par défaut" style={{ ...iconBtn(), border: '1px solid var(--color-border)' }}>
          <Columns2 size={13} />
        </button>
        <button type="button" onClick={() => setCollapsed(true)} title="Rétracter Gemma 4" style={{ ...iconBtn(), border: '1px solid var(--color-border)' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
        {historyLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-3)', fontSize: 12, padding: '6px 2px' }}>
            <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Chargement des dernières conversations…
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index} style={{ marginBottom: 10, display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '94%', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start', gap: 3, marginBottom: 3 }}>
                <button type="button" onClick={() => copyMessage(message.content)} title="Copier ce message" style={{ ...iconBtn(), padding: 3, color: 'var(--color-text-3)' }}>
                  <Copy size={11} />
                </button>
                {message.role === 'user' && message.id && (
                  <button type="button" onClick={() => startEditMessage(message)} title="Modifier ce message" style={{ ...iconBtn(), padding: 3, color: 'var(--color-text-3)' }}>
                    <Pencil size={11} />
                  </button>
                )}
              </div>
              <div style={{ padding: '8px 10px', borderRadius: 10, background: message.role === 'user' ? 'var(--color-primary)' : 'var(--color-input-bg)', color: message.role === 'user' ? '#fff' : 'var(--color-text)', fontSize: 12, lineHeight: 1.5 }}>
                {parseGemmaImages(message.images_json).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
                    {parseGemmaImages(message.images_json).map((image, imageIndex) => {
                      const src = image.dataUrl || image.data_url
                      const isImage = String(image.type || '').startsWith('image/') || /^data:image\//i.test(src || '')
                      return isImage ? (
                        <img key={`${message.id || index}-${imageIndex}`} src={src} alt={image.name || 'image'} style={{ width: 74, height: 74, borderRadius: 7, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.28)', background: 'var(--color-surface)' }} />
                      ) : (
                        <div key={`${message.id || index}-${imageIndex}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 170, padding: '5px 7px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.12)', fontSize: 10, fontWeight: 800 }}>
                          <FileText size={12} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{image.name || 'document'}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {editingId === message.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea
                      value={editingContent}
                      onChange={(event) => setEditingContent(event.target.value)}
                      rows={4}
                      style={{ width: '100%', resize: 'vertical', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 12, padding: 8, outline: 'none' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <button type="button" onClick={() => setEditingId(null)} style={{ ...ghostBtn(), background: 'var(--color-surface)', color: 'var(--color-text-2)' }}><X size={12} /> Annuler</button>
                      <button type="button" onClick={saveEditMessage} style={{ ...ghostBtn(), background: 'var(--color-surface)', color: 'var(--color-primary)' }}><Check size={12} /> Sauver</button>
                    </div>
                  </div>
                ) : message.role === 'assistant' ? <MarkdownRenderer content={message.content} /> : message.content}
                {message.edited_at && <div style={{ marginTop: 4, fontSize: 9, opacity: 0.72 }}>modifié</div>}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-3)', fontSize: 12 }}>
            <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Gemma 4 travaille…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ padding: 10, borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
        {pastedImages.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pastedImages.map(image => {
              const isImage = String(image.type || '').startsWith('image/')
              return <div key={image.id} style={{ position: 'relative', width: isImage ? 46 : 112, height: 46, borderRadius: 7, overflow: 'hidden', border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isImage ? <img src={image.dataUrl} alt={image.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, padding: '0 8px', fontSize: 10, fontWeight: 800, color: 'var(--color-text-2)' }}>
                    <FileText size={14} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{image.name}</span>
                  </div>
                )}
                <button type="button" onClick={() => setPastedImages(prev => prev.filter(item => item.id !== image.id))} title="Retirer l'image" style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: 999, border: 'none', background: 'rgba(15,23,42,0.82)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}>
                  <X size={10} />
                </button>
              </div>
            })}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <input
            ref={attachmentInputRef}
            type="file"
            accept="application/pdf,image/*"
            multiple
            onChange={(event) => {
              addAttachmentFiles(event.target.files)
              event.target.value = ''
            }}
            style={{ display: 'none' }}
          />
          <button type="button" onClick={() => attachmentInputRef.current?.click()} disabled={loading} title="Ajouter une pièce jointe" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: loading ? 0.45 : 1 }}>
            <Upload size={14} />
          </button>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={handleDraftChange}
            onPaste={handleDraftPaste}
            onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && (event.preventDefault(), submit())}
            placeholder="Dis à Gemma 4 quoi modifier…"
            disabled={loading}
            rows={1}
            style={{ flex: 1, minWidth: 0, height: 36, maxHeight: 118, resize: 'none', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text)', fontSize: 12, lineHeight: '20px', outline: 'none', fontFamily: 'var(--font-body)' }}
          />
          <button type="button" onClick={() => submit()} disabled={(!draft.trim() && pastedImages.length === 0) || loading} style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: ((!draft.trim() && pastedImages.length === 0) || loading) ? 0.45 : 1 }}>
            <Send size={14} />
          </button>
        </div>
        {pastedImages.length > 0 && <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>{pastedImages.length} pièce{pastedImages.length > 1 ? 's' : ''} jointe{pastedImages.length > 1 ? 's' : ''}</div>}
      </div>
    </aside>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── COMPACT HEADER ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function CompactDevisHeader({
  step,
  maxReached,
  onStep,
  selectedCompany,
  selectedDeal,
  currentDevis,
  currentVersionId,
  onOpenExperiences,
  onOpenRules,
  onBackToChat,
}) {
  const [infoOpen, setInfoOpen] = useState(false)
  const infoPopoverRef = useRef(null)
  const actionStyle = {
    width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)',
    color: 'var(--color-text-2)', cursor: 'pointer', flexShrink: 0,
  }
  const activeStep = STEP_LABELS.find(item => item.num === step)
  const infoRows = [
    { label: 'Client', value: selectedCompany?.name || 'Non sélectionné', meta: selectedCompany?.id ? `ID ${selectedCompany.id}` : null, icon: Building2 },
    { label: 'Projet / deal', value: selectedDeal?.name || 'Non sélectionné', meta: selectedDeal?.id ? `ID ${selectedDeal.id}` : null, icon: Briefcase },
    { label: 'Devis', value: currentDevis?.name || 'Aucun devis ouvert', meta: currentDevis?.status ? `Statut ${currentDevis.status}` : null, icon: FileText },
    { label: 'Version', value: currentVersionId ? `Version #${currentVersionId}` : 'Aucune version active', meta: null, icon: FolderOpen },
    { label: 'Étape', value: activeStep?.label || `Étape ${step}`, meta: `${step} / ${STEP_LABELS.length}`, icon: activeStep?.icon || LayoutGrid },
  ]

  useEffect(() => {
    if (!infoOpen) return undefined
    const handleOutsideClick = (event) => {
      if (!infoPopoverRef.current?.contains(event.target)) setInfoOpen(false)
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [infoOpen])

  return (
    <header style={{
      position: 'relative',
      flexShrink: 0,
      minHeight: 58,
      display: 'grid',
      gridTemplateColumns: 'minmax(170px, 0.75fr) minmax(520px, 1.35fr) minmax(120px, 0.75fr)',
      alignItems: 'center',
      gap: 10,
      padding: '8px 14px',
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
      overflow: 'visible',
    }}>
      <div ref={infoPopoverRef} style={{ position: 'relative', minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setInfoOpen(value => !value)}
          aria-expanded={infoOpen}
          aria-label="Informations du devis"
          title="Informations du devis"
          style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, maxWidth: '100%', padding: 0, border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left' }}
        >
          <div style={{ width: 34, height: 34, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary)', color: '#fff', flexShrink: 0 }}>
            <FileSpreadsheet size={17} strokeWidth={2} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.15, whiteSpace: 'nowrap' }}>Devis NEXUS</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Informations du devis
            </div>
          </div>
        </button>
        {infoOpen && (
          <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 80, width: 360, maxWidth: 'calc(100vw - 28px)', border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)', boxShadow: '0 18px 45px rgba(0,0,0,0.22)', padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 900 }}>Informations du devis</div>
              <button type="button" onClick={() => setInfoOpen(false)} style={iconBtn()} aria-label="Fermer">
                <X size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {infoRows.map((row) => {
                const Icon = row.icon
                return (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg)' }}>
                    <Icon size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', color: 'var(--color-text-3)' }}>{row.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</div>
                      {row.meta && <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 1 }}>{row.meta}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <nav aria-label="Étapes devis" style={{ display: 'flex', alignItems: 'center', justifySelf: 'center', width: 'min(100%, 660px)', minWidth: 520, padding: '0 4px' }}>
        {STEP_LABELS.map((item) => {
          const Icon = item.icon
          const active = step === item.num
          const done = step > item.num
          const reachable = item.num <= maxReached
          const lineDone = step > item.num
          return (
            <div key={item.num} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => reachable && onStep(item.num)}
                disabled={!reachable}
                title={item.label}
                style={{
                  position: 'relative', zIndex: 1,
                  width: 86, minWidth: 86, height: 42,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                  padding: 0, borderRadius: 9,
                  border: active ? '1.5px solid color-mix(in srgb, var(--color-primary) 82%, #fff)' : done ? '1px solid color-mix(in srgb, var(--color-primary) 54%, var(--color-border))' : '1px solid color-mix(in srgb, var(--color-border) 78%, var(--color-text-3))',
                  background: active
                    ? 'color-mix(in srgb, var(--color-primary) 18%, var(--color-surface))'
                    : done
                      ? 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))'
                      : 'color-mix(in srgb, var(--color-surface) 88%, var(--color-bg))',
                  color: active ? 'color-mix(in srgb, var(--color-primary) 78%, #fff)' : done ? 'var(--color-text)' : 'color-mix(in srgb, var(--color-text-2) 82%, #fff)',
                  cursor: reachable ? 'pointer' : 'default',
                  opacity: reachable ? 1 : 0.62,
                  fontFamily: 'var(--font-body)',
                  boxShadow: active ? '0 0 0 1px color-mix(in srgb, var(--color-primary) 18%, transparent)' : 'none',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10, fontWeight: 950, lineHeight: 1 }}>
                  {done ? <Check size={12} /> : <Icon size={12} />}
                  {item.num}
                </span>
                <span style={{ maxWidth: 78, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: active ? 950 : 850, lineHeight: 1.05 }}>
                  {item.label}
                </span>
              </button>
              {item.num < STEP_LABELS.length && (
                <div style={{ flex: 1, minWidth: 18, height: 2, margin: '0 6px', borderRadius: 999, background: lineDone ? 'color-mix(in srgb, var(--color-primary) 82%, #fff)' : 'color-mix(in srgb, var(--color-border) 80%, var(--color-text-3))' }} />
              )}
            </div>
          )
        })}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', minWidth: 0 }}>
        <button type="button" onClick={onOpenExperiences} style={actionStyle} title="Expériences" aria-label="Expériences">
          <BookOpen size={15} />
        </button>
        <button type="button" onClick={onOpenRules} style={actionStyle} title="Règles" aria-label="Règles">
          <Shield size={15} />
        </button>
        <button type="button" onClick={onBackToChat} style={actionStyle} title="Retour au chat" aria-label="Retour au chat">
          <MessageCircleReply size={15} />
        </button>
      </div>
    </header>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── STEP 1: CLIENT & DEAL SELECTION ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const companyDetailCache = new Map()

function StepClient({ onSelect, selectedCompany, selectedDeal, existingDevis, onSelectDeal, onCreateDeal, onNewDevis, onOpenDevis, onDeleteDevis, detailRefreshKey = 0, onUpdateDeal }) {
  const [query, setQuery] = useState('')
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchDone, setSearchDone] = useState(false)
  const [companyDetail, setCompanyDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [manualRefreshKey, setManualRefreshKey] = useState(0)
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [editingDealId, setEditingDealId] = useState(null)
  const [editingDealName, setEditingDealName] = useState('')
  const [savingDealId, setSavingDealId] = useState(null)
  const [editingDevisId, setEditingDevisId] = useState(null)
  const [editingDevisName, setEditingDevisName] = useState('')
  const [savingDevisId, setSavingDevisId] = useState(null)
  const [pendingDeleteDevis, setPendingDeleteDevis] = useState(null)
  const [pendingDeleteDeal, setPendingDeleteDeal] = useState(null)
  const [deletingDevisId, setDeletingDevisId] = useState(null)
  const [deletingDealId, setDeletingDealId] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const showToast = (msg, type = 'success') => {
    clearTimeout(toastTimerRef.current)
    setToast({ msg, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 2800)
  }
  const timerRef = useRef(null)
  const selectedCompanyId = selectedCompany?.id

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      const resetTimer = setTimeout(() => {
        setCompanies([])
        setSearchDone(false)
      }, 0)
      return () => clearTimeout(resetTimer)
    }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await api.get(`/prospects/companies?q=${encodeURIComponent(query)}&limit=10`)
        setCompanies(data.companies || data.results || [])
      } catch { setCompanies([]) }
      setLoading(false)
      setSearchDone(true)
    }, 400)
    return () => clearTimeout(timerRef.current)
  }, [query])

  // Load company detail when selected
  useEffect(() => {
    let active = true
    if (!selectedCompanyId) {
      const resetTimer = setTimeout(() => {
        if (active) setCompanyDetail(null)
      }, 0)
      return () => {
        active = false
        clearTimeout(resetTimer)
      }
    }
    const cachedDetail = companyDetailCache.get(String(selectedCompanyId))
    if (cachedDetail) setCompanyDetail(cachedDetail)
    Promise.resolve().then(async () => {
      setDetailLoading(!cachedDetail)
      try {
        const detail = await api.get(`/prospects/companies/${selectedCompanyId}`)
        companyDetailCache.set(String(selectedCompanyId), detail)
        if (active) setCompanyDetail(detail)
      } catch {
        if (active && !cachedDetail) setCompanyDetail(null)
      } finally {
        if (active) setDetailLoading(false)
      }
    })
    return () => { active = false }
  }, [selectedCompanyId, detailRefreshKey, manualRefreshKey])

  const refreshCompanyDetail = () => {
    if (!selectedCompanyId || detailLoading) return
    companyDetailCache.delete(String(selectedCompanyId))
    setManualRefreshKey((value) => value + 1)
  }

  const selectCompany = (c) => {
    onSelect({
      id: c.id || c.hs_object_id,
      name: c.properties?.name || c.name || `#${c.id}`,
      properties: c.properties || {},
      deliveryAddress: companyDeliveryAddress(c),
    })
    setQuery('')
    setCompanies([])
  }

  const deals = companyDetail?.deals || []
  const dealDevisCount = useMemo(() => {
    const map = new Map()
    for (const d of existingDevis || []) {
      if (!d?.deal_id) continue
      const key = String(d.deal_id)
      map.set(key, (map.get(key) || 0) + 1)
    }
    return map
  }, [existingDevis])
  const devisForSelectedDeal = useMemo(() => {
    if (!selectedDeal?.id) return []
    const key = String(selectedDeal.id)
    return (existingDevis || []).filter(d => String(d.deal_id) === key)
  }, [existingDevis, selectedDeal?.id])

  const createDeal = async () => {
    if (!selectedCompany || creatingDeal) return
    setCreatingDeal(true)
    try {
      const createdDeal = await onCreateDeal?.({
        companyId: selectedCompany.id,
        dealname: `Nouveau projet — ${selectedCompany.name}`,
      })
      if (createdDeal?.id) {
        onSelectDeal?.({
          id: createdDeal.id,
          name: createdDeal.properties?.dealname || createdDeal.dealname || `Deal #${createdDeal.id}`,
          amount: createdDeal.properties?.amount || createdDeal.amount,
        })
      }
    } finally {
      setCreatingDeal(false)
    }
  }

  const startEditingDeal = (dealId, currentName) => {
    setEditingDealId(dealId)
    setEditingDealName(currentName || '')
  }

  const saveDealName = async (dealId) => {
    if (!editingDealName.trim() || savingDealId) return
    setSavingDealId(dealId)
    const newName = editingDealName.trim()
    try {
      await onUpdateDeal?.({ dealId, dealname: newName })
      showToast(`Deal renommé\u00a0: ${newName}`)
      // Mise à jour locale sans recharger depuis HubSpot
      setCompanyDetail((prev) => {
        if (!prev) return prev
        const next = {
          ...prev,
          deals: (prev.deals || []).map((d) =>
            String(d.id) === String(dealId)
              ? { ...d, properties: { ...d.properties, dealname: newName } }
              : d
          ),
        }
        if (selectedCompanyId) companyDetailCache.set(String(selectedCompanyId), next)
        return next
      })
      setEditingDealId(null)
      setEditingDealName('')
    } catch (err) {
      console.error('Rename deal error:', err)
    } finally {
      setSavingDealId(null)
    }
  }

  const cancelEditingDeal = () => {
    setEditingDealId(null)
    setEditingDealName('')
  }

  const startEditingDevis = (devis) => {
    setEditingDevisId(devis.id)
    setEditingDevisName(devis.name || '')
  }

  const cancelEditingDevis = () => {
    setEditingDevisId(null)
    setEditingDevisName('')
  }

  const saveDevisName = async (devisId) => {
    const name = editingDevisName.trim()
    if (!devisId || !name || savingDevisId) return
    setSavingDevisId(devisId)
    try {
      const updated = await api.patch(`/devis/${devisId}`, { name })
      setExistingDevis(prev => prev.map(item => String(item.id) === String(devisId) ? { ...item, ...updated, name } : item))
      setEditingDevisId(null)
      setEditingDevisName('')
      showToast('Devis renommé', 'success')
    } catch (err) {
      console.error('Rename devis error:', err)
      showToast(err?.error || err?.message || 'Erreur renommage devis', 'error')
    } finally {
      setSavingDevisId(null)
    }
  }

  const confirmDeleteDevis = async () => {
    if (!pendingDeleteDevis || deletingDevisId) return
    setDeletingDevisId(pendingDeleteDevis.id)
    try {
      await onDeleteDevis?.(pendingDeleteDevis)
      setPendingDeleteDevis(null)
    } catch (err) {
      console.error('Delete devis error:', err)
      showToast('Erreur suppression devis', 'error')
    } finally {
      setDeletingDevisId(null)
    }
  }

  const confirmDeleteDeal = async () => {
    if (!pendingDeleteDeal || deletingDealId) return
    const dealId = String(pendingDeleteDeal.id || pendingDeleteDeal.deal_id || '')
    if (!dealId) return
    setDeletingDealId(dealId)
    try {
      await api.delete(`/prospects/deals/${dealId}`)
      onSelectDeal?.(null)
      if (selectedCompanyId) companyDetailCache.delete(String(selectedCompanyId))
      setSelectedCompanyDetail(prev => {
        if (!prev) return prev
        const nextDeals = (prev.deals || []).filter(deal => String(deal.id) !== dealId)
        return { ...prev, deals: nextDeals }
      })
      setPendingDeleteDeal(null)
      showToast('Projet supprimé', 'success')
    } catch (err) {
      console.error('Delete deal error:', err)
      showToast(err?.error || err?.message || 'Erreur suppression projet', 'error')
    } finally {
      setDeletingDealId(null)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'auto', padding: '30px 20px', position: 'relative' }}>
      {pendingDeleteDeal && (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-deal-title" style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(15, 23, 42, 0.42)' }} onClick={() => !deletingDealId && setPendingDeleteDeal(null)}>
          <div style={{ width: 'min(440px, 100%)', border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)', boxShadow: '0 20px 60px rgba(0,0,0,0.28)', padding: 18 }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.1)', color: '#dc2626', flexShrink: 0 }}>
                <Trash2 size={17} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div id="delete-deal-title" style={{ fontSize: 15, fontWeight: 900, marginBottom: 5 }}>Supprimer ce projet ?</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.45 }}>
                  Le projet HubSpot "{pendingDeleteDeal.name || pendingDeleteDeal.properties?.dealname || pendingDeleteDeal.id}" sera supprimé.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" onClick={() => setPendingDeleteDeal(null)} disabled={!!deletingDealId} style={ghostBtn()}>
                Annuler
              </button>
              <button type="button" onClick={confirmDeleteDeal} disabled={!!deletingDealId} style={{ ...ghostBtn(), color: '#dc2626', borderColor: 'rgba(220,38,38,0.35)' }}>
                {deletingDealId ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingDeleteDevis && (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-devis-title" style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(15, 23, 42, 0.42)' }} onClick={() => !deletingDevisId && setPendingDeleteDevis(null)}>
          <div style={{ width: 'min(440px, 100%)', border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)', boxShadow: '0 20px 60px rgba(0,0,0,0.28)', padding: 18 }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.1)', color: '#dc2626', flexShrink: 0 }}>
                <Trash2 size={17} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div id="delete-devis-title" style={{ fontSize: 15, fontWeight: 900, marginBottom: 5 }}>Supprimer ce devis ?</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.45 }}>
                  Le devis “{pendingDeleteDevis.name}” sera supprimé avec ses versions et ses lignes.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" onClick={() => setPendingDeleteDevis(null)} disabled={!!deletingDevisId} style={ghostBtn()}>
                Annuler
              </button>
              <button type="button" onClick={confirmDeleteDevis} disabled={!!deletingDevisId} style={{ ...ghostBtn(), color: '#dc2626', borderColor: 'rgba(220,38,38,0.35)' }}>
                {deletingDevisId ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'success' ? '#22c55e' : '#e53e3e',
          color: '#fff', padding: '10px 20px', borderRadius: '10px',
          fontSize: '13px', fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          zIndex: 9999, pointerEvents: 'none', whiteSpace: 'nowrap',
          animation: 'fadeInUp 0.2s ease',
        }}>
          <Check size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          {toast.msg}
        </div>
      )}
      <div style={{ width: '100%', maxWidth: 680 }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: 4 }}>Sélection du client</h2>
        <p style={{ fontSize: '13px', color: 'var(--color-text-2)', marginBottom: 20 }}>
          Parcours: choisissez le client, sélectionnez le projet HubSpot, puis reprenez un devis existant ou créez-en un nouveau.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'var(--color-primary)', color: '#fff', fontSize: 11, fontWeight: 800 }}>1</span>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Rechercher et choisir le client</div>
        </div>

        {/* Search bar */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--color-text-3)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un client (nom, société)…"
            style={{
              width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px',
              border: '1px solid var(--color-border)', background: 'var(--color-input-bg, var(--color-surface))',
              color: 'var(--color-text)', fontSize: '13px', outline: 'none', fontFamily: 'var(--font-body)',
            }}
          />
          {loading && <Loader2 size={16} style={{ position: 'absolute', right: 12, top: 11, animation: 'spin 0.8s linear infinite', color: 'var(--color-text-3)' }} />}
        </div>

        {/* Search results */}
        {companies.length > 0 && (
          <div style={{
            border: '1px solid var(--color-border)', borderRadius: '10px',
            background: 'var(--color-surface)', marginBottom: 16, maxHeight: 240, overflowY: 'auto',
          }}>
            {companies.map((c) => {
              const cId = c.id || c.hs_object_id
              const cName = c.properties?.name || c.name || `#${cId}`
              return (
                <div
                  key={cId}
                  onClick={() => selectCompany(c)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    cursor: 'pointer', borderBottom: '1px solid var(--color-border)',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-input-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Building2 size={16} color="var(--color-primary)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{cName}</div>
                    {c.properties?.city && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-3)' }}>{c.properties.city}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {searchDone && !loading && companies.length === 0 && query.trim() && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-text-3)', fontSize: '12px' }}>
            Aucun résultat pour « {query} »
          </div>
        )}

        {/* Selected company */}
        {selectedCompany && (
          <div style={{
            border: '2px solid var(--color-primary)', borderRadius: '12px',
            padding: '16px', marginBottom: 20,
            background: 'color-mix(in srgb, var(--color-primary) 4%, var(--color-surface))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Building2 size={20} color="var(--color-primary)" />
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>{selectedCompany.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-3)' }}>ID: {selectedCompany.id}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={refreshCompanyDetail}
                  disabled={detailLoading}
                  title="Rafraîchir les deals HubSpot"
                  style={{ ...iconBtn(), color: detailLoading ? 'var(--color-text-3)' : 'var(--color-primary)' }}
                >
                  <RefreshCw size={14} style={detailLoading ? { animation: 'spin 0.8s linear infinite' } : undefined} />
                </button>
                <button
                  type="button"
                  onClick={createDeal}
                  disabled={!onCreateDeal || creatingDeal}
                  title="Créer un deal HubSpot pour ce client"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 10px', borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: creatingDeal ? 'var(--color-border)' : 'var(--color-primary)',
                    color: creatingDeal ? 'var(--color-text-3)' : '#fff',
                    fontSize: '12px', fontWeight: 700,
                    cursor: !onCreateDeal || creatingDeal ? 'not-allowed' : 'pointer',
                    opacity: !onCreateDeal ? 0.6 : 1,
                  }}
                >
                  {creatingDeal ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Plus size={13} />}
                  Créer un deal
                </button>
                <button onClick={() => onSelect(null)} style={{ ...iconBtn() }} title="Changer de client">
                  <X size={16} />
                </button>
              </div>
            </div>

            {detailLoading && deals.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-3)', fontSize: '12px', padding: 8 }}>
                <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Chargement des deals…
              </div>
            ) : deals.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: '12px', color: 'var(--color-text-3)', padding: '8px 0', lineHeight: 1.5 }}>
                  Aucun projet HubSpot n'est encore associé à ce client. Créez un deal pour démarrer un devis.
                </div>
                <button
                  type="button"
                  onClick={createDeal}
                  disabled={!onCreateDeal || creatingDeal}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: creatingDeal ? 'var(--color-border)' : 'var(--color-primary)',
                    color: creatingDeal ? 'var(--color-text-3)' : '#fff',
                    fontWeight: 700, fontSize: '12px',
                    cursor: !onCreateDeal || creatingDeal ? 'not-allowed' : 'pointer',
                    opacity: !onCreateDeal ? 0.55 : 1,
                  }}
                >
                  {creatingDeal ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Plus size={14} />}
                  Créer le deal puis continuer
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'var(--color-primary)', color: '#fff', fontSize: 11, fontWeight: 800 }}>2</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 800 }}>Choisir le projet / deal HubSpot ({deals.length})</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>Les devis existants sont affichés directement sous chaque projet.</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {deals.map((d) => {
                    const dId = d.id || d.hs_object_id
                    const active = selectedDeal?.id === dId
                    const isEditing = editingDealId === dId
                    const dealName = d.properties?.dealname || `Deal #${dId}`
                    const dealPayload = { id: dId, name: dealName, amount: d.properties?.amount }
                    const dealDevis = (existingDevis || []).filter(devis => String(devis.deal_id) === String(dId))
                    const devisCount = dealDevis.length || dealDevisCount.get(String(dId)) || 0
                    const createdDate = d.properties?.createdate
                      ? new Date(d.properties.createdate).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                      : 'n/d'
                    const modifiedDate = d.properties?.hs_lastmodifieddate
                      ? new Date(d.properties.hs_lastmodifieddate).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                      : 'n/d'
                    return (
                      <div
                        key={dId}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: 0,
                          borderRadius: '8px', cursor: 'pointer',
                          border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                          background: active ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))' : 'var(--color-surface)',
                          overflow: 'hidden',
                          transition: 'all 0.12s',
                        }}
                      >
                        <div
                          onClick={() => onSelectDeal(dealPayload)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}
                        >
                          <Briefcase size={14} color={active ? 'var(--color-primary)' : 'var(--color-text-3)'} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(event) => event.stopPropagation()}>
                                <input
                                  value={editingDealName}
                                  onChange={(event) => setEditingDealName(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      saveDealName(dId)
                                    }
                                    if (event.key === 'Escape') {
                                      event.preventDefault()
                                      cancelEditingDeal()
                                    }
                                  }}
                                  autoFocus
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-input-bg, var(--color-surface))',
                                    color: 'var(--color-text)',
                                    fontSize: '12px',
                                    fontFamily: 'var(--font-body)',
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); saveDealName(dId) }}
                                  disabled={savingDealId === dId || !editingDealName.trim()}
                                  style={{ ...iconBtn(), color: 'var(--color-primary)' }}
                                  title="Valider"
                                >
                                  {savingDealId === dId ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                                </button>
                                <button type="button" onClick={(event) => { event.stopPropagation(); cancelEditingDeal() }} style={iconBtn()} title="Annuler">
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ fontWeight: 600, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {dealName}
                              </div>
                            )}
                            <div style={{ fontSize: '10px', color: 'var(--color-text-3)', marginTop: 2 }}>
                              {d.properties?.dealstage || '—'} {d.properties?.amount ? `· ${Number(d.properties.amount).toLocaleString('fr-FR')} €` : ''}
                              {` · créé ${createdDate}`}
                              {` · modifié ${modifiedDate}`}
                            </div>
                          </div>
                          <span style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 999, background: devisCount ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'var(--color-input-bg)', color: devisCount ? 'var(--color-primary)' : 'var(--color-text-3)', fontSize: 10, fontWeight: 900 }}>
                            {devisCount} devis
                          </span>
                          {!isEditing && (
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); onSelectDeal(dealPayload); onNewDevis?.(dealPayload) }}
                              style={{ ...ghostBtn(), flexShrink: 0, padding: '5px 9px', color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 7%, transparent)' }}
                              title="Créer un devis pour ce projet"
                            >
                              <Plus size={12} /> Nouveau devis
                            </button>
                          )}
                          {!isEditing && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); startEditingDeal(dId, dealName) }}
                                style={iconBtn()}
                                title="Renommer ce deal"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setPendingDeleteDeal({ ...dealPayload, name: dealName }) }}
                                style={{ ...iconBtn(), color: 'var(--color-danger, #e53e3e)' }}
                                title="Supprimer ce deal"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                        {dealDevis.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0 10px 10px 36px' }}>
                            {dealDevis.map((devis) => {
                              const rowCount = Number(devis.row_count || devis.lines_count || 0)
                              const totalHt = Number(devis.total_ht || 0)
                              const isEditingDevis = String(editingDevisId) === String(devis.id)
                              return (
                                <div
                                  key={devis.id}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    if (isEditingDevis) return
                                    onSelectDeal(dealPayload)
                                    onOpenDevis(devis)
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                    padding: '8px 10px', borderRadius: 7,
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-bg)', color: 'var(--color-text)',
                                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)',
                                  }}
                                >
                                  <FileText size={13} color="var(--color-primary)" />
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    {isEditingDevis ? (
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={(event) => event.stopPropagation()}>
                                        <input
                                          value={editingDevisName}
                                          onChange={(event) => setEditingDevisName(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter') saveDevisName(devis.id)
                                            if (event.key === 'Escape') cancelEditingDevis()
                                          }}
                                          autoFocus
                                          style={{ flex: 1, minWidth: 0, height: 26, border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-input-bg)', color: 'var(--color-text)', padding: '0 8px', fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-body)' }}
                                        />
                                        <button
                                          type="button"
                                          onClick={(event) => { event.stopPropagation(); saveDevisName(devis.id) }}
                                          disabled={savingDevisId === devis.id || !editingDevisName.trim()}
                                          style={{ ...iconBtn(), color: 'var(--color-primary)' }}
                                          title="Valider"
                                        >
                                          {savingDevisId === devis.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                                        </button>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); cancelEditingDevis() }} style={iconBtn()} title="Annuler">
                                          <X size={13} />
                                        </button>
                                      </span>
                                    ) : (
                                      <span style={{ display: 'block', fontSize: 11, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{devis.name}</span>
                                    )}
                                    <span style={{ display: 'block', fontSize: 9, color: 'var(--color-text-3)', marginTop: 1 }}>
                                      {devis.status} · {new Date(devis.updated_at).toLocaleDateString('fr-FR')} · {Number(devis.versions_count || 0)} version{Number(devis.versions_count || 0) > 1 ? 's' : ''} · {rowCount} ligne{rowCount > 1 ? 's' : ''} · {totalHt.toLocaleString('fr-FR')} € HT
                                    </span>
                                  </span>
                                  {!isEditingDevis && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 11, fontWeight: 900, color: 'var(--color-primary)' }}>
                                      Continuer <ArrowRight size={12} />
                                    </span>
                                  )}
                                  {!isEditingDevis && (
                                    <button
                                      type="button"
                                      onClick={(event) => { event.stopPropagation(); startEditingDevis(devis) }}
                                      style={{ ...iconBtn(), flexShrink: 0 }}
                                      title="Renommer ce devis"
                                      aria-label="Renommer ce devis"
                                    >
                                      <Pencil size={13} />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); setPendingDeleteDevis(devis) }}
                                    disabled={isEditingDevis}
                                    style={{ ...iconBtn(), color: '#dc2626', flexShrink: 0 }}
                                    title="Supprimer ce devis"
                                    aria-label="Supprimer ce devis"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SHARED COMPONENTS (RowCard, GammeBadge, Cell, etc.) ─────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function GammeBadge({ gamme, vantail }) {
  const color = gammeColor(gamme)
  const label = gamme?.length > 20
    ? gamme.replace('⚠️ ', '').replace(' — hors catalogue', '…')
    : gamme
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: '6px',
      padding: '2px 7px', fontSize: '10px', fontWeight: 700,
      letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {label} · {vantail}
    </span>
  )
}

function Cell({ icon, label, value, highlight }) {
  return (
    <div style={{
      background: highlight ? 'rgba(53,67,70,0.06)' : 'var(--color-surface-2, rgba(0,0,0,0.03))',
      borderRadius: '8px', padding: '7px 10px',
      border: highlight ? '1px solid var(--color-border-strong,var(--color-border))' : '1px solid transparent',
    }}>
      <div style={{ fontSize: '10px', color: 'var(--color-text-3, var(--color-text-2))', display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '2px' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '12px', fontWeight: highlight ? 700 : 500, color: 'var(--color-text)', wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  )
}

function RowCard({ row, index, active, expanded, onToggle, onSelect }) {
  const hasAlerts = row.alertes?.length > 0
  const alertColor = row.alertes?.some(a => a.startsWith('❌')) ? '#a33c3c' : '#a06a2c'
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
      borderRadius: '10px', overflow: 'hidden', transition: 'border-color 0.15s', cursor: 'pointer',
    }} onClick={() => onSelect()}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
        background: active ? 'color-mix(in srgb, var(--color-primary) 6%, var(--color-surface))' : 'transparent',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-3)', fontWeight: 700, minWidth: '18px' }}>#{index + 1}</span>
        <GammeBadge gamme={row.gamme} vantail={row.vantail} />
        <span style={{ fontSize: '12px', color: 'var(--color-text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.type}</span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>H{row.dim_standard?.h ?? '?'} × L{row.dim_standard?.l ?? '?'}</span>
        {row.prix_base_ht != null && (
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
            {prixFmt(row.prix_total_min_ht ?? row.prix_base_ht)} HT
          </span>
        )}
        {hasAlerts && <AlertTriangle size={13} color={alertColor} />}
        <button onClick={(e) => { e.stopPropagation(); onToggle() }} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--color-text-3)' }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {expanded && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <hr style={{ margin: 0, border: 'none', borderTop: '1px solid var(--color-border)' }} />
          {hasAlerts && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {row.alertes.map((a, i) => (
                <div key={i} style={{
                  fontSize: '11px', padding: '4px 8px', borderRadius: '5px',
                  background: a.startsWith('❌') ? 'rgba(163,60,60,0.08)' : 'rgba(160,106,44,0.08)',
                  color: a.startsWith('❌') ? '#a33c3c' : '#a06a2c',
                  borderLeft: `3px solid ${a.startsWith('❌') ? '#a33c3c' : '#a06a2c'}`,
                }}>{a}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <Cell icon={<Package size={11} />} label="Prix base" value={prixFmt(row.prix_base_ht) ?? '→ hors catalogue'} />
            {row.options?.length > 0 && (
              <Cell icon={<Euro size={11} />} label="Options" value={
                row.options.map(o => `${o.label}${o.prix != null ? ` +${o.prix.toLocaleString('fr-FR')}€` : ''}`).join(' · ')
              } />
            )}
            {row.prix_total_min_ht != null && (
              <Cell icon={<Euro size={11} />} label="Total estimé" value={prixFmt(row.prix_total_min_ht) + ' HT'} highlight />
            )}
            {row.serrure?.ref && <Cell icon={<Shield size={11} />} label="Serrure" value={row.serrure.ref} />}
            {row.ferme_porte?.ref && <Cell icon={<Wrench size={11} />} label="Ferme-porte" value={row.ferme_porte.ref} />}
          </div>
          {row.equip_extra?.length > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-2)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {row.equip_extra.map((e, i) => <span key={i}>🔧 {e}</span>)}
            </div>
          )}
          {row.autres && <div style={{ fontSize: '11px', color: 'var(--color-text-2)' }}>📎 {row.autres}</div>}
          <div style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>📄 {row.docs?.join(' → ')}</div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── STEP 2: VERSION TREE ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function StepVersions({ devisId, currentVersionId, onVersionSelected, onContinue }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [editingVersionId, setEditingVersionId] = useState(null)
  const [editingVersionTitle, setEditingVersionTitle] = useState('')
  const [savingVersionId, setSavingVersionId] = useState(null)
  const [editingCommentVersionId, setEditingCommentVersionId] = useState(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [savingCommentVersionId, setSavingCommentVersionId] = useState(null)
  const [collapsedVersionIds, setCollapsedVersionIds] = useState(() => new Set())
  const [pendingDeleteVersion, setPendingDeleteVersion] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const showToast = (msg, type = 'success') => {
    clearTimeout(toastTimerRef.current)
    setToast({ msg, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 2600)
  }

  const loadVersions = useCallback(async () => {
    if (!devisId) return
    setLoading(true)
    setError('')
    try {
      const payload = await api.get(`/devis/${devisId}/versions`)
      setData(payload)
      if (!currentVersionId && payload.current_version_id) onVersionSelected?.(payload.current_version_id)
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur chargement versions')
    } finally {
      setLoading(false)
    }
  }, [currentVersionId, devisId, onVersionSelected])

  useEffect(() => { loadVersions() }, [loadVersions])

  const versions = useMemo(() => Array.isArray(data?.versions) ? data.versions : [], [data?.versions])
  const activeVersionId = currentVersionId || data?.current_version_id || null
  const activeVersion = versions.find(v => v.id === activeVersionId) || versions[0] || null
  const collapsedStorageKey = useMemo(() => (devisId ? `devis_versions_collapsed_${devisId}` : null), [devisId])

  useEffect(() => {
    if (!collapsedStorageKey) {
      setCollapsedVersionIds(new Set())
      return
    }
    try {
      const saved = JSON.parse(localStorage.getItem(collapsedStorageKey) || '[]')
      setCollapsedVersionIds(new Set(Array.isArray(saved) ? saved.map(Number).filter(Boolean) : []))
    } catch {
      setCollapsedVersionIds(new Set())
    }
  }, [collapsedStorageKey])

  useEffect(() => {
    if (!collapsedStorageKey) return
    try {
      localStorage.setItem(collapsedStorageKey, JSON.stringify([...collapsedVersionIds]))
    } catch {}
  }, [collapsedStorageKey, collapsedVersionIds])
  const versionById = useMemo(() => {
    const map = new Map()
    for (const version of versions) map.set(version.id, version)
    return map
  }, [versions])
  const versionDisplayName = useCallback((version) => (
    version?.title || version?.branch_label || version?.version_label || 'Version de travail'
  ), [])
  const versionComment = useCallback((version) => {
    const comments = Array.isArray(version?.comments) ? version.comments : []
    return [...comments].reverse().find(item => item.kind === 'comment') || comments[comments.length - 1] || null
  }, [])
  const childrenByParent = useMemo(() => {
    const map = new Map()
    for (const version of versions) {
      const key = version.parent_version_id || 0
      const list = map.get(key) || []
      list.push(version)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => (a.id || 0) - (b.id || 0))
    return map
  }, [versions])
  const versionNumberById = useMemo(() => {
    const map = new Map()
    const walk = (parentId, prefix) => {
      const children = childrenByParent.get(parentId) || []
      children.forEach((version, index) => {
        const number = prefix ? `${prefix}.${index + 1}` : String(index + 1)
        map.set(version.id, number)
        walk(version.id, number)
      })
    }
    walk(0, '')
    return map
  }, [childrenByParent])
  const orderedVersions = useMemo(() => {
    const out = []
    const walk = (parentId, depth) => {
      for (const version of childrenByParent.get(parentId) || []) {
        out.push({ ...version, _depth: depth })
        if (collapsedVersionIds.has(version.id)) continue
        walk(version.id, depth + 1)
      }
    }
    walk(0, 0)
    return out.length ? out : versions.map(version => ({ ...version, _depth: 0 }))
  }, [childrenByParent, collapsedVersionIds, versions])
  const descendantCountById = useMemo(() => {
    const countFor = (id) => (childrenByParent.get(id) || []).reduce((sum, child) => sum + 1 + countFor(child.id), 0)
    const map = new Map()
    for (const version of versions) map.set(version.id, countFor(version.id))
    return map
  }, [childrenByParent, versions])
  const parentVersionIds = useMemo(() => (
    versions.filter(version => (childrenByParent.get(version.id) || []).length > 0).map(version => version.id)
  ), [childrenByParent, versions])

  const activateVersion = async (version) => {
    if (!version || !devisId) return
    if (String(version.id) === String(activeVersionId)) return true
    setBusyId(version.id)
    try {
      await api.post(`/devis/${devisId}/versions/${version.id}/activate`)
      onVersionSelected?.(version.id)
      await loadVersions()
      return true
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur activation version')
      return false
    } finally {
      setBusyId(null)
    }
  }

  const openVersionAndContinue = async (version) => {
    if (!version) return
    if (String(version.id) !== String(activeVersionId)) {
      const activated = await activateVersion(version)
      if (!activated) return
    }
    onContinue?.()
  }

  const startEditingVersion = (version) => {
    setEditingVersionId(version.id)
    setEditingVersionTitle(versionDisplayName(version))
  }

  const cancelEditingVersion = () => {
    setEditingVersionId(null)
    setEditingVersionTitle('')
  }

  const saveVersionTitle = async (version) => {
    const title = editingVersionTitle.trim()
    if (!version || !title || savingVersionId) return
    setSavingVersionId(version.id)
    try {
      await api.patch(`/devis/${devisId}/versions/${version.id}`, { title })
      setEditingVersionId(null)
      setEditingVersionTitle('')
      await loadVersions()
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur renommage version')
    } finally {
      setSavingVersionId(null)
    }
  }

  const startEditingComment = (version) => {
    const comment = versionComment(version)
    setEditingCommentVersionId(version.id)
    setEditingCommentText(comment?.content || '')
  }

  const cancelEditingComment = () => {
    setEditingCommentVersionId(null)
    setEditingCommentText('')
  }

  const toggleVersionCollapsed = (versionId) => {
    setCollapsedVersionIds((previous) => {
      const next = new Set(previous)
      if (next.has(versionId)) next.delete(versionId)
      else next.add(versionId)
      return next
    })
  }

  const collapseAllVersions = () => setCollapsedVersionIds(new Set(parentVersionIds))
  const expandAllVersions = () => setCollapsedVersionIds(new Set())

  const saveVersionComment = async (version) => {
    if (!version || savingCommentVersionId) return
    const content = editingCommentText.trim()
    setSavingCommentVersionId(version.id)
    const existingComment = versionComment(version)
    try {
      if (existingComment?.id) {
        await api.patch(`/devis/${devisId}/versions/${version.id}/comments/${existingComment.id}`, { content })
      } else if (content) {
        await api.post(`/devis/${devisId}/versions/${version.id}/comments`, {
          content,
          step_key: 'versions',
          kind: 'comment',
        })
      }
      setEditingCommentVersionId(null)
      setEditingCommentText('')
      showToast('Commentaire enregistré')
      await loadVersions()
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur enregistrement commentaire')
      showToast('Erreur enregistrement commentaire', 'error')
    } finally {
      setSavingCommentVersionId(null)
    }
  }

  const duplicateVersion = async (version, { asRoot = false } = {}) => {
    if (!version || !devisId) return
    const busyKey = asRoot ? `root-${version.id}` : `dup-${version.id}`
    setBusyId(busyKey)
    const sourceName = versionDisplayName(version)
    const sourceNumber = versionNumberById.get(version.id) || version.version_label
    try {
      const created = await api.post(`/devis/${devisId}/versions`, {
        source_version_id: version.id,
        parent_version_id: asRoot ? null : version.id,
        branch_label: version.branch_label || null,
        title: asRoot ? `Nouvelle version principale` : `Copie de ${sourceName}`,
        comment: asRoot ? `Nouvelle version principale depuis ${sourceNumber}` : `Nouvelle version depuis ${sourceNumber}`,
        step_key: 'versions',
      })
      onVersionSelected?.(created.id)
      await loadVersions()
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur duplication version')
    } finally {
      setBusyId(null)
    }
  }

  const deleteVersion = async (version) => {
    if (!version || !devisId || versions.length <= 1) return
    setPendingDeleteVersion(version)
  }

  const confirmDeleteVersion = async () => {
    const version = pendingDeleteVersion
    if (!version || !devisId || versions.length <= 1) return
    const versionNumber = versionNumberById.get(version.id) || version.version_label
    setBusyId(`del-${version.id}`)
    try {
      const result = await api.delete(`/devis/${devisId}/versions/${version.id}`)
      onVersionSelected?.(result.current_version_id || null)
      setPendingDeleteVersion(null)
      await loadVersions()
    } catch (err) {
      setError(err?.error || err?.message || `Erreur suppression version ${versionNumber}`)
    } finally {
      setBusyId(null)
    }
  }

  const statusLabel = (status) => ({
    draft: 'Brouillon',
    editing: 'Edition',
    prepdf: 'Pré-PDF',
    checked: 'Checké',
    pdf_generated: 'PDF généré',
    sent_hubspot: 'Envoyé HubSpot',
    archived: 'Archivé',
  }[status] || status || 'Brouillon')

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '26px 32px' }}>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 1300,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 9,
          background: toast.type === 'success' ? '#22c55e' : '#dc2626', color: '#fff',
          fontSize: 12, fontWeight: 800, boxShadow: '0 10px 30px rgba(0,0,0,0.28)', pointerEvents: 'none',
        }}>
          <Check size={14} /> {toast.msg}
        </div>
      )}
      {pendingDeleteVersion && (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-version-title" style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(15, 23, 42, 0.42)' }} onClick={() => busyId !== `del-${pendingDeleteVersion.id}` && setPendingDeleteVersion(null)}>
          <div style={{ width: 'min(440px, 100%)', border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)', boxShadow: '0 20px 60px rgba(0,0,0,0.28)', padding: 18 }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.1)', color: '#dc2626', flexShrink: 0 }}>
                <Trash2 size={17} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div id="delete-version-title" style={{ fontSize: 15, fontWeight: 900, marginBottom: 5 }}>Supprimer cette version ?</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.45 }}>
                  La version {versionNumberById.get(pendingDeleteVersion.id) || pendingDeleteVersion.version_label} sera supprimée
                  {(descendantCountById.get(pendingDeleteVersion.id) || 0) > 0
                    ? ` avec ses ${descendantCountById.get(pendingDeleteVersion.id)} sous-version${descendantCountById.get(pendingDeleteVersion.id) > 1 ? 's' : ''}.`
                    : '.'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" onClick={() => setPendingDeleteVersion(null)} disabled={busyId === `del-${pendingDeleteVersion.id}`} style={ghostBtn()}>
                Annuler
              </button>
              <button type="button" onClick={confirmDeleteVersion} disabled={busyId === `del-${pendingDeleteVersion.id}`} style={{ ...ghostBtn(), color: '#dc2626', borderColor: 'rgba(220,38,38,0.35)' }}>
                {busyId === `del-${pendingDeleteVersion.id}` ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Versions du devis</h2>
            <p style={{ margin: 0, color: 'var(--color-text-2)', fontSize: 13 }}>
              Ouvrez une version existante, créez une nouvelle version depuis celle-ci, puis continuez vers la grille.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" onClick={collapseAllVersions} style={ghostBtn()} disabled={!parentVersionIds.length} title="Tout replier">
              <ChevronRight size={13} />
              Tout replier
            </button>
            <button type="button" onClick={expandAllVersions} style={ghostBtn()} disabled={!collapsedVersionIds.size} title="Tout déplier">
              <ChevronDown size={13} />
              Tout déplier
            </button>
            <button type="button" onClick={() => activeVersion && duplicateVersion(activeVersion, { asRoot: true })} style={{ ...ghostBtn(), color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }} disabled={!activeVersion || busyId === `root-${activeVersion?.id}`}>
              {busyId === `root-${activeVersion?.id}` ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
              Nouvelle version principale
            </button>
            <button type="button" onClick={loadVersions} style={ghostBtn()} disabled={loading}>
              {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
              Actualiser
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, color: '#dc2626', background: 'rgba(220,38,38,0.08)', fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14, padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-2)' }}><strong style={{ color: 'var(--color-text)' }}>1. Ouvrir</strong><br />Sélectionnez la version à modifier.</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-2)' }}><strong style={{ color: 'var(--color-text)' }}>2. Nouvelle version</strong><br />Principale = 2, enfant = 1.1, 1.2, 1.2.1.</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-2)' }}><strong style={{ color: 'var(--color-text)' }}>3. Continuer</strong><br />Passez à la grille.</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orderedVersions.map(version => {
              const active = version.id === activeVersionId
              const isEditingVersion = editingVersionId === version.id
              const versionNumber = versionNumberById.get(version.id) || String(version.version_label || '').replace(/^v/i, '') || '1'
              const parentVersion = version.parent_version_id ? versionById.get(version.parent_version_id) : null
              const parentNumber = parentVersion ? versionNumberById.get(parentVersion.id) : null
              const sourceLabel = parentVersion ? `Enfant de ${parentNumber || versionDisplayName(parentVersion)}` : null
              const latestComment = versionComment(version)
              const latestCommentText = latestComment?.content || ''
              const showLatestComment = latestCommentText && latestCommentText !== sourceLabel && !latestCommentText.startsWith('Nouvelle version depuis ')
              const rowCount = Number(version.row_count || version.lines_count || 0)
              const totalHt = Number(version.total_ht || 0)
              const isEditingComment = editingCommentVersionId === version.id
              const childCount = (childrenByParent.get(version.id) || []).length
              const collapsed = collapsedVersionIds.has(version.id)
              return (
                <div key={version.id} style={{ marginLeft: version._depth * 22 }}>
                  <div
                    onClick={() => activateVersion(version)}
                    style={{ border: active ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)', borderRadius: 8, background: active ? 'color-mix(in srgb, var(--color-primary) 6%, var(--color-surface))' : 'var(--color-surface)', padding: 12, cursor: active ? 'default' : 'pointer' }}
                    title={active ? 'Version active' : 'Cliquer pour ouvrir cette version'}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) auto minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {childCount > 0 ? (
                            <button type="button" onClick={(event) => { event.stopPropagation(); toggleVersionCollapsed(version.id) }} style={iconBtn()} title={collapsed ? 'Déplier les sous-versions' : 'Replier les sous-versions'} aria-label={collapsed ? 'Déplier les sous-versions' : 'Replier les sous-versions'}>
                              {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                            </button>
                          ) : (
                            <span style={{ width: 26, flexShrink: 0 }} />
                          )}
                          <span style={{ width: 34, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: active ? 'var(--color-primary)' : 'var(--color-surface-2, var(--color-input-bg))', color: active ? '#fff' : 'var(--color-text)', fontWeight: 800, fontSize: 11 }}>
                            {versionNumber}
                          </span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {isEditingVersion ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(event) => event.stopPropagation()}>
                                <input
                                  value={editingVersionTitle}
                                  onChange={(event) => setEditingVersionTitle(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      saveVersionTitle(version)
                                    }
                                    if (event.key === 'Escape') {
                                      event.preventDefault()
                                      cancelEditingVersion()
                                    }
                                  }}
                                  autoFocus
                                  style={{
                                    flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 6,
                                    border: '1px solid var(--color-border)', background: 'var(--color-input-bg, var(--color-bg))',
                                    color: 'var(--color-text)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
                                  }}
                                />
                                <button type="button" onClick={(event) => { event.stopPropagation(); saveVersionTitle(version) }} disabled={savingVersionId === version.id || !editingVersionTitle.trim()} style={{ ...iconBtn(), color: 'var(--color-primary)' }} title="Valider le titre">
                                  {savingVersionId === version.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                                </button>
                                <button type="button" onClick={(event) => { event.stopPropagation(); cancelEditingVersion() }} style={iconBtn()} title="Annuler">
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {versionDisplayName(version)}
                                </div>
                                <button type="button" onClick={(event) => { event.stopPropagation(); startEditingVersion(version) }} style={iconBtn()} title="Renommer cette version">
                                  <Pencil size={12} />
                                </button>
                              </div>
                            )}
                            <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>
                              {statusLabel(version.status)} · {rowCount} ligne{rowCount > 1 ? 's' : ''} · {totalHt.toLocaleString('fr-FR')} € HT · {version.comments?.length || 0} commentaire{(version.comments?.length || 0) > 1 ? 's' : ''}{childCount ? ` · ${childCount} fille${childCount > 1 ? 's' : ''}${collapsed ? ' repliée' : ''}` : ''}
                            </div>
                          </div>
                          {version.locked && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>verrouillée</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }} onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); openVersionAndContinue(version) }}
                            style={{ ...iconBtn(), width: 32, height: 32, color: 'var(--color-primary)' }}
                            disabled={busyId === version.id}
                            title={active ? 'Continuer avec cette version' : 'Ouvrir cette version'}
                            aria-label={active ? 'Continuer avec cette version' : 'Ouvrir cette version'}
                          >
                            {busyId === version.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ExternalLink size={14} />}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); duplicateVersion(version) }}
                            style={{ ...iconBtn(), width: 32, height: 32 }}
                            disabled={busyId === `dup-${version.id}`}
                            title="Créer une version fille"
                            aria-label="Créer une version fille"
                          >
                            {busyId === `dup-${version.id}` ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Copy size={14} />}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); deleteVersion(version) }}
                            style={{ ...iconBtn(), width: 32, height: 32, color: '#dc2626', borderColor: 'rgba(220,38,38,0.35)' }}
                            disabled={versions.length <= 1 || busyId === `del-${version.id}`}
                            title={versions.length <= 1 ? 'Conservez au moins une version' : 'Supprimer récursivement cette version'}
                            aria-label={versions.length <= 1 ? 'Conservez au moins une version' : 'Supprimer récursivement cette version'}
                          >
                            {busyId === `del-${version.id}` ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                          </button>
                      </div>
                      <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg)', padding: 9, minWidth: 0 }} onClick={(event) => event.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: isEditingComment ? 7 : 0 }}>
                            <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>Commentaire</div>
                            <button type="button" onClick={() => startEditingComment(version)} style={iconBtn()} title="Modifier le commentaire" aria-label="Modifier le commentaire">
                              <Pencil size={12} />
                            </button>
                          </div>
                          {isEditingComment ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                              <textarea
                                value={editingCommentText}
                                onChange={(event) => setEditingCommentText(event.target.value)}
                                rows={3}
                                autoFocus
                                placeholder="Commentaire de version..."
                                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 7, background: 'var(--color-input-bg, var(--color-surface))', color: 'var(--color-text)', padding: 8, fontSize: 12, resize: 'vertical', outline: 'none', fontFamily: 'var(--font-body)' }}
                              />
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button type="button" onClick={cancelEditingComment} style={ghostBtn()} disabled={savingCommentVersionId === version.id}>
                                  Annuler
                                </button>
                                <button type="button" onClick={() => saveVersionComment(version)} style={{ ...ghostBtn(), color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }} disabled={savingCommentVersionId === version.id}>
                                  {savingCommentVersionId === version.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
                                  Enregistrer
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ marginTop: 5, minHeight: 20, fontSize: 12, lineHeight: 1.45, color: latestCommentText ? 'var(--color-text-2)' : 'var(--color-text-3)', whiteSpace: 'pre-wrap' }}>
                              {latestCommentText || 'Aucun commentaire'}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            {!orderedVersions.length && !loading && (
              <div style={{ border: '1px dashed var(--color-border)', borderRadius: 8, padding: 18, fontSize: 12, color: 'var(--color-text-3)' }}>
                Aucune version trouvée. Une version V1 sera créée automatiquement.
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── STEP 2: ANALYSIS (existing UI) ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function StepAnalysis({
  results, analyzing, error, expandedRow, setExpandedRow,
  aiRow, selectRow, fileInputRef, analyzeFile,
  aiRowData, aiMessages, aiInput, setAiInput, aiLoading, askAI, aiEndRef, aiInputRef,
  onValidate, onStartBlank, chatRatio, setChatRatio,
}) {
  const chatWidth = chatRatio === '1/3' ? 380 : chatRatio === '1/2' ? '50%' : 620
  const RatioIcon = chatRatio === '1/3' ? Columns3 : chatRatio === '1/2' ? Columns2 : Columns

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}>
      {/* Center: analysis results */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {analyzing ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--color-text-3)' }}>
            <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: '13px' }}>Analyse en cours…</span>
          </div>
        ) : error ? (
          <div style={{ padding: 20 }}>
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(163,60,60,0.08)', border: '1px solid #a33c3c', color: '#a33c3c', fontSize: '13px' }}>
              ❌ {error}
            </div>
          </div>
        ) : results.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-3)', padding: 20 }}>
            <Upload size={40} style={{ opacity: 0.15, marginBottom: 12 }} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Importez un fichier Excel</span>
            <span style={{ fontSize: '12px', marginTop: 4 }}>Glissez un .xlsx ou cliquez ci-dessous</span>
            <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzeFile(f); e.target.value = '' }} />
            <button onClick={() => fileInputRef.current?.click()} style={{
              marginTop: 16, padding: '10px 20px', borderRadius: '10px', border: 'none',
              background: 'var(--color-primary)', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
            }}>
              <Upload size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Choisir un fichier .xlsx
            </button>
            <button onClick={onStartBlank} style={{
              marginTop: 8, padding: '9px 18px', borderRadius: '10px', border: '1px solid var(--color-primary)',
              background: 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))', color: 'var(--color-primary)',
              fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Plus size={14} />
              Commencer avec une ligne vide
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileSpreadsheet size={15} color="var(--color-primary)" />
                <span style={{ fontWeight: 600, fontSize: '13px' }}>
                  {results.length} ligne{results.length > 1 ? 's' : ''} analysée{results.length > 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzeFile(f); e.target.value = '' }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} style={ghostBtn()}>
                  <RefreshCw size={12} /> Nouveau fichier
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.map((row, i) => (
                <RowCard key={i} row={row} index={i} active={aiRow === i}
                  expanded={expandedRow === i}
                  onToggle={() => setExpandedRow(expandedRow === i ? null : i)}
                  onSelect={() => selectRow(i)}
                />
              ))}
            </div>
            {(() => {
              const total = results.reduce((s, r) => s + (r.prix_total_min_ht ?? 0), 0)
              if (!total) return null
              return (
                <div style={{
                  marginTop: 14, padding: '12px 16px', borderRadius: '10px',
                  background: 'var(--color-surface)', border: '2px solid var(--color-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontWeight: 700, fontSize: '13px' }}>💶 Total général estimé</span>
                  <span style={{ fontWeight: 800, fontSize: '16px' }}>{total.toLocaleString('fr-FR')} € HT TG</span>
                </div>
              )
            })()}
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button onClick={onValidate} style={{
                padding: '10px 28px', borderRadius: '10px', border: 'none',
                background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
              }}>
                <Check size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Valider et passer à l'éditeur
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Gemma chat */}
      <div style={{
        width: chatWidth, minWidth: chatWidth, flexShrink: 0, display: 'flex', flexDirection: 'column',
        height: '100%', overflow: 'hidden', borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)',
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Bot size={16} color="var(--color-primary)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '13px' }}>Assistant Gemma</div>
            {aiRowData && (
              <div style={{ fontSize: '10px', color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Ligne {(aiRow ?? 0) + 1} — {aiRowData.gamme} {aiRowData.vantail}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              const ratios = ['1/3', '1/2', '2/3']
              const idx = ratios.indexOf(chatRatio)
              setChatRatio(ratios[(idx + 1) % ratios.length])
            }}
            style={{ ...iconBtn(), padding: 6 }}
            title={`Largeur chat: ${chatRatio}`}
          >
            <RatioIcon size={14} />
          </button>
        </div>
        {/* Summary */}
        {aiRowData && (
          <div style={{
            padding: '6px 14px', background: 'var(--color-surface-2, rgba(53,67,70,0.04))',
            borderBottom: '1px solid var(--color-border)', fontSize: '11px', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}>
            <GammeBadge gamme={aiRowData.gamme} vantail={aiRowData.vantail} />
            {aiRowData.dim_standard && <span style={{ color: 'var(--color-text-3)' }}>H{aiRowData.dim_standard.h}×L{aiRowData.dim_standard.l}</span>}
            {aiRowData.prix_base_ht != null && <span style={{ fontWeight: 600 }}>{prixFmt(aiRowData.prix_base_ht)}</span>}
          </div>
        )}
        {!aiRowData ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, color: 'var(--color-text-3)', textAlign: 'center', fontSize: '12px' }}>
            <div><Bot size={32} style={{ opacity: 0.2, marginBottom: 8 }} /><br />Sélectionnez une ligne pour<br />consulter l'assistant</div>
          </div>
        ) : (
          <>
            {aiMessages.length === 0 && (
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                <div style={{ fontSize: '10px', color: 'var(--color-text-3)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' }}>Suggestions</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} onClick={() => askAI(s)} style={{
                      padding: '4px 9px', borderRadius: '14px', border: '1px solid var(--color-border)',
                      background: 'transparent', color: 'var(--color-text)', fontSize: '11px', cursor: 'pointer',
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: 0 }}>
              {aiMessages.map((m, i) => (
                <div key={i} style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {m.role === 'assistant' && (
                    <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: 'var(--color-avatar-ai-bg, #e8ebea)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Bot size={12} color="var(--color-avatar-ai-text, var(--color-primary))" />
                    </div>
                  )}
                  <div style={{
                    flex: 1, padding: '8px 10px', borderRadius: '10px',
                    background: m.role === 'user' ? 'var(--color-bubble-user, var(--color-primary))' : 'var(--color-surface-2, var(--color-input-bg))',
                    color: m.role === 'user' ? '#fff' : 'var(--color-text)', fontSize: '12px', lineHeight: 1.55,
                    marginLeft: m.role === 'user' ? 'auto' : 0, maxWidth: '92%',
                  }}>
                    {m.role === 'assistant' ? <MarkdownRenderer content={m.content} /> : m.content}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-3)', fontSize: '12px' }}>
                  <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Gemma réfléchit…
                </div>
              )}
              <div ref={aiEndRef} />
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 6, flexShrink: 0 }}>
              <input ref={aiInputRef} value={aiInput} onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), askAI())}
                placeholder="Posez votre question…" disabled={aiLoading}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)',
                  background: 'var(--color-input-bg, var(--color-surface-2))', color: 'var(--color-text)',
                  fontSize: '12px', outline: 'none', fontFamily: 'var(--font-body)',
                }}
              />
              <button onClick={() => askAI()} disabled={!aiInput.trim() || aiLoading}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '8px 12px', borderRadius: '8px', border: 'none',
                  background: 'var(--color-primary)', color: '#fff', cursor: 'pointer',
                  opacity: (!aiInput.trim() || aiLoading) ? 0.4 : 1,
                }}>
                <Send size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── STEP 3: LINE EDITOR ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function StepEditor({
  devisId, versionId, lines, setLines, onRefresh,
  onContinuePdf,
  defaultTransportAddress = '',
  askAIEditor,
  assistantHighlights = null,
}) {
  const [saving, setSaving] = useState(null)
  const [visibleGridRows, setVisibleGridRows] = useState([])

  const gridRows = useMemo(() => lines.map(dbLineToGridRow), [lines])
  useEffect(() => { setVisibleGridRows(gridRows) }, [gridRows])

  const canContinuePdf = visibleGridRows.some(row => row && !row._manualBlank)

  const commitGridRow = useCallback(async (row, index) => {
    if (!devisId) return
    setSaving(row._lineId || `new-${index}`)
    try {
      const payload = gridRowToLinePayload(row, index)
      if (row._lineId) {
        await api.put(`/devis/${devisId}/lines/${row._lineId}`, payload)
      } else {
        await api.post(`/devis/${devisId}/lines`, payload)
      }
      await onRefresh()
    } catch (err) {
      console.error('Grid line commit error:', err)
    } finally {
      setSaving(null)
    }
  }, [devisId, onRefresh])

  const deleteGridRow = useCallback(async (row) => {
    if (!devisId || !row?._lineId) return
    try {
      await api.delete(`/devis/${devisId}/lines/${row._lineId}`)
      onRefresh()
    } catch (err) {
      console.error('Grid line delete error:', err)
      onRefresh()
    }
  }, [devisId, onRefresh])

  const checkpointVersion = useCallback(async () => {
    if (!devisId || !versionId) return
    setSaving('checkpoint')
    try {
      await api.post(`/devis/${devisId}/versions/${versionId}/checkpoint`, {
        comment: 'Checkpoint manuel depuis la grille devis',
        step_key: 'grid',
        status: 'editing',
      })
      onRefresh()
    } catch (err) {
      console.error('Version checkpoint error:', err)
    } finally {
      setSaving(null)
    }
  }, [devisId, onRefresh, versionId])

  const bulkCommitGridRows = useCallback(async (rows) => {
    if (!devisId || !Array.isArray(rows)) return []
    setSaving('bulk-import')
    try {
      const savedLines = await api.post(`/devis/${devisId}/lines/bulk`, { lines: rows })
      setLines?.(savedLines)
      setVisibleGridRows(savedLines.map(dbLineToGridRow))
      return savedLines
    } catch (err) {
      console.error('Grid bulk import commit error:', err)
      throw err
    } finally {
      setSaving(null)
    }
  }, [devisId, setLines])

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'var(--color-surface)' }}>
        <FileText size={15} color="var(--color-primary)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Éditeur devis sheet-like</div>
          <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>
            {lines.length} ligne{lines.length !== 1 ? 's' : ''} · sauvegarde backend par ligne{saving ? ' · enregistrement…' : ''}
          </div>
        </div>
        <button onClick={checkpointVersion} disabled={!versionId || saving === 'checkpoint'} style={ghostBtn()} title="Enregistrer un checkpoint dans la version active">
          {saving === 'checkpoint' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Clock size={13} />}
          Checkpoint version
        </button>
        <button onClick={() => askAIEditor('Contrôle les lignes du devis et liste les incohérences bloquantes.')} style={ghostBtn()}>
          <Bot size={13} /> Audit IA
        </button>
        <button onClick={onContinuePdf} disabled={!canContinuePdf || saving === 'bulk-import'} className="admin-btn-primary" style={{ fontSize: 11, padding: '6px 12px' }}>
          Continuer vers pré-édition PDF <ArrowRight size={13} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <DevisGridWorkspace
          embedded
          initialRows={gridRows}
          assistantHighlights={assistantHighlights}
          defaultTransportAddress={defaultTransportAddress}
          startWithBlank
          onRowsChange={setVisibleGridRows}
          onRowsCommit={commitGridRow}
          onRowsBulkCommit={bulkCommitGridRows}
          onRowsDelete={deleteGridRow}
          title="Sheet devis"
          subtitle={saving ? 'Enregistrement en cours…' : `${lines.length} lignes synchronisées`}
        />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── STEP 4: PDF GENERATION ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function StepPDF({ devisId, versionId, lines, setLines, clientName, dealName, onSendHubSpot }) {
  const [copied, setCopied] = useState(false)
  const [draftLines, setDraftLines] = useState(lines)
  const [savingId, setSavingId] = useState(null)
  const [suggestingId, setSuggestingId] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkReport, setCheckReport] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [activePreviewKey, setActivePreviewKey] = useState(null)
  const previewRefs = useRef(new Map())

  useEffect(() => { setDraftLines(lines) }, [lines])

  const getLineKey = useCallback((line, index) => String(line?.id ?? `line-${index}`), [])

  useEffect(() => {
    if (!draftLines.length) {
      setActivePreviewKey(null)
      return
    }
    const activeExists = draftLines.some((line, index) => getLineKey(line, index) === activePreviewKey)
    if (!activeExists) setActivePreviewKey(getLineKey(draftLines[0], 0))
  }, [activePreviewKey, draftLines, getLineKey])

  const scrollPreviewToLine = useCallback((line, index) => {
    const key = getLineKey(line, index)
    setActivePreviewKey(key)
    requestAnimationFrame(() => {
      previewRefs.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [getLineKey])

  const grandTotal = draftLines.reduce((s, l) => s + (Number(l.total_ligne_ht) || 0), 0)

  const updateDraftDesignation = (lineId, designation) => {
    setDraftLines(prev => prev.map(line => line.id === lineId ? { ...line, designation } : line))
  }

  const pdfLabelPayload = (line) => ({
    line_id: line.id,
    position: line.position ?? 0,
    line_section: line.line_section || 'products',
    localisation: line.localisation || null,
    designation_pdf: line.designation || null,
  })

  const persistPdfLabels = async (labels, comment = null) => {
    if (versionId) {
      const result = await api.put(`/devis/${devisId}/versions/${versionId}/pdf-labels`, { labels, comment })
      if (Array.isArray(result.lines)) {
        setDraftLines(result.lines)
        setLines?.(result.lines)
      }
      return result
    }

    const updatedLines = []
    for (const label of labels) {
      const updated = await api.put(`/devis/${devisId}/lines/${label.line_id}`, { designation: label.designation_pdf || null })
      updatedLines.push(updated)
    }
    setDraftLines(prev => prev.map(item => updatedLines.find(updated => updated.id === item.id) || item))
    setLines?.(prev => prev.map(item => updatedLines.find(updated => updated.id === item.id) || item))
    return { success: true, updated: updatedLines.length }
  }

  const saveDesignation = async (line) => {
    if (!devisId || !line?.id) return
    setSavingId(line.id); setStatusMsg('')
    try {
      await persistPdfLabels([pdfLabelPayload(line)], 'Libellé PDF modifié en pré-édition')
      setStatusMsg('Libellé enregistré')
    } catch (err) {
      setStatusMsg(err?.error || err?.message || 'Erreur enregistrement')
    } finally {
      setSavingId(null)
    }
  }

  const saveAllDesignations = async () => {
    setSavingId('all'); setStatusMsg('')
    try {
      await persistPdfLabels(
        draftLines.filter(item => item.id).map(pdfLabelPayload),
        'Pré-édition PDF enregistrée'
      )
      setStatusMsg('Textes PDF enregistrés')
    } catch (err) {
      setStatusMsg(err?.error || err?.message || 'Erreur enregistrement textes PDF')
    } finally {
      setSavingId(null)
    }
  }

  const suggestDesignation = async (line, index = 0, hideStatus = false) => {
    if (!line?.id) return
    setSuggestingId(line.id);
    if (!hideStatus) setStatusMsg('')
    try {
      const contextLines = draftLines
        .map((item, itemIndex) => ({ item, itemIndex }))
        .filter(({ item }) => (item.line_section || 'products') === 'products')
        .filter(({ itemIndex }) => Math.abs(itemIndex - index) <= 3)
        .map(({ item }) => dbLineToGridRow(item))
      const data = await api.post('/devis/suggest-designation', { line: dbLineToGridRow(line), context_lines: contextLines }, { timeout: 90000 })
      if (data?.designation) updateDraftDesignation(line.id, data.designation)
      if (!hideStatus) setStatusMsg(data?.examples?.length ? `Suggestion IA prête (${data.examples.length} exemples)` : 'Suggestion IA prête')
    } catch (err) {
      if (!hideStatus) setStatusMsg(err?.error || err?.message || 'Erreur suggestion IA')
    } finally {
      setSuggestingId(null)
    }
  }

  const [isSuggestingAll, setIsSuggestingAll] = useState(false)
  const runFinalCheck = async ({ silent = false } = {}) => {
    if (!devisId) return null
    setChecking(true)
    if (!silent) setStatusMsg('')
    try {
      const report = await api.post(`/devis/${devisId}/validate-rules`, { version_id: versionId })
      setCheckReport(report)
      const summary = report?.summary || {}
      setStatusMsg(`Check règles + expériences : ${summary.violation || 0} violation(s), ${summary.warning || 0} avertissement(s)`)
      return report
    } catch (err) {
      setStatusMsg(err?.error || err?.message || 'Erreur check règles + expériences')
      return null
    } finally {
      setChecking(false)
    }
  }

  const suggestAllDesignations = async () => {
    setIsSuggestingAll(true)
    setStatusMsg('Auto-génération IA en cours pour toutes les lignes...')
    try {
      const productLines = draftLines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => (line.line_section || 'products') === 'products')

      let count = 0
      for (const { line, index } of productLines) {
        setStatusMsg(`Génération IA ${count + 1} / ${productLines.length}...`)
        await suggestDesignation(line, index, true)
        count++
      }
      setStatusMsg(`Génération IA terminée pour ${count} ligne(s). Contrôle règles + expériences...`)
      await runFinalCheck({ silent: true })
    } catch (err) {
      setStatusMsg('Erreur lors de la génération IA globale.')
    } finally {
      setIsSuggestingAll(false)
    }
  }

  const downloadFinalPdf = async () => {
    if (!devisId) return
    setDownloading(true); setStatusMsg('')
    try {
      await saveAllDesignations()
      await runFinalCheck({ silent: true })
      const res = await fetch(`/api/devis/${devisId}/pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      if (!res.ok) throw new Error(`PDF HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `devis-${devisId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setStatusMsg('PDF téléchargé')
    } catch (err) {
      setStatusMsg(err?.message || 'Erreur téléchargement PDF')
    } finally {
      setDownloading(false)
    }
  }

  const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const fmt = (v) => v != null ? Number(v).toLocaleString('fr-FR') + ' €' : '—'
  const checkLineById = useMemo(() => {
    const map = new Map()
    for (const item of checkReport?.lines || []) {
      if (item.line_id != null) map.set(Number(item.line_id), item)
    }
    return map
  }, [checkReport])
  const getLineOptions = (line) => {
    try { return JSON.parse(line.options_json || '[]') } catch { return [] }
  }
  const getLinePassageDimensions = (line) => computePassageDimensions(dbLineToGridRow(line))
  const passageDimensionLabel = (dims) => dims?._dimensionLabel === 'CV' ? 'Clair vitrage CV' : 'Passage libre PL'
  const passageDimensionText = (line) => {
    const dims = getLinePassageDimensions(line)
    return `${passageDimensionLabel(dims)} H ${dims.hauteur_pl_mm || '?'} × L ${dims.largeur_pl_mm || '?'} mm`
  }
  const reservationDimensionText = (line) => {
    const dims = getLinePassageDimensions(line)
    return `Réservation GO H ${dims.hauteur_reservation_mm || '?'} × L ${dims.largeur_reservation_mm || '?'} mm`
  }

  const buildMarkdown = () => {
    const fmt = (v) => v != null ? Number(v).toLocaleString('fr-FR') + ' €' : '—'
    const linesStr = draftLines.map((l, i) => {
      const opts = getLineOptions(l)
      const passageDims = getLinePassageDimensions(l)
      const optsStr = opts.map(o => `  - ${o.label} : +${(o.prix || 0).toLocaleString('fr-FR')} €`).join('\n')
      return [
        `### Ligne ${i + 1} — ${l.gamme || '?'} ${l.vantail || ''}`,
        `| Champ | Valeur |`, `|---|---|`,
        `| Désignation | ${l.designation || '—'} |`,
        l.localisation ? `| Localisation | **${l.localisation}** |` : null,
        `| Dimensions HT | H **${l.hauteur_mm || '?'}** × L **${l.largeur_mm || '?'}** mm |`,
        `| ${passageDimensionLabel(passageDims)} | H **${passageDims.hauteur_pl_mm || '?'}** × L **${passageDims.largeur_pl_mm || '?'}** mm |`,
        `| Réservation GO | H **${passageDims.hauteur_reservation_mm || '?'}** × L **${passageDims.largeur_reservation_mm || '?'}** mm |`,
        `| Prix base TG | **${fmt(l.prix_base_ht)}** HT |`,
        l.serrure_ref ? `| Serrure | ${l.serrure_ref} |` : null,
        l.ferme_porte_ref ? `| Ferme-porte | ${l.ferme_porte_ref} |` : null,
        `| **Total estimé** | **${fmt(l.total_ligne_ht)} HT** |`,
        optsStr ? `\n**Options :**\n${optsStr}` : null,
      ].filter(Boolean).join('\n')
    }).join('\n\n---\n\n')

    return [
      `# Devis NEXUS — ${clientName || 'Client'}`,
      `> ${date} — ${dealName || ''} — Estimatif tarif NEXUS 2026-01`,
      '', linesStr, '', '---', '',
      `## 💶 Total général : **${grandTotal.toLocaleString('fr-FR')} € HT TG**`,
    ].join('\n')
  }

  const mdText = buildMarkdown()

  const copyText = () => {
    navigator.clipboard.writeText(mdText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={16} color="var(--color-primary)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px' }}>Édition PDF avant impression</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>Modifier les libellés commerciaux, puis générer le PDF définitif</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {statusMsg && <span style={{ alignSelf: 'center', fontSize: 11, color: statusMsg.toLowerCase().includes('erreur') ? '#dc2626' : 'var(--color-text-2)' }}>{statusMsg}</span>}
          <button onClick={suggestAllDesignations} disabled={isSuggestingAll} style={ghostBtn()}>
            {isSuggestingAll ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />} Auto-Générer Tout (IA)
          </button>
          <button onClick={saveAllDesignations} style={ghostBtn()} disabled={!!savingId}>
            {savingId ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />} Enregistrer textes
          </button>
          <button onClick={runFinalCheck} style={ghostBtn()} disabled={checking || !versionId}>
            {checking ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Shield size={13} />} Check règles
          </button>
          <button onClick={downloadFinalPdf} disabled={downloading} style={ghostBtn()}>
            {downloading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />} PDF final
          </button>
          <button onClick={onSendHubSpot} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
            borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: '#fff',
            fontWeight: 700, fontSize: '12px', cursor: 'pointer',
          }}>
            <Send size={13} /> Envoyer vers HubSpot →
          </button>
        </div>
      </div>
      {checkReport && (
        <div style={{ flexShrink: 0, display: 'flex', gap: 14, alignItems: 'center', padding: '7px 14px', borderBottom: '1px solid var(--color-border)', background: 'color-mix(in srgb, var(--color-primary) 4%, var(--color-surface))', fontSize: 11 }}>
          <strong>Audit version {checkReport.version_id || versionId}</strong>
          <span style={{ color: '#228b54' }}>OK {checkReport.summary?.ok || 0}</span>
          <span style={{ color: '#a06a2c' }}>Attention {checkReport.summary?.warning || 0}</span>
          <span style={{ color: '#a33c3c' }}>Violation {checkReport.summary?.violation || 0}</span>
          <span style={{ color: 'var(--color-text-3)' }}>{checkReport.rules_count || 0} règle(s) + expériences</span>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(360px, 0.95fr) minmax(420px, 1.05fr)', overflow: 'hidden' }}>
        <div style={{ minHeight: 0, overflowY: 'auto', borderRight: '1px solid var(--color-border)', padding: '14px', background: 'var(--color-surface)', scrollbarGutter: 'stable' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {draftLines.map((line, index) => {
              const isProduct = (line.line_section || 'products') === 'products'
              const lineKey = getLineKey(line, index)
              const isActive = activePreviewKey === lineKey
              const auditLine = line.id != null ? checkLineById.get(Number(line.id)) : null
              const auditIssues = (auditLine?.verdicts || []).filter(v => v.status === 'warning' || v.status === 'violation')
              return (
                <div key={lineKey} style={{ border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 8, background: 'var(--color-bg)', overflow: 'hidden', boxShadow: isActive ? '0 0 0 1px color-mix(in srgb, var(--color-primary) 35%, transparent)' : 'none' }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => scrollPreviewToLine(line, index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        scrollPreviewToLine(line, index)
                      }
                    }}
                    title="Afficher cette ligne dans l'aperçu"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: isActive ? 'color-mix(in srgb, var(--color-primary) 7%, transparent)' : 'transparent' }}
                  >
                    <span style={{ minWidth: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: gammeColor(line.gamme), color: '#fff', fontSize: 11, fontWeight: 800 }}>{repLetter(index)}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.gamme || line.type_porte || line.line_section || 'Ligne'}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>HT H {line.hauteur_mm || '?'} × L {line.largeur_mm || '?'} mm</div>
                      {line.localisation && <div style={{ fontSize: 10, color: 'var(--color-primary)', fontWeight: 800 }}>Localisation : {line.localisation}</div>}
                      <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>{passageDimensionText(line)}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>{reservationDimensionText(line)}</div>
                    </div>
                    {auditLine && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: auditIssues.some(v => v.status === 'violation') ? '#a33c3c' : auditIssues.length ? '#a06a2c' : '#228b54' }}>
                        {auditIssues.length ? `${auditIssues.length} règle(s)` : 'Règles OK'}
                      </span>
                    )}
                    {isProduct && (
                      <button type="button" onClick={() => suggestDesignation(line, index)} disabled={suggestingId === line.id} style={ghostBtn()}>
                        {suggestingId === line.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />} IA
                      </button>
                    )}
                    <button type="button" onClick={() => saveDesignation(line)} disabled={savingId === line.id} style={ghostBtn()}>
                      {savingId === line.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} OK
                    </button>
                  </div>
                  <textarea
                    value={line.designation || ''}
                    onChange={e => updateDraftDesignation(line.id, e.target.value)}
                    rows={Math.max(4, Math.min(12, String(line.designation || '').split('\n').length + 1))}
                    style={{ width: '100%', boxSizing: 'border-box', border: 'none', resize: 'vertical', padding: 10, background: 'transparent', color: 'var(--color-text)', fontSize: 12, lineHeight: 1.45, fontFamily: 'var(--font-body)', outline: 'none' }}
                    placeholder="Libellé imprimé sur le PDF…"
                  />
                  {auditIssues.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 10px 10px' }}>
                      {auditIssues.slice(0, 6).map((issue, issueIndex) => {
                        const isViolation = issue.status === 'violation'
                        return (
                          <div key={`${issue.rule_id || issue.rule_code || issueIndex}`} style={{ fontSize: 10, lineHeight: 1.35, color: isViolation ? '#a33c3c' : '#a06a2c', background: isViolation ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.09)', borderRadius: 6, padding: '5px 7px' }}>
                            <strong>{issue.rule_code ? `${issue.rule_code} — ` : ''}{issue.rule_title || 'Règle / expérience'}</strong>
                            {issue.reason ? ` : ${issue.reason}` : ''}
                            {issue.fix ? <span style={{ display: 'block', color: 'var(--color-text-2)', marginTop: 2 }}>Correctif : {issue.fix}</span> : null}
                          </div>
                        )
                      })}
                      {auditIssues.length > 6 && (
                        <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>+ {auditIssues.length - 6} autre(s) alerte(s)</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ minHeight: 0, overflowY: 'auto', padding: '20px 24px', scrollBehavior: 'smooth', background: 'var(--color-bg)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', color: 'var(--color-text)' }}>
            <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--color-border)' }}>
              <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.15 }}>Devis NEXUS — {clientName || 'Client'}</h1>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-3)' }}>{date} — {dealName || 'Affaire'} — Estimatif tarif NEXUS 2026-01</div>
              <div style={{ marginTop: 12, fontSize: 16, fontWeight: 800, color: 'var(--color-primary)' }}>Total général : {grandTotal.toLocaleString('fr-FR')} € HT TG</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {draftLines.map((line, index) => {
                const lineKey = getLineKey(line, index)
                const isActive = activePreviewKey === lineKey
                const opts = getLineOptions(line)
                return (
                  <section
                    key={lineKey}
                    ref={(node) => {
                      if (node) previewRefs.current.set(lineKey, node)
                      else previewRefs.current.delete(lineKey)
                    }}
                    style={{ scrollMarginTop: 18, border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 8, background: 'var(--color-surface)', overflow: 'hidden', boxShadow: isActive ? '0 0 0 1px color-mix(in srgb, var(--color-primary) 35%, transparent)' : 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--color-border)', background: isActive ? 'color-mix(in srgb, var(--color-primary) 7%, transparent)' : 'transparent' }}>
                      <span style={{ minWidth: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: gammeColor(line.gamme), color: '#fff', fontSize: 11, fontWeight: 800 }}>{repLetter(index)}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h2 style={{ margin: 0, fontSize: 15, lineHeight: 1.2 }}>Ligne {index + 1} — {line.gamme || line.type_porte || line.line_section || 'Ligne'} {line.vantail || ''}</h2>
                        <div style={{ marginTop: 2, fontSize: 11, color: 'var(--color-text-3)' }}>{line.localisation ? `Localisation : ${line.localisation} · ` : ''}HT H {line.hauteur_mm || '?'} × L {line.largeur_mm || '?'} mm · {passageDimensionText(line)} · {reservationDimensionText(line)}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-primary)' }}>{fmt(line.total_ligne_ht)} HT</div>
                    </div>
                    <div style={{ padding: '12px' }}>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.55, color: 'var(--color-text)', marginBottom: 12 }}>{line.designation || '—'}</div>
                      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, display: 'grid', gridTemplateColumns: 'minmax(120px, 0.35fr) minmax(0, 0.65fr)', gap: '7px 12px', fontSize: 11 }}>
                        <span style={{ color: 'var(--color-text-3)' }}>Dimensions HT</span><strong>H {line.hauteur_mm || '?'} × L {line.largeur_mm || '?'} mm</strong>
                        {line.localisation && <><span style={{ color: 'var(--color-text-3)' }}>Localisation</span><strong>{line.localisation}</strong></>}
                        <span style={{ color: 'var(--color-text-3)' }}>{passageDimensionLabel(getLinePassageDimensions(line))}</span><strong>H {getLinePassageDimensions(line).hauteur_pl_mm || '?'} × L {getLinePassageDimensions(line).largeur_pl_mm || '?'} mm</strong>
                        <span style={{ color: 'var(--color-text-3)' }}>Réservation GO</span><strong>H {getLinePassageDimensions(line).hauteur_reservation_mm || '?'} × L {getLinePassageDimensions(line).largeur_reservation_mm || '?'} mm</strong>
                        <span style={{ color: 'var(--color-text-3)' }}>Prix base TG</span><strong>{fmt(line.prix_base_ht)} HT</strong>
                        {line.serrure_ref && <><span style={{ color: 'var(--color-text-3)' }}>Serrure</span><span>{line.serrure_ref}</span></>}
                        {line.ferme_porte_ref && <><span style={{ color: 'var(--color-text-3)' }}>Ferme-porte</span><span>{line.ferme_porte_ref}</span></>}
                      </div>
                      {opts.length > 0 && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                          <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 6 }}>Options</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, lineHeight: 1.5 }}>
                            {opts.map((option, optionIndex) => <li key={`${lineKey}-option-${optionIndex}`}>{option.label} : +{(option.prix || 0).toLocaleString('fr-FR')} €</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── STEP 6: HUBSPOT SEND ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function StepHubSpot({ devisId, versionId, selectedCompany, selectedDeal, onDealChange, onGoStep, onCreateNewVersion }) {
  const [deals, setDeals] = useState([])
  const [loadingDeals, setLoadingDeals] = useState(false)
  const [devisInfo, setDevisInfo] = useState(null)   // { name, status, hubspot_note_id }
  const [versionInfo, setVersionInfo] = useState(null) // { version_label, title, branch_label, hubspot_note_id, hubspot_file_id }
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [sending, setSending] = useState(false)
  const [creatingVersion, setCreatingVersion] = useState(false)
  const [result, setResult] = useState(null) // { fileId, fileUrl, noteId, filename }
  const [error, setError] = useState('')
  const [hubspotOk, setHubspotOk] = useState(null)

  // Load devis metadata + active version details
  useEffect(() => {
    if (!devisId) return
    setLoadingMeta(true)
    Promise.all([
      api.get(`/devis/${devisId}`).catch(() => null),
      versionId
        ? api.get(`/devis/${devisId}/versions`).then(d => {
            const v = (d.versions || []).find(v => String(v.id) === String(versionId))
            return v || null
          }).catch(() => null)
        : Promise.resolve(null),
    ]).then(([devis, version]) => {
      setDevisInfo(devis)
      setVersionInfo(version)
    }).finally(() => setLoadingMeta(false))
  }, [devisId, versionId])

  // Load company's deals from HubSpot
  useEffect(() => {
    if (!selectedCompany?.id) return
    setLoadingDeals(true)
    api.get(`/prospects/companies/${selectedCompany.id}`)
      .then(data => {
        const list = (data.deals || []).map(d => ({
          id: d.id,
          name: d.properties?.dealname || `Deal #${d.id}`,
          amount: d.properties?.amount || null,
          attachments: d.attachments || [],
        }))
        setDeals(list)
        setHubspotOk(true)
      })
      .catch(err => {
        if (err?.status === 503) setHubspotOk(false)
        else setHubspotOk(true)
      })
      .finally(() => setLoadingDeals(false))
  }, [selectedCompany?.id])

  // Compute version display name (same logic as StepVersions.versionDisplayName)
  const versionDisplayLabel = versionInfo
    ? (versionInfo.title || versionInfo.branch_label || versionInfo.version_label || 'Version de travail')
    : null
  const versionComment = useMemo(() => {
    const comments = (versionInfo?.comments || []).filter(item => item.kind === 'comment' && item.content?.trim())
    return comments.length ? comments[comments.length - 1].content.trim() : ''
  }, [versionInfo?.comments])

  // Compute PDF filename preview (mirrors buildDevisNexusPdf slug logic)
  const baseName = devisInfo?.name || (devisId ? `D${devisId}` : null)
  const enrichedName = baseName && versionDisplayLabel ? `${baseName} — ${versionDisplayLabel}` : baseName
  const slug = enrichedName ? enrichedName.replace(/[^a-zA-Z0-9_-]/g, '_') : null
  const pdfFilename = slug ? `Devis_NEXUS_${slug}.pdf` : null

  // Already sent indicator (from version or devis)
  const alreadySentNoteId = result?.noteId || versionInfo?.hubspot_note_id || devisInfo?.hubspot_note_id || null

  const currentDeal = deals.find(d => String(d.id) === String(selectedDeal?.id)) || null
  const existingAttachments = currentDeal?.attachments || []
  const noteBodyPreview = [
    `Devis NEXUS — ${devisInfo?.client_name || selectedCompany?.name || ''} — ${devisInfo?.name || ''}${versionDisplayLabel ? ` — ${versionDisplayLabel}` : ''}`,
    versionComment ? `Commentaire version : ${versionComment}` : null,
  ].filter(Boolean).join('\n')

  const handleSend = async () => {
    if (!devisId || !selectedDeal?.id) return
    setSending(true)
    setError('')
    setResult(null)
    try {
      const data = await api.post(`/devis/${devisId}/send-hubspot`, {
        deal_id: selectedDeal.id,
        version_id: versionId || undefined,
        note_body: noteBodyPreview,
      })
      setResult(data)
      // Refresh version info to reflect new hubspot_note_id
      if (versionId) {
        api.get(`/devis/${devisId}/versions`).then(d => {
          const v = (d.versions || []).find(v => String(v.id) === String(versionId))
          if (v) setVersionInfo(v)
        }).catch(() => {})
      }
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur lors de l\'envoi vers HubSpot')
    } finally {
      setSending(false)
    }
  }

  const createNewVersion = async () => {
    if (!onCreateNewVersion || creatingVersion) return
    setCreatingVersion(true)
    setError('')
    try {
      await onCreateNewVersion({ sourceVersionId: versionId, sourceLabel: versionDisplayLabel })
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur création nouvelle version')
    } finally {
      setCreatingVersion(false)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', maxWidth: 760, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>Envoyer vers HubSpot</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--color-text-3)' }}>
        Génère le PDF final et le joint à l'affaire HubSpot du client en tant que note avec pièce jointe.
      </p>

      {hubspotOk === false && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'color-mix(in srgb, #ef4444 10%, var(--color-surface))', border: '1px solid #ef4444', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
          <strong>HubSpot non configuré</strong> — La variable <code>HUBSPOT_PRIVATE_APP_TOKEN</code> est manquante sur le serveur.
        </div>
      )}

      {/* ── Document à envoyer ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document à envoyer</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, border: '1.5px solid var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 5%, var(--color-surface))' }}>
          <div style={{ width: 40, height: 48, borderRadius: 5, background: 'color-mix(in srgb, var(--color-primary) 12%, var(--color-surface))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)' }}>
            <FileText size={22} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {loadingMeta ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…
              </div>
            ) : pdfFilename ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfFilename}</div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FolderOpen size={11} /> {versionInfo?.version_label || '—'}{versionDisplayLabel ? ` — ${versionDisplayLabel}` : ''}
                  </span>
                  {devisId && (
                    <span style={{ fontSize: 10, color: 'var(--color-text-3)' }}>Devis #{devisId}</span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--color-text-3)', fontStyle: 'italic' }}>
                {devisId ? 'Chargement du devis…' : 'Aucun devis actif'}
              </div>
            )}
          </div>
          {/* Already sent badge */}
          {alreadySentNoteId && !result && (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'color-mix(in srgb, #22c55e 12%, transparent)', border: '1px solid #22c55e', fontSize: 11, fontWeight: 700, color: '#166534' }}>
              <Check size={11} /> Déjà envoyé
            </div>
          )}
        </div>
      </div>

      {/* ── Texte de note HubSpot ── */}
      {noteBodyPreview && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Texte de la note HubSpot</div>
          <div style={{ whiteSpace: 'pre-wrap', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 12, lineHeight: 1.45, color: 'var(--color-text-2)' }}>
            {noteBodyPreview}
          </div>
        </div>
      )}

      {/* ── Client + Affaire ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Destination HubSpot</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <Building2 size={15} style={{ flexShrink: 0, color: 'var(--color-text-3)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 2 }}>Client</div>
            <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedCompany?.name || <span style={{ color: 'var(--color-text-3)', fontStyle: 'italic' }}>Aucun client sélectionné</span>}
            </div>
          </div>
          {!selectedCompany && (
            <button onClick={() => onGoStep(1)} style={ghostBtn()}>
              <ArrowLeft size={12} /> Étape 1
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <Briefcase size={15} style={{ flexShrink: 0, color: 'var(--color-text-3)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 2 }}>Affaire HubSpot</div>
            {loadingDeals ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…
              </div>
            ) : selectedDeal ? (
              <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedDeal.name}
                {selectedDeal.amount ? <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--color-text-3)', fontSize: 12 }}>{Number(selectedDeal.amount).toLocaleString('fr-FR')} €</span> : null}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--color-text-3)', fontStyle: 'italic' }}>Aucune affaire sélectionnée</div>
            )}
          </div>
        </div>

        {/* Deal picker if company has multiple deals */}
        {deals.length > 1 && (
          <div style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 8 }}>Choisir une autre affaire</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
              {deals.map(d => (
                <button
                  key={d.id}
                  onClick={() => onDealChange({ id: d.id, name: d.name, amount: d.amount })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderRadius: 6, border: `1px solid ${String(d.id) === String(selectedDeal?.id) ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: String(d.id) === String(selectedDeal?.id) ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', color: 'var(--color-text)', fontSize: 12,
                  }}
                >
                  {String(d.id) === String(selectedDeal?.id) && <Check size={12} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  {d.amount && <span style={{ color: 'var(--color-text-3)', flexShrink: 0 }}>{Number(d.amount).toLocaleString('fr-FR')} €</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Pièces jointes existantes ── */}
      {existingAttachments.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pièces jointes existantes sur ce deal</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {existingAttachments.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 12 }}>
                <FileText size={13} style={{ flexShrink: 0, color: 'var(--color-text-3)' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontSize: 11, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                    <ExternalLink size={11} /> Ouvrir
                  </a>
                )}
                <span style={{ fontSize: 10, color: 'var(--color-text-3)', flexShrink: 0 }}>{a.source}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Résultat envoi ── */}
      {result && (
        <div style={{ padding: '14px 16px', borderRadius: 8, background: 'color-mix(in srgb, #22c55e 10%, var(--color-surface))', border: '1px solid #22c55e', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={15} /> PDF envoyé avec succès
          </div>
          <div style={{ fontSize: 12, color: '#166534', marginBottom: 4 }}>{result.filename}</div>
          {result.version_label && <div style={{ fontSize: 11, color: '#166534', opacity: 0.8 }}>Version : {result.version_label}</div>}
          {result.fileUrl && (
            <a href={result.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, color: '#166534', fontSize: 12, fontWeight: 600 }}>
              <ExternalLink size={11} /> Voir le fichier dans HubSpot
            </a>
          )}
          {onCreateNewVersion && (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={createNewVersion} disabled={creatingVersion || !versionId} style={{ ...ghostBtn(), color: '#166534', borderColor: '#22c55e', background: 'rgba(255,255,255,0.35)' }}>
                {creatingVersion ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Copy size={12} />}
                Créer une nouvelle version depuis celle envoyée
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Erreur ── */}
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'color-mix(in srgb, #ef4444 10%, var(--color-surface))', border: '1px solid #ef4444', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* ── Action ── */}
      {!devisId ? (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 13, color: 'var(--color-text-3)' }}>
          Aucun devis actif — retournez à l'étape 1 pour créer ou charger un devis.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleSend}
            disabled={sending || !selectedDeal?.id || hubspotOk === false}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px',
              borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: sending || !selectedDeal?.id ? 'not-allowed' : 'pointer',
              opacity: sending || !selectedDeal?.id || hubspotOk === false ? 0.6 : 1,
            }}
          >
            {sending
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Envoi en cours…</>
              : alreadySentNoteId && !result
                ? <><Send size={14} /> Renvoyer le PDF vers HubSpot</>
                : <><Send size={14} /> Envoyer le PDF vers HubSpot</>
            }
          </button>
          {alreadySentNoteId && onCreateNewVersion && (
            <button type="button" onClick={createNewVersion} disabled={creatingVersion || !versionId} style={ghostBtn()}>
              {creatingVersion ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Copy size={13} />}
              Nouvelle version
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN PAGE ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function DevisStepper() {
  const navigate = useNavigate()

  // Stepper state
  const [step, setStep] = useState(1)
  const [maxReached, setMaxReached] = useState(1)

  // Step 1: client + deal
  const [selectedCompany, setSelectedCompany] = useState(() => {
    try { const s = localStorage.getItem('devis_selected_company'); return s ? JSON.parse(s) : null } catch { return null }
  })
  const [selectedDeal, setSelectedDeal] = useState(() => {
    try { const s = localStorage.getItem('devis_selected_deal'); return s ? JSON.parse(s) : null } catch { return null }
  })

  // Persist selected company/deal in localStorage
  useEffect(() => {
    if (selectedCompany) localStorage.setItem('devis_selected_company', JSON.stringify(selectedCompany))
    else localStorage.removeItem('devis_selected_company')
  }, [selectedCompany])
  useEffect(() => {
    if (selectedDeal) localStorage.setItem('devis_selected_deal', JSON.stringify(selectedDeal))
    else localStorage.removeItem('devis_selected_deal')
  }, [selectedDeal])
  const [existingDevis, setExistingDevis] = useState([])
  const [currentDevisId, setCurrentDevisId] = useState(null)
  const [currentVersionId, setCurrentVersionId] = useState(null)
  const [assistantHighlights, setAssistantHighlights] = useState(null)
  const assistantHighlightTimerRef = useRef(null)

  // Step 3: analysis
  const [results, setResults] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const [aiRow, setAiRow] = useState(null)
  const [aiMessages, setAiMessages] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const fileInputRef = useRef(null)
  const aiEndRef = useRef(null)
  const aiInputRef = useRef(null)

  // Step 4: editor
  const [lines, setLines] = useState([])
  const [editorAiMessages, setEditorAiMessages] = useState([])
  const [editorAiInput, setEditorAiInput] = useState('')
  const [editorAiLoading, setEditorAiLoading] = useState(false)
  const [editorAiHistoryLoading, setEditorAiHistoryLoading] = useState(false)
  const editorAiEndRef = useRef(null)
  const editorAiInputRef = useRef(null)
  const editorAiLoadSeqRef = useRef(0)
  const selectedCompanyId = selectedCompany?.id
  const [companyDetailRefreshKey, setCompanyDetailRefreshKey] = useState(0)
  const restoringUrlRef = useRef(false)
  const lastUrlRef = useRef('')
  // Ref to read current selectedCompany inside restoreFromUrl without creating
  // a reactive dependency that would re-run the restore on every company change.
  const selectedCompanyRef = useRef(selectedCompany)
  useEffect(() => { selectedCompanyRef.current = selectedCompany }, [selectedCompany])

  // Chat panel width ratio (1/3, 1/2, 2/3)
  const [chatRatio, setChatRatio] = useState('1/3')

  const restoreFromUrl = useCallback(async () => {
    const params = new URLSearchParams(window.location.search)
    const nextStep = Math.min(5, Math.max(1, Number(params.get('step')) || 1))
    const companyId = params.get('company')
    const dealId = params.get('deal')
    const devisId = params.get('devis')
    const versionId = params.get('version')

    restoringUrlRef.current = true
    try {
      setStep(nextStep)
      setMaxReached(value => Math.max(value, nextStep))
      if (companyId) {
        const sameStoredCompany = selectedCompanyRef.current?.id && String(selectedCompanyRef.current.id) === String(companyId)
        if (!sameStoredCompany) {
          try {
            const detail = await api.get(`/prospects/companies/${companyId}`)
            const company = detail?.company || {}
            setSelectedCompany({
              id: company.id || companyId,
              name: company.properties?.name || `#${company.id || companyId}`,
              properties: company.properties || {},
              deliveryAddress: companyDeliveryAddress(company),
            })
            if (dealId) {
              const deal = (detail?.deals || []).find(d => String(d.id || d.hs_object_id) === String(dealId))
              if (deal) {
                setSelectedDeal({ id: deal.id || deal.hs_object_id, name: deal.properties?.dealname || `Deal #${dealId}`, amount: deal.properties?.amount })
              }
            }
          } catch {
            // Si HubSpot ne répond pas, on garde le contexte local existant.
          }
        }
      }
      if (devisId) {
        try {
          const detail = await api.get(`/devis/${devisId}`)
          setCurrentDevisId(detail.id)
          setCurrentVersionId(versionId || detail.current_version_id || detail.current_version?.id || null)
          setLines(detail.lines || [])
          if (!companyId && detail.company_id) {
            setSelectedCompany(prev => prev || { id: detail.company_id, name: detail.client_name || `Client #${detail.company_id}` })
          }
          if (!dealId && detail.deal_id) {
            setSelectedDeal(prev => prev || { id: detail.deal_id, name: `Deal #${detail.deal_id}` })
          }
        } catch {
          setCurrentDevisId(null)
          setCurrentVersionId(null)
          setLines([])
        }
      } else {
        setCurrentDevisId(null)
        setCurrentVersionId(null)
        setLines([])
      }
    } finally {
      lastUrlRef.current = `${window.location.pathname}${window.location.search}`
      setTimeout(() => { restoringUrlRef.current = false }, 0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    restoreFromUrl()
    const onPopState = () => { restoreFromUrl() }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [restoreFromUrl])

  useEffect(() => {
    if (restoringUrlRef.current) return
    const params = new URLSearchParams()
    params.set('step', String(step))
    if (selectedCompany?.id) params.set('company', selectedCompany.id)
    if (selectedDeal?.id) params.set('deal', selectedDeal.id)
    if (currentDevisId) params.set('devis', currentDevisId)
    if (currentVersionId) params.set('version', currentVersionId)
    const nextUrl = `${window.location.pathname}?${params.toString()}`
    if (nextUrl === lastUrlRef.current || nextUrl === `${window.location.pathname}${window.location.search}`) return
    window.history.pushState({ step, company: selectedCompany?.id || null, deal: selectedDeal?.id || null, devis: currentDevisId || null, version: currentVersionId || null }, '', nextUrl)
    lastUrlRef.current = nextUrl
  }, [currentDevisId, currentVersionId, selectedCompany?.id, selectedDeal?.id, step])

  // Load existing devis when company changes
  useEffect(() => {
    if (!selectedCompanyId) { setExistingDevis([]); return }
    api.get('/devis').then(all => {
      setExistingDevis(all.filter(d => d.company_id === selectedCompanyId))
    }).catch(() => setExistingDevis([]))
  }, [selectedCompanyId])

  // Load materialized lines whenever the active devis/version changes.
  useEffect(() => {
    if (!currentDevisId || !currentVersionId) return
    let active = true
    api.get(`/devis/${currentDevisId}/lines`)
      .then((nextLines) => { if (active) setLines(nextLines) })
      .catch(() => { if (active) setLines([]) })
    return () => { active = false }
  }, [currentDevisId, currentVersionId])

  // Scroll AI chat
  useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [aiMessages])
  useEffect(() => { editorAiEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [editorAiMessages])

  useEffect(() => {
    if (!currentDevisId) {
      editorAiLoadSeqRef.current += 1
      setEditorAiMessages([])
      setEditorAiHistoryLoading(false)
      return
    }
    const loadSeq = editorAiLoadSeqRef.current + 1
    editorAiLoadSeqRef.current = loadSeq
    let active = true
    setEditorAiMessages([])
    setEditorAiHistoryLoading(true)
    api.get('/devis/ai-messages', {
      params: { devis_id: currentDevisId, version_id: currentVersionId || undefined },
    })
      .then((messages) => {
        if (!active || editorAiLoadSeqRef.current !== loadSeq) return
        setEditorAiMessages(Array.isArray(messages) ? messages : [])
        window.setTimeout(() => editorAiEndRef.current?.scrollIntoView({ behavior: 'auto' }), 0)
      })
      .catch(() => {
        if (!active || editorAiLoadSeqRef.current !== loadSeq) return
        setEditorAiMessages([])
      })
      .finally(() => {
        if (active && editorAiLoadSeqRef.current === loadSeq) setEditorAiHistoryLoading(false)
      })
    return () => { active = false }
  }, [currentDevisId, currentVersionId])

  const saveGemmaMessage = useCallback(async ({ role, content, images = [], agent_slug = null }) => {
    if (!currentDevisId || !content?.trim()) return null
    return api.post('/devis/ai-messages', {
      devis_id: currentDevisId,
      version_id: currentVersionId || null,
      role,
      content,
      images,
      agent_slug,
    })
  }, [currentDevisId, currentVersionId])

  const editGemmaMessage = useCallback(async (messageId, content) => {
    const updated = await api.put(`/devis/ai-messages/${messageId}`, { content })
    setEditorAiMessages(prev => prev.map(message => String(message.id) === String(messageId) ? updated : message))
  }, [])

  const clearGemmaMessages = useCallback(async () => {
    if (!currentDevisId) return
    await api.delete('/devis/ai-messages', {
      data: { devis_id: currentDevisId, version_id: currentVersionId || null },
    })
    setEditorAiMessages([])
  }, [currentDevisId, currentVersionId])

  const refreshLines = useCallback(() => {
    if (!currentDevisId) return Promise.resolve([])
    return api.get(`/devis/${currentDevisId}/lines`)
      .then((nextLines) => {
        setLines(nextLines)
        return nextLines
      })
      .catch(() => [])
  }, [currentDevisId])

  const flashAssistantRows = useCallback((rowsToFlash = [], message = 'Modifié par Gemma') => {
    const indexes = []
    const ids = []
    for (const item of rowsToFlash) {
      if (Number.isInteger(item?.index)) indexes.push(item.index)
      if (item?.id != null) ids.push(String(item.id))
    }
    if (!indexes.length && !ids.length) return
    clearTimeout(assistantHighlightTimerRef.current)
    setAssistantHighlights({ indexes, ids, message, token: Date.now() })
    assistantHighlightTimerRef.current = window.setTimeout(() => setAssistantHighlights(null), 6500)
  }, [])

  useEffect(() => () => clearTimeout(assistantHighlightTimerRef.current), [])

  const applyAssistantLineCommand = useCallback(async (question) => {
    const text = String(question || '').trim()
    if (!text || !currentDevisId) return null
    const performanceCommand = parsePerformanceChangeCommand(text)
    if (performanceCommand) {
      const scopedLineMatch = text.match(/(?:ligne|line)\s*([a-z]|\d+)/i)
      const targetIndexes = scopedLineMatch
        ? [(/^\d+$/.test(scopedLineMatch[1]) ? Number(scopedLineMatch[1]) - 1 : scopedLineMatch[1].toUpperCase().charCodeAt(0) - 65)]
        : lines.map((line, index) => lineContainsPerformance(line, performanceCommand.fromLevel) ? index : -1).filter(index => index >= 0)
      const validIndexes = targetIndexes.filter(index => lines[index])
      if (!validIndexes.length) return `Je ne trouve aucune ligne ${performanceCommand.fromToken} dans le tableau actuel.`

      const nextLines = lines.map((line, index) => validIndexes.includes(index) ? applyPerformanceChangeToLine(line, performanceCommand) : line)
      setLines(nextLines)
      flashAssistantRows(validIndexes.map(index => ({ index, id: nextLines[index]?.id })), `${performanceCommand.fromToken} → ${performanceCommand.toToken}`)
      await Promise.all(validIndexes.map((lineIndex) => {
        const nextLine = nextLines[lineIndex]
        if (!nextLine?.id) return Promise.resolve()
        return api.put(`/devis/${currentDevisId}/lines/${nextLine.id}`, gridRowToLinePayload(dbLineToGridRow(nextLine), lineIndex))
      }))
      await refreshLines()
      const labels = validIndexes.map(index => repLetter(index)).join(', ')
      const pricingNote = performanceCommand.toLevel < performanceCommand.fromLevel
        ? ` Le prix est conservé sur la base ${performanceCommand.fromToken}, conformément à la règle métier de surclassement.`
        : ''
      return `C'est fait : ${performanceCommand.fromToken} remplacé par ${performanceCommand.toToken} sur ${validIndexes.length} ligne${validIndexes.length > 1 ? 's' : ''} (${labels}).${pricingNote}`
    }
    const lineMatch = text.match(/(?:ligne|line)\s*([a-z]|\d+)/i)
    if (!lineMatch) return null
    const rawIndex = lineMatch[1]
    const lineIndex = /^\d+$/.test(rawIndex) ? Number(rawIndex) - 1 : rawIndex.toUpperCase().charCodeAt(0) - 65
    const line = lines[lineIndex]
    if (!line) return `Je ne trouve pas la ligne ${rawIndex.toUpperCase()}.`

    const afterLine = text.slice(lineMatch.index + lineMatch[0].length).trim()
    const fieldPatterns = [
      { key: 'localisation', label: 'localisation', re: /(?:localisation|local|position|rep[èe]re)\s*[:=]?\s*(.+)$/i },
      { key: 'designation', label: 'désignation', re: /(?:d[ée]signation|libell[ée]|nom)\s*[:=]?\s*(.+)$/i },
      { key: 'type_porte', label: 'type produit', re: /(?:type(?:\s+(?:produit|porte))?|produit)\s*[:=]?\s*(.+)$/i },
      { key: 'qty', label: 'quantité', re: /(?:quantit[ée]|qte|qt[ée]|qty)\s*[:=]?\s*(\d+(?:[.,]\d+)?)$/i },
    ]
    let patch = null
    let fieldLabel = ''
    for (const item of fieldPatterns) {
      const match = afterLine.match(item.re)
      if (!match) continue
      const value = match[1].trim().replace(/^['"]|['"]$/g, '')
      if (!value) return `J'ai trouvé la ligne ${repLetter(lineIndex)}, mais pas la nouvelle valeur.`
      patch = { [item.key]: item.key === 'qty' ? Number(value.replace(',', '.')) : value }
      fieldLabel = item.label
      break
    }
    if (!patch) return null

    const nextLine = { ...line, ...patch }
    const nextRows = lines.map((item, index) => index === lineIndex ? nextLine : item)
    setLines(nextRows)
    flashAssistantRows([{ index: lineIndex, id: line.id }], `${fieldLabel} modifiée`)
    await api.put(`/devis/${currentDevisId}/lines/${line.id}`, gridRowToLinePayload(dbLineToGridRow(nextLine), lineIndex))
    await refreshLines()
    return `C'est fait : ligne ${repLetter(lineIndex)}, ${fieldLabel} mis à jour.`
  }, [currentDevisId, flashAssistantRows, lines, refreshLines, setLines])

  const goStep = (n) => {
    setStep(n)
    if (n > maxReached) setMaxReached(n)
  }

  const currentStepperUrl = () => `${window.location.pathname}${window.location.search}`

  // Step 1 handlers
  const handleNewDevis = async (targetDeal = null) => {
    const deal = targetDeal || selectedDeal
    if (!selectedCompany || !deal) return
    try {
      const devis = await api.post('/devis', {
        company_id: selectedCompany.id,
        client_name: selectedCompany.name,
        deal_id: deal.id,
        name: `Devis ${selectedCompany.name} — ${new Date().toLocaleDateString('fr-FR')}`,
      })
      if (targetDeal) setSelectedDeal(targetDeal)
      setExistingDevis((prev) => [devis, ...prev.filter((d) => d.id !== devis.id)])
      setCurrentDevisId(devis.id)
      setCurrentVersionId(devis.current_version_id || devis.current_version?.id || null)
      goStep(2)
    } catch (err) {
      console.error('Create devis error:', err)
    }
  }


  const handleSelectDeal = (deal) => {
    const sameDeal = selectedDeal?.id && deal?.id && String(selectedDeal.id) === String(deal.id)
    if (!sameDeal) {
      setCurrentDevisId(null)
      setCurrentVersionId(null)
      setLines([])
      setResults([])
    }
    setSelectedDeal(deal)
  }

  const handleSelectCompany = (company) => {
    const sameCompany = selectedCompany?.id && company?.id && String(selectedCompany.id) === String(company.id)
    if (!sameCompany) {
      setSelectedDeal(null)
      setCurrentDevisId(null)
      setCurrentVersionId(null)
      setLines([])
      setResults([])
    }
    setSelectedCompany(company)
  }
  const handleCreateDeal = async ({ companyId, dealname, amount, pipeline, dealstage }) => {
    const createdDeal = await api.post(`/prospects/companies/${companyId}/deals`, {
      dealname,
      amount,
      pipeline,
      dealstage,
    })
    setCompanyDetailRefreshKey((value) => value + 1)
    return createdDeal
  }

  const handleUpdateDeal = async ({ dealId, dealname, amount, pipeline, dealstage }) => {
    const updatedDeal = await api.patch(`/prospects/deals/${dealId}`, {
      dealname,
      amount,
      pipeline,
      dealstage,
    })
    setSelectedDeal((previous) => {
      if (!previous || String(previous.id) !== String(dealId)) return previous
      return {
        ...previous,
        name: updatedDeal?.properties?.dealname || dealname || previous.name,
        amount: updatedDeal?.properties?.amount ?? previous.amount,
      }
    })
    return updatedDeal
  }

  const handleOpenDevis = async (d) => {
    try {
      const detail = await api.get(`/devis/${d.id}`)
      setCurrentDevisId(detail.id)
      setCurrentVersionId(detail.current_version_id || detail.current_version?.id || null)
      setLines(detail.lines || [])
      goStep(2)
    } catch (err) {
      console.error('Open devis error:', err)
    }
  }

  const handleDeleteDevis = async (devis) => {
    if (!devis?.id) return
    await api.delete(`/devis/${devis.id}`)
    setExistingDevis((prev) => prev.filter((item) => String(item.id) !== String(devis.id)))
    if (String(currentDevisId) === String(devis.id)) {
      setCurrentDevisId(null)
      setCurrentVersionId(null)
      setLines([])
      setResults([])
      goStep(1)
    }
  }

  // Step 3: analysis
  const analyzeFile = async (f) => {
    setAnalyzing(true)
    setAnalysisError('')
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/devis/analyze', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
      setResults(data.results || [])
      // Save analysis to devis
      if (currentDevisId) {
        api.put(`/devis/${currentDevisId}`, {
          source_file: f.name,
          analysis_json: data.results,
          status: 'analysis',
        }).catch(() => {})
      }
      setExpandedRow(0)
      setAiRow(0)
      setAiMessages([])
    } catch (err) {
      setAnalysisError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const selectRow = (index) => {
    if (aiRow !== index) { setAiRow(index); setAiMessages([]); setAiInput('') }
    setExpandedRow(index)
    setTimeout(() => aiInputRef.current?.focus(), 100)
  }

  const askAI = async (question = aiInput) => {
    const q = (question || aiInput).trim()
    if (!q || aiLoading) return
    const row = aiRow !== null ? results[aiRow] : null
    setAiMessages(prev => [...prev, { role: 'user', content: q }])
    setAiInput('')
    setAiLoading(true)
    try {
      const data = await api.post('/devis/ask', {
        rows: row ? [row] : [],
        question: q,
        mdFiles: row?.docs ?? [],
      })
      setAiMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
    } catch (err) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: `❌ ${err.error || err.message}` }])
    } finally {
      setAiLoading(false)
    }
  }

  // Validate step 3 → push lines to DB → step 4
  const handleValidateAnalysis = async () => {
    if (!currentDevisId || !results.length) return
    try {
      const savedLines = await api.post(`/devis/${currentDevisId}/lines/bulk`, { lines: splitCalculationOptions(results) })
      setLines(savedLines)
      if (currentVersionId) {
        api.post(`/devis/${currentDevisId}/versions/${currentVersionId}/checkpoint`, {
          comment: 'Import analyse IA validé dans la grille',
          step_key: 'analysis',
          status: 'editing',
        }).catch(() => {})
      }
      goStep(3)
    } catch (err) {
      console.error('Bulk import error:', err)
    }
  }

  const handleStartBlankEditor = () => {
    setResults([])
    setLines([])
    setAiRow(null)
    setExpandedRow(null)
    setAiMessages([])
    goStep(3)
  }

  // Step 4: editor AI
  const askAIEditor = async (question = editorAiInput, images = []) => {
    const q = (question || editorAiInput).trim()
    const pastedImages = Array.isArray(images) ? images : []
    if ((!q && !pastedImages.length) || editorAiLoading) return
    const tempUserId = `tmp-user-${Date.now()}`
    const persistedQuestion = `${q || 'Pièce(s) jointe(s)'}${pastedImages.length ? `\n\n[${pastedImages.length} pièce${pastedImages.length > 1 ? 's' : ''} jointe${pastedImages.length > 1 ? 's' : ''}]` : ''}`
    setEditorAiMessages(prev => [...prev, { id: tempUserId, role: 'user', content: persistedQuestion }])
    setEditorAiInput('')
    setEditorAiLoading(true)
    try {
      const previousImages = editorAiMessages
        .filter(message => message.role === 'user')
        .flatMap(message => parseGemmaImages(message.images_json))
        .filter(image => image?.dataUrl || image?.data_url)
        .slice(-4)
      const imagesForAI = [
        ...previousImages.map(image => ({ dataUrl: image.dataUrl || image.data_url, type: image.type, name: image.name })),
        ...pastedImages,
      ].slice(-6)
      const shortHistory = editorAiMessages
        .filter(message => ['user', 'assistant'].includes(message.role) && String(message.content || '').trim())
        .slice(-10)
        .map(message => ({ role: message.role, content: String(message.content || '').trim().slice(0, 1200) }))
      const savedUser = await saveGemmaMessage({ role: 'user', content: persistedQuestion, images: pastedImages }).catch(() => null)
      if (savedUser) {
        setEditorAiMessages(prev => prev.map(message => message.id === tempUserId ? savedUser : message))
      }
      const localAction = pastedImages.length ? null : await applyAssistantLineCommand(q)
      if (localAction) {
        const savedAssistant = await saveGemmaMessage({ role: 'assistant', content: localAction, agent_slug: 'Gemma 4 action' }).catch(() => null)
        setEditorAiMessages(prev => [...prev, savedAssistant || { id: `tmp-assistant-${Date.now()}`, role: 'assistant', content: localAction }])
        return
      }
      // Send current lines as context
      const imageOnlyQuestion = imagesForAI.length > 0 && /\b(image|capture|photo|screenshot|visuel|vois|voir|montre|regarde|pdf|document|fichier|pi[èe]ce jointe)\b/i.test(q)
      const compactRows = imageOnlyQuestion ? [] : lines.slice(0, 120).map(compactLineForAI)
      const compactDocs = [...new Set(compactRows.flatMap(row => Array.isArray(row.docs) ? row.docs : []))]
      const data = await api.post('/devis/ask', {
        devis_id: currentDevisId,
        version_id: currentVersionId || null,
        rows: compactRows,
        question: !imageOnlyQuestion && lines.length > compactRows.length
          ? `${q}\n\nContexte note: devis tronqué aux ${compactRows.length} premières lignes sur ${lines.length} pour rester sous la limite de contexte.`
          : q,
        scope: compactRows.length > 1 ? 'all' : 'line',
        mdFiles: compactDocs,
        history: shortHistory,
        images: imagesForAI.map(image => ({ dataUrl: image.dataUrl || image.data_url, type: image.type, name: image.name })),
      })
      const savedAssistant = await saveGemmaMessage({ role: 'assistant', content: data.answer, agent_slug: 'Gemma 4' }).catch(() => null)
      setEditorAiMessages(prev => [...prev, savedAssistant || { id: `tmp-assistant-${Date.now()}`, role: 'assistant', content: data.answer }])
    } catch (err) {
      const content = `❌ ${err.error || err.message}`
      const savedAssistant = await saveGemmaMessage({ role: 'assistant', content, agent_slug: 'Gemma 4 error' }).catch(() => null)
      setEditorAiMessages(prev => [...prev, savedAssistant || { id: `tmp-assistant-${Date.now()}`, role: 'assistant', content }])
    } finally {
      setEditorAiLoading(false)
    }
  }

  // Step 4 → Step 5: navigate to HubSpot send step
  const handleSendHubSpot = () => goStep(5)

  const handleCreateVersionAfterHubSpot = async ({ sourceVersionId, sourceLabel }) => {
    if (!currentDevisId || !sourceVersionId) return null
    const created = await api.post(`/devis/${currentDevisId}/versions`, {
      source_version_id: sourceVersionId,
      title: `Nouvelle version après envoi HubSpot`,
      comment: `Nouvelle version créée après envoi HubSpot de ${sourceLabel || `version #${sourceVersionId}`}`,
      step_key: 'hubspot',
    })
    setCurrentVersionId(created.id)
    goStep(3)
    return created
  }

  const aiRowData = aiRow !== null ? results[aiRow] : null
  const currentDevis = useMemo(
    () => existingDevis.find((d) => String(d.id) === String(currentDevisId)) || null,
    [currentDevisId, existingDevis]
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeInUp { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>

      <CompactDevisHeader
        step={step}
        maxReached={step >= 4 ? Math.max(maxReached, 5) : step >= 3 ? Math.max(maxReached, 4) : maxReached}
        onStep={goStep}
        selectedCompany={selectedCompany}
        selectedDeal={selectedDeal}
        currentDevis={currentDevis}
        currentVersionId={currentVersionId}
        onOpenExperiences={() => navigate('/experiences', { state: { returnTo: currentStepperUrl(), returnLabel: 'Retour au devis NEXUS' } })}
        onOpenRules={() => navigate('/rules', { state: { returnTo: currentStepperUrl(), returnLabel: 'Retour au devis NEXUS' } })}
        onBackToChat={() => navigate('/chat')}
      />

      {/* Step content + assistant */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {step === 1 && (
            <StepClient
              selectedCompany={selectedCompany}
              selectedDeal={selectedDeal}
              existingDevis={existingDevis}
              onSelect={handleSelectCompany}
              onSelectDeal={handleSelectDeal}
              onCreateDeal={handleCreateDeal}
              onUpdateDeal={handleUpdateDeal}
              onNewDevis={handleNewDevis}
              onOpenDevis={handleOpenDevis}
              onDeleteDevis={handleDeleteDevis}
              detailRefreshKey={companyDetailRefreshKey}
            />
          )}
          {step === 2 && (
            <StepVersions
              devisId={currentDevisId}
              currentVersionId={currentVersionId}
              onVersionSelected={setCurrentVersionId}
              onContinue={() => goStep(3)}
            />
          )}
          {step === 3 && (
            <StepEditor
              devisId={currentDevisId} versionId={currentVersionId} lines={lines} setLines={setLines}
              onRefresh={refreshLines}
              onContinuePdf={() => goStep(4)}
              defaultTransportAddress={companyDeliveryAddress(selectedCompany)}
              askAIEditor={askAIEditor}
              assistantHighlights={assistantHighlights}
            />
          )}
          {step === 4 && (
            <StepPDF
              devisId={currentDevisId} versionId={currentVersionId} lines={lines} setLines={setLines}
              clientName={selectedCompany?.name} dealName={selectedDeal?.name}
              onSendHubSpot={handleSendHubSpot}
            />
          )}
          {step === 5 && (
            <StepHubSpot
              devisId={currentDevisId}
              versionId={currentVersionId}
              selectedCompany={selectedCompany}
              selectedDeal={selectedDeal}
              onDealChange={handleSelectDeal}
              onGoStep={goStep}
              onCreateNewVersion={handleCreateVersionAfterHubSpot}
            />
          )}
        </div>
        <StepperAssistantPanel
          step={step}
          currentDevis={currentDevis}
          selectedCompany={selectedCompany}
          selectedDeal={selectedDeal}
          lines={lines}
          messages={editorAiMessages}
          input={editorAiInput}
          setInput={setEditorAiInput}
          loading={editorAiLoading}
          historyLoading={editorAiHistoryLoading}
          onAsk={askAIEditor}
          onEditMessage={editGemmaMessage}
          onClearMessages={clearGemmaMessages}
          inputRef={editorAiInputRef}
          endRef={editorAiEndRef}
        />
      </div>
    </div>
  )
}
