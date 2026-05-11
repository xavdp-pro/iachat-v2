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
  Pencil, Trash2, Moon, Sun, BookOpen,
} from 'lucide-react'
import { MarkdownRenderer } from '../components/MarkdownRenderer.jsx'
import api from '../api/index.js'
import { useThemeStore } from '../store/useThemeStore.js'
import { DevisGridWorkspace, resolveRow, computePassageDimensions } from './DevisGrid.jsx'

// ── Palette by gamme ─────────────────────────────────────────────────────────
const GAMME_COLORS = {
  BASE: '#64748b', CR3: '#0ea5e9', CR4: '#2563eb', CR5: '#4f46e5',
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

// ══════════════════════════════════════════════════════════════════════════════
// ── STEPPER BAR ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function StepperBar({ step, maxReached, onStep }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0,
      padding: '12px 24px', background: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)', flexShrink: 0,
    }}>
      {STEP_LABELS.map((s, i) => {
        const Icon = s.icon
        const active = step === s.num
        const done = step > s.num
        const reachable = s.num <= maxReached
        return (
          <div key={s.num} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <div style={{
                width: 48, height: 2, borderRadius: 1,
                background: done ? 'var(--color-primary)' : 'var(--color-border)',
                margin: '0 4px',
              }} />
            )}
            <button

              onClick={() => reachable && onStep(s.num)}
              disabled={!reachable}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: '20px',
                border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: active
                  ? 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))'
                  : done
                    ? 'color-mix(in srgb, var(--color-primary) 5%, var(--color-surface))'
                    : 'var(--color-surface)',
                color: active ? 'var(--color-primary)' : done ? 'var(--color-text)' : 'var(--color-text-3)',
                fontWeight: active ? 700 : 500, fontSize: '12px',
                cursor: reachable ? 'pointer' : 'default',
                opacity: reachable ? 1 : 0.5,
                transition: 'all 0.15s',
              }}
            >
              {done ? <Check size={13} /> : <Icon size={13} />}
              <span>{s.label}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function WorkflowContextBar({ selectedCompany, selectedDeal, currentDevis, currentVersionId }) {
  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
    padding: '8px 10px', borderRadius: 8,
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  }
  const labelStyle = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-3)', fontWeight: 800 }
  const valueStyle = { fontSize: 12, color: 'var(--color-text)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const emptyStyle = { ...valueStyle, color: 'var(--color-text-3)', fontWeight: 600 }

  return (
    <div style={{ flexShrink: 0, padding: '10px 24px', borderBottom: '1px solid var(--color-border)', background: 'color-mix(in srgb, var(--color-surface) 72%, var(--color-bg))' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <div style={itemStyle} title={selectedCompany?.name || 'Aucun client sélectionné'}>
          <Building2 size={15} color={selectedCompany ? 'var(--color-primary)' : 'var(--color-text-3)'} />
          <div style={{ minWidth: 0 }}>
            <div style={labelStyle}>Client</div>
            <div style={selectedCompany ? valueStyle : emptyStyle}>{selectedCompany?.name || 'À sélectionner'}</div>
          </div>
        </div>
        <div style={itemStyle} title={selectedDeal?.name || 'Aucun projet sélectionné'}>
          <Briefcase size={15} color={selectedDeal ? 'var(--color-primary)' : 'var(--color-text-3)'} />
          <div style={{ minWidth: 0 }}>
            <div style={labelStyle}>Projet / deal</div>
            <div style={selectedDeal ? valueStyle : emptyStyle}>{selectedDeal?.name || 'À sélectionner'}</div>
          </div>
        </div>
        <div style={itemStyle} title={currentDevis?.name || 'Aucun devis ouvert'}>
          <FileText size={15} color={currentDevis ? 'var(--color-primary)' : 'var(--color-text-3)'} />
          <div style={{ minWidth: 0 }}>
            <div style={labelStyle}>Devis</div>
            <div style={currentDevis ? valueStyle : emptyStyle}>{currentDevis?.name || 'Aucun devis ouvert'}</div>
          </div>
        </div>
        <div style={itemStyle} title={currentVersionId ? `Version #${currentVersionId}` : 'Aucune version active'}>
          <FolderOpen size={15} color={currentVersionId ? 'var(--color-primary)' : 'var(--color-text-3)'} />
          <div style={{ minWidth: 0 }}>
            <div style={labelStyle}>Version</div>
            <div style={currentVersionId ? valueStyle : emptyStyle}>{currentVersionId ? `Version #${currentVersionId}` : 'À choisir / créer'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── STEP 1: CLIENT & DEAL SELECTION ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function StepClient({ onSelect, selectedCompany, selectedDeal, existingDevis, onSelectDeal, onCreateDeal, onNewDevis, onOpenDevis, detailRefreshKey = 0, onUpdateDeal }) {
  const [query, setQuery] = useState('')
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchDone, setSearchDone] = useState(false)
  const [companyDetail, setCompanyDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [editingDealId, setEditingDealId] = useState(null)
  const [editingDealName, setEditingDealName] = useState('')
  const [savingDealId, setSavingDealId] = useState(null)
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
    Promise.resolve().then(async () => {
      setDetailLoading(true)
      try {
        const detail = await api.get(`/prospects/companies/${selectedCompanyId}`)
        if (active) setCompanyDetail(detail)
      } catch {
        if (active) setCompanyDetail(null)
      } finally {
        if (active) setDetailLoading(false)
      }
    })
    return () => { active = false }
  }, [selectedCompanyId, detailRefreshKey])

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
        return {
          ...prev,
          deals: (prev.deals || []).map((d) =>
            String(d.id) === String(dealId)
              ? { ...d, properties: { ...d.properties, dealname: newName } }
              : d
          ),
        }
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'auto', padding: '30px 20px', position: 'relative' }}>
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

            {detailLoading ? (
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
                    <div style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>Le devis sera attaché au projet sélectionné.</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {deals.map((d) => {
                    const dId = d.id || d.hs_object_id
                    const active = selectedDeal?.id === dId
                    const isEditing = editingDealId === dId
                    const dealName = d.properties?.dealname || `Deal #${dId}`
                    const devisCount = dealDevisCount.get(String(dId)) || 0
                    const createdDate = d.properties?.createdate
                      ? new Date(d.properties.createdate).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                      : 'n/d'
                    const modifiedDate = d.properties?.hs_lastmodifieddate
                      ? new Date(d.properties.hs_lastmodifieddate).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                      : 'n/d'
                    return (
                      <div
                        key={dId}
                        onClick={() => onSelectDeal({ id: dId, name: dealName, amount: d.properties?.amount })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          borderRadius: '8px', cursor: 'pointer',
                          border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                          background: active ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))' : 'var(--color-surface)',
                          transition: 'all 0.12s',
                        }}
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
                            {` · ${devisCount} devis`}
                            {` · créé ${createdDate}`}
                            {` · modifié ${modifiedDate}`}
                          </div>
                        </div>
                        {!isEditing && active && (
                          <span style={{ flexShrink: 0, padding: '3px 7px', borderRadius: 999, background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)', fontSize: 10, fontWeight: 800 }}>
                            sélectionné
                          </span>
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
                              onClick={(event) => { event.stopPropagation(); /* TODO: delete */ }}
                              style={{ ...iconBtn(), color: 'var(--color-danger, #e53e3e)' }}
                              title="Supprimer ce deal"
                            >
                              <Trash2 size={13} />
                            </button>
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

        {/* Existing devis for selected deal */}
        {selectedCompany && selectedDeal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px' }}>
            <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'var(--color-primary)', color: '#fff', fontSize: 11, fontWeight: 800 }}>3</span>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800 }}>Reprendre un devis ou en créer un nouveau</div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>Les versions se trouvent dans chaque devis existant.</div>
            </div>
          </div>
        )}
        {selectedCompany && selectedDeal && devisForSelectedDeal.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 8, color: 'var(--color-text-2)' }}>
              Devis existants pour ce deal ({devisForSelectedDeal.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {devisForSelectedDeal.map((d) => (
                <div
                  key={d.id}
                  onClick={() => onOpenDevis(d)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: '8px', cursor: 'pointer',
                    border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-input-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
                >
                  <FileText size={16} color="var(--color-primary)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '12px' }}>{d.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>
                      {d.status} · {new Date(d.updated_at).toLocaleDateString('fr-FR')}
                      {` · ${Number(d.versions_count || 0)} version${Number(d.versions_count || 0) > 1 ? 's' : ''}`}
                      {d.total_ht ? ` · ${Number(d.total_ht).toLocaleString('fr-FR')} €` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); onOpenDevis(d) }}
                    style={{ ...ghostBtn(), color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                    title="Ouvrir les versions de ce devis"
                  >
                    <FolderOpen size={12} />
                    Ouvrir versions
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {selectedCompany && selectedDeal && devisForSelectedDeal.length === 0 && (
          <div style={{ marginBottom: 20, padding: 14, border: '1px dashed var(--color-border)', borderRadius: 10, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={18} color="var(--color-text-3)" />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>Aucun devis pour ce projet</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>Créez le premier devis ci-dessous. La version V1 sera créée automatiquement.</div>
            </div>
          </div>
        )}

        {/* Create new button */}
        {selectedCompany && (
          <button
            onClick={onNewDevis}
            disabled={!selectedDeal}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '12px', borderRadius: '10px',
              border: '1px solid transparent',
              background: selectedDeal ? 'var(--color-primary)' : 'var(--color-border)',
              color: selectedDeal ? '#fff' : 'var(--color-text-3)',
              fontWeight: 700, fontSize: '13px',
              cursor: selectedDeal ? 'pointer' : 'not-allowed',
              opacity: selectedDeal ? 1 : 0.72,
            }}
          >
            <Plus size={16} />
            {selectedDeal ? `Créer un nouveau devis pour ${selectedDeal.name}` : 'Sélectionnez un projet pour créer un devis'}
          </button>
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
  const [comment, setComment] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [editingVersionId, setEditingVersionId] = useState(null)
  const [editingVersionTitle, setEditingVersionTitle] = useState('')
  const [savingVersionId, setSavingVersionId] = useState(null)
  const [draftSavedAt, setDraftSavedAt] = useState(null)
  const [commentSavedAt, setCommentSavedAt] = useState(null)

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
  const activeSavedComment = useMemo(() => {
    const comments = (activeVersion?.comments || []).filter(item => item.kind === 'comment')
    return comments.length ? comments[comments.length - 1] : null
  }, [activeVersion?.comments])
  const commentDraftKey = useMemo(() => (
    devisId && activeVersionId ? `devis_version_comment_draft_${devisId}_${activeVersionId}` : null
  ), [activeVersionId, devisId])

  useEffect(() => {
    if (!commentDraftKey) {
      setComment('')
      setDraftSavedAt(null)
      setCommentSavedAt(null)
      return
    }
    try {
      const savedDraft = localStorage.getItem(commentDraftKey)
      setComment(savedDraft || activeSavedComment?.content || '')
      setDraftSavedAt(savedDraft ? 'restauré' : null)
      setCommentSavedAt(null)
    } catch {
      setDraftSavedAt(null)
    }
  }, [activeSavedComment?.content, commentDraftKey])

  const handleCommentChange = (nextComment) => {
    setComment(nextComment)
    setCommentSavedAt(null)
    if (!commentDraftKey) return
    try {
      if (nextComment.trim()) {
        localStorage.setItem(commentDraftKey, nextComment)
        setDraftSavedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
      } else {
        localStorage.removeItem(commentDraftKey)
        setDraftSavedAt(null)
      }
    } catch {
      setError('Impossible d’enregistrer le brouillon localement')
    }
  }

  const clearCommentDraft = () => {
    if (!commentDraftKey) return
    try { localStorage.removeItem(commentDraftKey) } catch {}
    setDraftSavedAt(null)
  }
  const versionById = useMemo(() => {
    const map = new Map()
    for (const version of versions) map.set(version.id, version)
    return map
  }, [versions])
  const versionDisplayName = useCallback((version) => (
    version?.title || version?.branch_label || version?.version_label || 'Version de travail'
  ), [])
  const childrenByParent = useMemo(() => {
    const map = new Map()
    for (const version of versions) {
      const key = version.parent_version_id || 0
      const list = map.get(key) || []
      list.push(version)
      map.set(key, list)
    }
    return map
  }, [versions])
  const orderedVersions = useMemo(() => {
    const out = []
    const walk = (parentId, depth) => {
      for (const version of childrenByParent.get(parentId) || []) {
        out.push({ ...version, _depth: depth })
        walk(version.id, depth + 1)
      }
    }
    walk(0, 0)
    return out.length ? out : versions.map(version => ({ ...version, _depth: 0 }))
  }, [childrenByParent, versions])

  const activateVersion = async (version) => {
    if (!version || !devisId) return
    if (String(version.id) === String(activeVersionId)) return
    setBusyId(version.id)
    try {
      await api.post(`/devis/${devisId}/versions/${version.id}/activate`)
      onVersionSelected?.(version.id)
      await loadVersions()
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur activation version')
    } finally {
      setBusyId(null)
    }
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

  const duplicateVersion = async (version) => {
    if (!version || !devisId) return
    setBusyId(`dup-${version.id}`)
    const sourceName = versionDisplayName(version)
    try {
      const created = await api.post(`/devis/${devisId}/versions`, {
        source_version_id: version.id,
        branch_label: version.branch_label || null,
        title: `Copie de ${sourceName}`,
        comment: comment.trim() || `Nouvelle version depuis ${sourceName}`,
        step_key: 'versions',
      })
      onVersionSelected?.(created.id)
      clearCommentDraft()
      setComment('')
      await loadVersions()
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur duplication version')
    } finally {
      setBusyId(null)
    }
  }

  const saveComment = async () => {
    if (!activeVersion || !comment.trim()) return
    setBusyId(`comment-${activeVersion.id}`)
    try {
      if (activeSavedComment?.id) {
        await api.patch(`/devis/${devisId}/versions/${activeVersion.id}/comments/${activeSavedComment.id}`, {
          content: comment.trim(),
        })
      } else {
        await api.post(`/devis/${devisId}/versions/${activeVersion.id}/comments`, {
          content: comment.trim(),
          step_key: 'versions',
          kind: 'comment',
        })
      }
      clearCommentDraft()
      setCommentSavedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
      await loadVersions()
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur enregistrement commentaire')
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
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Versions du devis</h2>
            <p style={{ margin: 0, color: 'var(--color-text-2)', fontSize: 13 }}>
              Ouvrez une version existante, créez une nouvelle version depuis celle-ci, puis continuez vers la grille.
            </p>
          </div>
          <button type="button" onClick={loadVersions} style={ghostBtn()} disabled={loading}>
            {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
            Actualiser
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, color: '#dc2626', background: 'rgba(220,38,38,0.08)', fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14, padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-2)' }}><strong style={{ color: 'var(--color-text)' }}>1. Ouvrir</strong><br />Sélectionnez la version à modifier.</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-2)' }}><strong style={{ color: 'var(--color-text)' }}>2. Nouvelle version</strong><br />Créez une copie avant de changer le devis.</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-2)' }}><strong style={{ color: 'var(--color-text)' }}>3. Continuer</strong><br />Passez à la grille.</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1fr) minmax(280px, 0.8fr)', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orderedVersions.map(version => {
              const active = version.id === activeVersionId
              const isEditingVersion = editingVersionId === version.id
              const parentVersion = version.parent_version_id ? versionById.get(version.parent_version_id) : null
              const sourceLabel = parentVersion ? `Nouvelle version depuis ${versionDisplayName(parentVersion)}` : null
              const latestComment = version.comments?.[version.comments.length - 1]?.content || ''
              const showLatestComment = latestComment && latestComment !== sourceLabel && !latestComment.startsWith('Nouvelle version depuis ')
              return (
                <div key={version.id} style={{ marginLeft: version._depth * 22 }}>
                  <div
                    onClick={() => activateVersion(version)}
                    style={{ border: active ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)', borderRadius: 8, background: active ? 'color-mix(in srgb, var(--color-primary) 6%, var(--color-surface))' : 'var(--color-surface)', padding: 12, cursor: active ? 'default' : 'pointer' }}
                    title={active ? 'Version active' : 'Cliquer pour ouvrir cette version'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 34, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: active ? 'var(--color-primary)' : 'var(--color-surface-2, var(--color-input-bg))', color: active ? '#fff' : 'var(--color-text)', fontWeight: 800, fontSize: 11 }}>
                        {version.version_label}
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
                          {statusLabel(version.status)} · {Number(version.total_ht || 0).toLocaleString('fr-FR')} € HT · {version.comments?.length || 0} commentaire{(version.comments?.length || 0) > 1 ? 's' : ''}
                        </div>
                      </div>
                      {version.locked && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>verrouillée</span>}
                    </div>
                    {sourceLabel && (
                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-2)', borderLeft: '2px solid var(--color-border)', paddingLeft: 8 }}>
                        {sourceLabel}
                      </div>
                    )}
                    {showLatestComment && (
                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-2)', borderLeft: '2px solid var(--color-border)', paddingLeft: 8 }}>
                        {latestComment}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <button type="button" onClick={(event) => { event.stopPropagation(); activateVersion(version) }} style={ghostBtn()} disabled={busyId === version.id || active}>
                        {busyId === version.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
                        {active ? 'Active' : 'Ouvrir'}
                      </button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); duplicateVersion(version) }} style={ghostBtn()} disabled={busyId === `dup-${version.id}`}>
                        {busyId === `dup-${version.id}` ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Copy size={12} />}
                        Nouvelle version
                      </button>
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

          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface)', padding: 14, alignSelf: 'start' }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Version active</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 12 }}>
              {activeVersion ? `${activeVersion.version_label} · ${statusLabel(activeVersion.status)}` : 'Aucune version active'}
            </div>
            <textarea
              value={comment}
              onChange={e => handleCommentChange(e.target.value)}
              rows={4}
              placeholder="Commentaire interne / raison de la branche…"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-input-bg, var(--color-bg))', color: 'var(--color-text)', padding: 10, fontSize: 12, resize: 'vertical', outline: 'none', fontFamily: 'var(--font-body)' }}
            />
            <div style={{ marginTop: 6, minHeight: 14, fontSize: 10, color: 'var(--color-text-3)' }}>
              {commentSavedAt
                ? `Commentaire enregistré à ${commentSavedAt}`
                : draftSavedAt
                  ? `Brouillon ${draftSavedAt === 'restauré' ? 'restauré' : `auto-enregistré à ${draftSavedAt}`}`
                  : 'Le texte est gardé en brouillon local pendant la saisie.'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={saveComment} style={{ ...ghostBtn(), color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }} disabled={!activeVersion || !comment.trim() || busyId === `comment-${activeVersion?.id}`}>
                {busyId === `comment-${activeVersion?.id}` ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
                Enregistrer
              </button>
            </div>
            <button
              type="button"
              onClick={() => activeVersion && onContinue?.()}
              disabled={!activeVersion}
              style={{ marginTop: 16, width: '100%', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, cursor: activeVersion ? 'pointer' : 'default', opacity: activeVersion ? 1 : 0.5 }}
            >
              Continuer avec cette version <ArrowRight size={14} />
            </button>
          </div>
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
  const { darkMode, toggleDarkMode } = useThemeStore()

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
  const [linkCopied, setLinkCopied] = useState(false)
  const editorAiEndRef = useRef(null)
  const editorAiInputRef = useRef(null)
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

  const goStep = (n) => {
    setStep(n)
    if (n > maxReached) setMaxReached(n)
  }

  const copyBookmarkLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1800)
    } catch {
      setLinkCopied(false)
    }
  }

  const currentStepperUrl = () => `${window.location.pathname}${window.location.search}`

  // Step 1 handlers
  const handleNewDevis = async () => {
    if (!selectedCompany || !selectedDeal) return
    try {
      const devis = await api.post('/devis', {
        company_id: selectedCompany.id,
        client_name: selectedCompany.name,
        deal_id: selectedDeal.id,
        name: `Devis ${selectedCompany.name} — ${new Date().toLocaleDateString('fr-FR')}`,
      })
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
  const askAIEditor = async (question = editorAiInput) => {
    const q = (question || editorAiInput).trim()
    if (!q || editorAiLoading) return
    setEditorAiMessages(prev => [...prev, { role: 'user', content: q }])
    setEditorAiInput('')
    setEditorAiLoading(true)
    try {
      // Send current lines as context
      const data = await api.post('/devis/ask', {
        rows: lines.map(l => ({
          gamme: l.gamme, vantail: l.vantail, type: l.type_porte,
          dim_standard: { h: l.hauteur_mm, l: l.largeur_mm },
          prix_base_ht: l.prix_base_ht, prix_total_min_ht: l.total_ligne_ht,
          options: (() => { try { return JSON.parse(l.options_json || '[]') } catch { return [] } })(),
          serrure: l.serrure_ref ? { ref: l.serrure_ref } : null,
          ferme_porte: l.ferme_porte_ref ? { ref: l.ferme_porte_ref } : null,
        })),
        question: q,
        mdFiles: ['GUIDE-DEVIS.md', 'BASE.md', 'CR4.md', 'CR5.md'],
      })
      setEditorAiMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
    } catch (err) {
      setEditorAiMessages(prev => [...prev, { role: 'assistant', content: `❌ ${err.error || err.message}` }])
    } finally {
      setEditorAiLoading(false)
    }
  }

  const refreshLines = () => {
    if (!currentDevisId) return Promise.resolve([])
    return api.get(`/devis/${currentDevisId}/lines`)
      .then((nextLines) => {
        setLines(nextLines)
        return nextLines
      })
      .catch(() => [])
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

      {/* Topbar */}
      <header className="admin-topbar" style={{ borderRadius: 0, flexShrink: 0, margin: 0 }}>
        <div className="admin-topbar-brand">
          <div className="admin-topbar-mark"><FileSpreadsheet size={18} strokeWidth={2} /></div>
          <div className="admin-topbar-text">
            <h1>Devis NEXUS</h1>
            <p>
              {selectedCompany ? `${selectedCompany.name}` : 'Chiffrage portes NEXUS 2026'}
              {selectedDeal ? ` — ${selectedDeal.name}` : ''}
            </p>
          </div>
        </div>
        <div className="admin-topbar-actions">
          {step > 1 && (
            <button className="admin-btn-ghost" onClick={() => goStep(step - 1)} style={{ fontSize: '0.8125rem' }}>
              <ArrowLeft size={14} /> Étape précédente
            </button>
          )}
          <button
            type="button"
            className="admin-btn-ghost"
            onClick={toggleDarkMode}
            title={darkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
            aria-label={darkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            <span>{darkMode ? 'Mode clair' : 'Mode sombre'}</span>
          </button>
          <button type="button" className="admin-btn-ghost" onClick={copyBookmarkLink} title="Copier le lien direct vers ce contexte">
            {linkCopied ? <Check size={16} /> : <Copy size={16} />}
            <span>{linkCopied ? 'Lien copié' : 'Copier lien'}</span>
          </button>
          <button type="button" className="admin-btn-ghost" onClick={() => navigate('/experiences', { state: { returnTo: currentStepperUrl(), returnLabel: 'Retour au devis NEXUS' } })}>
            <BookOpen size={16} />
            <span>Expériences</span>
          </button>
          <button type="button" className="admin-btn-ghost" onClick={() => navigate('/rules', { state: { returnTo: currentStepperUrl(), returnLabel: 'Retour au devis NEXUS' } })}>
            <Shield size={16} />
            <span>Règles</span>
          </button>
          <button type="button" className="admin-btn-ghost" onClick={() => navigate('/chat')}>
            <MessageCircleReply size={16} />
            <span>Retour au chat</span>
          </button>
        </div>
      </header>

      {/* Stepper bar */}
      <StepperBar step={step} maxReached={step >= 4 ? Math.max(maxReached, 5) : step >= 3 ? Math.max(maxReached, 4) : maxReached} onStep={goStep} />

      <WorkflowContextBar
        selectedCompany={selectedCompany}
        selectedDeal={selectedDeal}
        currentDevis={currentDevis}
        currentVersionId={currentVersionId}
      />

      {/* Step content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
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
            aiMessages={editorAiMessages} aiInput={editorAiInput} setAiInput={setEditorAiInput}
            aiLoading={editorAiLoading} askAIEditor={askAIEditor}
            aiEndRef={editorAiEndRef} aiInputRef={editorAiInputRef}
            chatRatio={chatRatio} setChatRatio={setChatRatio}
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
    </div>
  )
}
