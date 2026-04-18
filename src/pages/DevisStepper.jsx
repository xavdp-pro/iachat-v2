/**
 * DevisStepper.jsx — Stepper-based NEXUS quote workflow
 * 4 steps: Client → Analysis → Line Editor → PDF/HubSpot
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileSpreadsheet, Loader2, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, ArrowLeft, ArrowRight,
  AlertTriangle, Bot, Send, X, FileText, Printer, Copy,
  Check, Info, Euro, Shield, Search, Building2,
  Wrench, Package, Sparkles, RefreshCw, Plus, Trash2,
  MessageCircleReply, Clock, FolderOpen, LayoutGrid, LayoutPanelLeft, PanelBottom,
  Briefcase, User, Hash, ExternalLink, Download, Columns3, Columns2, Columns,
} from 'lucide-react'
import { MarkdownRenderer } from '../components/MarkdownRenderer.jsx'
import api from '../api/index.js'

// ── Palette by gamme ─────────────────────────────────────────────────────────
const GAMME_COLORS = {
  BASE: '#64748b', CR3: '#0ea5e9', CR4: '#2563eb', CR5: '#4f46e5',
  CR6: '#7c3aed', EI60: '#d97706', EI120: '#c2410c', FB6: '#dc2626',
  FB7: '#7f1d1d', ANTI: '#374151', PRISON: '#111827',
}
const gammeColor = (g = '') => {
  const upper = g.toUpperCase()
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

const STEP_LABELS = [
  { num: 1, label: 'Client', icon: Building2 },
  { num: 2, label: 'Analyse IA', icon: Bot },
  { num: 3, label: 'Éditeur devis', icon: FileText },
  { num: 4, label: 'Générer PDF', icon: Download },
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

// ══════════════════════════════════════════════════════════════════════════════
// ── STEP 1: CLIENT & DEAL SELECTION ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function StepClient({ onSelect, selectedCompany, selectedDeal, existingDevis, onSelectDeal, onNewDevis, onOpenDevis }) {
  const [query, setQuery] = useState('')
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchDone, setSearchDone] = useState(false)
  const [companyDetail, setCompanyDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const timerRef = useRef(null)

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setCompanies([]); setSearchDone(false); return }
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
    if (!selectedCompany) { setCompanyDetail(null); return }
    setDetailLoading(true)
    api.get(`/prospects/companies/${selectedCompany.id}`)
      .then(d => setCompanyDetail(d))
      .catch(() => setCompanyDetail(null))
      .finally(() => setDetailLoading(false))
  }, [selectedCompany?.id])

  const selectCompany = (c) => {
    onSelect({
      id: c.id || c.hs_object_id,
      name: c.properties?.name || c.name || `#${c.id}`,
    })
    setQuery('')
    setCompanies([])
  }

  const deals = companyDetail?.deals || []

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'auto', padding: '30px 20px' }}>
      <div style={{ width: '100%', maxWidth: 680 }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: 4 }}>Sélection du client</h2>
        <p style={{ fontSize: '13px', color: 'var(--color-text-2)', marginBottom: 20 }}>
          Recherchez un client HubSpot, sélectionnez le deal, puis créez un nouveau devis ou reprenez un existant.
        </p>

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
              <button onClick={() => onSelect(null)} style={{ ...iconBtn(), marginLeft: 'auto' }} title="Changer de client">
                <X size={16} />
              </button>
            </div>

            {detailLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-3)', fontSize: '12px', padding: 8 }}>
                <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Chargement des deals…
              </div>
            ) : deals.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--color-text-3)', padding: '8px 0' }}>
                Aucun deal associé à ce client.
              </div>
            ) : (
              <>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 8, color: 'var(--color-text-2)' }}>
                  Deals ({deals.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {deals.map((d) => {
                    const dId = d.id || d.hs_object_id
                    const active = selectedDeal?.id === dId
                    return (
                      <div
                        key={dId}
                        onClick={() => onSelectDeal({ id: dId, name: d.properties?.dealname || `Deal #${dId}`, amount: d.properties?.amount })}
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
                          <div style={{ fontWeight: 600, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.properties?.dealname || `Deal #${dId}`}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>
                            {d.properties?.dealstage || '—'} {d.properties?.amount ? `· ${Number(d.properties.amount).toLocaleString('fr-FR')} €` : ''}
                          </div>
                        </div>
                        {active && <Check size={14} color="var(--color-primary)" />}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Existing devis for this company */}
        {selectedCompany && existingDevis.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 8, color: 'var(--color-text-2)' }}>
              Devis existants
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {existingDevis.map((d) => (
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
                  <FileText size={14} color="var(--color-primary)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '12px' }}>{d.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-3)' }}>
                      {d.status} · {new Date(d.updated_at).toLocaleDateString('fr-FR')}
                      {d.total_ht ? ` · ${Number(d.total_ht).toLocaleString('fr-FR')} €` : ''}
                    </div>
                  </div>
                  <ArrowRight size={14} color="var(--color-text-3)" />
                </div>
              ))}
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
              border: 'none', background: 'var(--color-primary)', color: '#fff',
              fontWeight: 700, fontSize: '13px', cursor: selectedDeal ? 'pointer' : 'default',
              opacity: selectedDeal ? 1 : 0.5,
            }}
          >
            <Plus size={16} />
            Nouveau devis {selectedDeal ? `pour ${selectedDeal.name}` : '(sélectionnez un deal)'}
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
// ── STEP 2: ANALYSIS (existing UI) ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function StepAnalysis({
  results, analyzing, error, expandedRow, setExpandedRow,
  aiRow, selectRow, fileInputRef, analyzeFile,
  aiRowData, aiMessages, aiInput, setAiInput, aiLoading, askAI, aiEndRef, aiInputRef,
  onValidate, chatRatio, setChatRatio,
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
  devisId, lines, setLines, onRefresh,
  aiMessages, aiInput, setAiInput, aiLoading, askAIEditor, aiEndRef, aiInputRef,
}) {
  const [saving, setSaving] = useState(null)
  const [chatHeight, setChatHeight] = useState(300)
  const isResizing = useRef(false)
  const startY = useRef(null)
  const startH = useRef(null)

  const onMouseDown = useCallback(e => {
    e.preventDefault()
    isResizing.current = true
    startY.current = e.clientY
    startH.current = chatHeight

    const onMouseMove = moveE => {
      if (!isResizing.current) return
      const delta = startH.current + (startY.current - moveE.clientY)
      const newH = Math.max(150, Math.min(window.innerHeight * 0.8, delta))
      setChatHeight(newH)
    }
    const onMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [chatHeight])

  const updateLine = async (lineId, field, value) => {
    setSaving(lineId)
    try {
      const payload = { [field]: value }
      // Recalculate total_ligne_ht if price-related field changes
      const line = lines.find(l => l.id === lineId)
      if (['prix_base_ht', 'serrure_prix', 'ferme_porte_prix'].includes(field)) {
        const updated = { ...line, [field]: value }
        const optTotal = (JSON.parse(updated.options_json || '[]')).reduce((s, o) => s + (o.prix || 0), 0)
        payload.total_ligne_ht = (Number(updated.prix_base_ht) || 0) + optTotal + (Number(updated.serrure_prix) || 0) + (Number(updated.ferme_porte_prix) || 0)
      }
      await api.put(`/devis/${devisId}/lines/${lineId}`, payload)
      onRefresh()
    } catch (err) {
      console.error('Update line error:', err)
    } finally {
      setSaving(null)
    }
  }

  const addLine = async () => {
    try {
      await api.post(`/devis/${devisId}/lines`, { designation: 'Nouvelle ligne', gamme: 'BASE', vantail: '1V' })
      onRefresh()
    } catch (err) {
      console.error('Add line error:', err)
    }
  }

  const deleteLine = async (lineId) => {
    try {
      await api.delete(`/devis/${devisId}/lines/${lineId}`)
      onRefresh()
    } catch (err) {
      console.error('Delete line error:', err)
    }
  }

  const grandTotal = lines.reduce((s, l) => s + (Number(l.total_ligne_ht) || 0), 0)

  const handleKeyDown = (e, rowIdx, colIdx) => {
    const cols = ['designation', 'gamme', 'vantail', 'hauteur', 'largeur', 'prix']
    if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
      e.preventDefault()
      const nr = e.key === 'ArrowUp' ? Math.max(0, rowIdx - 1) : Math.min(lines.length - 1, rowIdx + 1)
      const el = document.getElementById(`cell-${nr}-${cols[colIdx]}`)
      if (el) { el.focus(); setTimeout(() => el.select(), 0) }
    } else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length) {
      e.preventDefault()
      const nc = Math.min(cols.length - 1, colIdx + 1)
      const el = document.getElementById(`cell-${rowIdx}-${cols[nc]}`)
      if (el) { el.focus(); setTimeout(() => el.select(), 0) }
    } else if (e.key === 'ArrowLeft' && e.target.selectionEnd === 0) {
      e.preventDefault()
      const nc = Math.max(0, colIdx - 1)
      const el = document.getElementById(`cell-${rowIdx}-${cols[nc]}`)
      if (el) { el.focus(); setTimeout(() => el.select(), 0) }
    }
  }

  const tdStyle = { padding: 0, border: '1px solid var(--color-border)', position: 'relative', background: 'var(--color-surface)', verticalAlign: 'middle' }
  const roStyle = { padding: '6px 8px', fontSize: '11px', color: 'var(--color-text-2)', background: 'var(--color-surface-2, transparent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle', border: '1px solid var(--color-border)' }
  const inputClass = "excel-input"
  const numInputClass = "excel-input excel-input-num"

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Excel sheet styles */}
      <style dangerouslySetInnerHTML={{__html:`
        .excel-table { width: 100%; min-width: 1000px; border-collapse: collapse; font-family: var(--font-body); }
        .excel-table th { background: var(--color-surface-2, transparent); border: 1px solid var(--color-border); padding: 8px; font-size: 10px; font-weight: 700; color: var(--color-text-3); text-transform: uppercase; letter-spacing: 0.04em; text-align: left; position: sticky; top: 0; z-index: 10; white-space: nowrap; }
        .excel-input { display: block; width: 100%; height: 100%; min-height: 28px; padding: 6px 8px; border: none; background: transparent; color: var(--color-text); font-size: 12px; outline: none; font-family: inherit; font-weight: 500; }
        .excel-input-num { text-align: right; font-variant-numeric: tabular-nums; }
        .excel-input:focus { box-shadow: inset 0 0 0 2px var(--color-primary); background: color-mix(in srgb, var(--color-primary) 5%, transparent); z-index: 5; position: relative; }
        .excel-row:hover td { background: color-mix(in srgb, var(--color-text) 2%, var(--color-surface)); }
      `}} />
      {/* Table editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={15} color="var(--color-primary)" />
            <span style={{ fontWeight: 600, fontSize: '13px' }}>Éditeur de lignes — {lines.length} ligne{lines.length !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={addLine} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
            borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: '#fff',
            fontWeight: 600, fontSize: '12px', cursor: 'pointer',
          }}>
            <Plus size={14} /> Ajouter une ligne
          </button>
        </div>
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <table className="excel-table">
            <thead>
              <tr>
                {['#', 'Désignation', 'Gamme', 'V.', 'H (mm)', 'L (mm)', 'Base HT', 'Options', 'Serrure', 'F.-porte', 'Total HT', ''].map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const opts = (() => { try { return JSON.parse(line.options_json || '[]') } catch { return [] } })()
                const optStr = opts.map(o => `${o.label} +${(o.prix || 0).toLocaleString('fr-FR')}€`).join(', ')
                return (
                  <tr key={line.id} className="excel-row" style={{ background: saving === line.id ? 'color-mix(in srgb, var(--color-primary) 5%, var(--color-surface))' : 'var(--color-surface)' }}>
                    <td style={{ ...roStyle, width: 30, fontWeight: 700, textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ ...tdStyle, minWidth: 220 }}>
                      <input id={`cell-${idx}-designation`} className={inputClass} spellCheck={false} title={line.designation || ''} value={line.designation || ''} onBlur={(e) => updateLine(line.id, 'designation', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 0)} onChange={(e) => setLines(ls => ls.map(l => l.id === line.id ? { ...l, designation: e.target.value } : l))} />
                    </td>
                    <td style={{ ...tdStyle, width: 120 }}>
                      <input id={`cell-${idx}-gamme`} className={inputClass} spellCheck={false} style={{ color: line.gamme?.startsWith('⚠️') ? '#f59e0b' : 'inherit' }} title={line.gamme || ''} value={line.gamme || ''} onBlur={(e) => updateLine(line.id, 'gamme', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 1)} onChange={(e) => setLines(ls => ls.map(l => l.id === line.id ? { ...l, gamme: e.target.value } : l))} />
                    </td>
                    <td style={{ ...tdStyle, width: 50 }}>
                      <input id={`cell-${idx}-vantail`} className={inputClass} style={{ textAlign: 'center' }} spellCheck={false} value={line.vantail || ''} onBlur={(e) => updateLine(line.id, 'vantail', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 2)} onChange={(e) => setLines(ls => ls.map(l => l.id === line.id ? { ...l, vantail: e.target.value } : l))} />
                    </td>
                    <td style={{ ...tdStyle, width: 70 }}>
                      <input id={`cell-${idx}-hauteur`} className={numInputClass} value={line.hauteur_mm || ''} onBlur={(e) => updateLine(line.id, 'hauteur_mm', parseInt(e.target.value) || null)} onKeyDown={e => handleKeyDown(e, idx, 3)} onChange={(e) => setLines(ls => ls.map(l => l.id === line.id ? { ...l, hauteur_mm: e.target.value } : l))} />
                    </td>
                    <td style={{ ...tdStyle, width: 70 }}>
                      <input id={`cell-${idx}-largeur`} className={numInputClass} value={line.largeur_mm || ''} onBlur={(e) => updateLine(line.id, 'largeur_mm', parseInt(e.target.value) || null)} onKeyDown={e => handleKeyDown(e, idx, 4)} onChange={(e) => setLines(ls => ls.map(l => l.id === line.id ? { ...l, largeur_mm: e.target.value } : l))} />
                    </td>
                    <td style={{ ...tdStyle, width: 90 }}>
                      <input id={`cell-${idx}-prix`} className={numInputClass} value={line.prix_base_ht || ''} onBlur={(e) => updateLine(line.id, 'prix_base_ht', parseFloat(e.target.value) || null)} onKeyDown={e => handleKeyDown(e, idx, 5)} onChange={(e) => setLines(ls => ls.map(l => l.id === line.id ? { ...l, prix_base_ht: e.target.value } : l))} />
                    </td>
                    <td style={{ ...roStyle, minWidth: 120 }}>{optStr || '—'}</td>
                    <td style={{ ...roStyle, maxWidth: 120 }}>{line.serrure_ref || '—'}</td>
                    <td style={{ ...roStyle, maxWidth: 100 }}>{line.ferme_porte_ref || '—'}</td>
                    <td style={{ ...roStyle, width: 100, fontWeight: 700, textAlign: 'right' }}>{prixFmt(line.total_ligne_ht) || '—'}</td>
                    <td style={{ ...tdStyle, width: 36, textAlign: 'center' }}>
                      <button onClick={() => deleteLine(line.id)} style={{ ...iconBtn(), color: '#a33c3c', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Supprimer la ligne">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {lines.length === 0 && (
                <tr><td colSpan={12} style={{ ...roStyle, textAlign: 'center', color: 'var(--color-text-3)', padding: 30 }}>
                  Aucune ligne. Cliquez « Ajouter une ligne » pour commencer.
                </td></tr>
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--color-surface-2, rgba(53,67,70,0.04))' }}>
                  <td colSpan={10} style={{ ...roStyle, textAlign: 'right', fontWeight: 700, fontSize: '13px', borderTop: '2px solid var(--color-border)' }}>
                    Total général HT
                  </td>
                  <td style={{ ...roStyle, textAlign: 'right', fontWeight: 800, fontSize: '14px', borderTop: '2px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                    {grandTotal.toLocaleString('fr-FR')} €
                  </td>
                  <td style={{ ...roStyle, borderTop: '2px solid var(--color-border)' }} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Resizer */}
      <div
        onMouseDown={onMouseDown}
        style={{
          height: '6px', cursor: 'row-resize', background: 'var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}
      >
        <div style={{ width: 40, height: 2, borderRadius: 1, background: 'var(--color-text-3)' }} />
      </div>

      {/* Bottom: Gemma chat for editor context */}
      <div style={{
        height: chatHeight, minHeight: 150, flexShrink: 0, display: 'flex', flexDirection: 'column',
        width: '100%', overflow: 'hidden', background: 'var(--color-surface)',
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Bot size={16} color="var(--color-primary)" />
          <div style={{ flex: 1, fontWeight: 700, fontSize: '13px' }}>Assistant Gemma</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: 0 }}>
          {aiMessages.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-3)', fontSize: '12px' }}>
              <Bot size={28} style={{ opacity: 0.2, marginBottom: 8 }} /><br />
              Posez vos questions sur le devis en cours d'édition.
            </div>
          )}
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
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), askAIEditor())}
            placeholder="Question sur le devis…" disabled={aiLoading}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)',
              background: 'var(--color-input-bg, var(--color-surface-2))', color: 'var(--color-text)',
              fontSize: '12px', outline: 'none', fontFamily: 'var(--font-body)',
            }}
          />
          <button onClick={() => askAIEditor()} disabled={!aiInput.trim() || aiLoading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '8px 12px', borderRadius: '8px', border: 'none',
              background: 'var(--color-primary)', color: '#fff', cursor: 'pointer',
              opacity: (!aiInput.trim() || aiLoading) ? 0.4 : 1,
            }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── STEP 4: PDF GENERATION ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function StepPDF({ devisId, lines, clientName, dealName, onSendHubSpot }) {
  const [copied, setCopied] = useState(false)
  const grandTotal = lines.reduce((s, l) => s + (Number(l.total_ligne_ht) || 0), 0)

  const buildMarkdown = () => {
    const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    const fmt = (v) => v != null ? Number(v).toLocaleString('fr-FR') + ' €' : '—'
    const linesStr = lines.map((l, i) => {
      const opts = (() => { try { return JSON.parse(l.options_json || '[]') } catch { return [] } })()
      const optsStr = opts.map(o => `  - ${o.label} : +${(o.prix || 0).toLocaleString('fr-FR')} €`).join('\n')
      return [
        `### Ligne ${i + 1} — ${l.gamme || '?'} ${l.vantail || ''}`,
        `| Champ | Valeur |`, `|---|---|`,
        `| Désignation | ${l.designation || '—'} |`,
        `| Dimensions HT | H **${l.hauteur_mm || '?'}** × L **${l.largeur_mm || '?'}** mm |`,
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
          <span style={{ fontWeight: 700, fontSize: '14px' }}>Aperçu du devis</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyText} style={ghostBtn()}>
            {copied ? <><Check size={13} /> Copié !</> : <><Copy size={13} /> Copier</>}
          </button>
          <button onClick={() => window.print()} style={ghostBtn()}>
            <Printer size={13} /> Imprimer
          </button>
          <button onClick={onSendHubSpot} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
            borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: '#fff',
            fontWeight: 700, fontSize: '12px', cursor: 'pointer',
          }}>
            <ExternalLink size={13} /> Envoyer dans HubSpot
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <MarkdownRenderer content={mdText} />
        </div>
      </div>
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
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [existingDevis, setExistingDevis] = useState([])
  const [currentDevisId, setCurrentDevisId] = useState(null)

  // Step 2: analysis
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

  // Step 3: editor
  const [lines, setLines] = useState([])
  const [editorAiMessages, setEditorAiMessages] = useState([])
  const [editorAiInput, setEditorAiInput] = useState('')
  const [editorAiLoading, setEditorAiLoading] = useState(false)
  const editorAiEndRef = useRef(null)
  const editorAiInputRef = useRef(null)

  // Chat panel width ratio (1/3, 1/2, 2/3)
  const [chatRatio, setChatRatio] = useState('1/3')

  // Load existing devis when company changes
  useEffect(() => {
    if (!selectedCompany) { setExistingDevis([]); return }
    api.get('/devis').then(all => {
      setExistingDevis(all.filter(d => d.company_id === selectedCompany.id))
    }).catch(() => setExistingDevis([]))
  }, [selectedCompany?.id])

  // Load lines when devis ID changes and step is 3+
  useEffect(() => {
    if (!currentDevisId || step < 3) return
    api.get(`/devis/${currentDevisId}/lines`).then(setLines).catch(() => setLines([]))
  }, [currentDevisId, step])

  // Scroll AI chat
  useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [aiMessages])
  useEffect(() => { editorAiEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [editorAiMessages])

  const goStep = (n) => {
    setStep(n)
    if (n > maxReached) setMaxReached(n)
  }

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
      setCurrentDevisId(devis.id)
      goStep(2)
    } catch (err) {
      console.error('Create devis error:', err)
    }
  }

  const handleOpenDevis = async (d) => {
    setCurrentDevisId(d.id)
    // Jump to appropriate step based on status
    if (d.status === 'editing' || d.status === 'generated') {
      const lns = await api.get(`/devis/${d.id}/lines`).catch(() => [])
      setLines(lns)
      goStep(3)
    } else {
      goStep(2)
    }
  }

  // Step 2: analysis
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

  // Validate step 2 → push lines to DB → step 3
  const handleValidateAnalysis = async () => {
    if (!currentDevisId || !results.length) return
    try {
      const savedLines = await api.post(`/devis/${currentDevisId}/lines/bulk`, { lines: results })
      setLines(savedLines)
      goStep(3)
    } catch (err) {
      console.error('Bulk import error:', err)
    }
  }

  // Step 3: editor AI
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
    if (!currentDevisId) return
    api.get(`/devis/${currentDevisId}/lines`).then(setLines).catch(() => {})
  }

  // Step 4: HubSpot
  const handleSendHubSpot = async () => {
    // TODO: implement PDF generation + HubSpot note creation
    console.log('Send to HubSpot — devis:', currentDevisId)
  }

  const aiRowData = aiRow !== null ? results[aiRow] : null

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

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
          {step < 4 && step >= 2 && results.length > 0 && (
            <button className="admin-btn-primary" onClick={() => {
              if (step === 2) handleValidateAnalysis()
              else goStep(step + 1)
            }} style={{ fontSize: '0.8125rem' }}>
              Étape suivante <ArrowRight size={14} />
            </button>
          )}
          <button type="button" className="admin-btn-ghost" onClick={() => navigate('/chat')}>
            <MessageCircleReply size={16} />
            <span>Retour au chat</span>
          </button>
        </div>
      </header>

      {/* Stepper bar */}
      <StepperBar step={step} maxReached={maxReached} onStep={goStep} />

      {/* Step content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {step === 1 && (
          <StepClient
            selectedCompany={selectedCompany}
            selectedDeal={selectedDeal}
            existingDevis={existingDevis}
            onSelect={setSelectedCompany}
            onSelectDeal={setSelectedDeal}
            onNewDevis={handleNewDevis}
            onOpenDevis={handleOpenDevis}
          />
        )}
        {step === 2 && (
          <StepAnalysis
            results={results} analyzing={analyzing} error={analysisError}
            expandedRow={expandedRow} setExpandedRow={setExpandedRow}
            aiRow={aiRow} selectRow={selectRow}
            fileInputRef={fileInputRef} analyzeFile={analyzeFile}
            aiRowData={aiRowData} aiMessages={aiMessages}
            aiInput={aiInput} setAiInput={setAiInput}
            aiLoading={aiLoading} askAI={askAI}
            aiEndRef={aiEndRef} aiInputRef={aiInputRef}
            onValidate={handleValidateAnalysis}
            chatRatio={chatRatio} setChatRatio={setChatRatio}
          />
        )}
        {step === 3 && (
          <StepEditor
            devisId={currentDevisId} lines={lines} setLines={setLines}
            onRefresh={refreshLines}
            aiMessages={editorAiMessages} aiInput={editorAiInput} setAiInput={setEditorAiInput}
            aiLoading={editorAiLoading} askAIEditor={askAIEditor}
            aiEndRef={editorAiEndRef} aiInputRef={editorAiInputRef}
            chatRatio={chatRatio} setChatRatio={setChatRatio}
          />
        )}
        {step === 4 && (
          <StepPDF
            devisId={currentDevisId} lines={lines}
            clientName={selectedCompany?.name} dealName={selectedDeal?.name}
            onSendHubSpot={handleSendHubSpot}
          />
        )}
      </div>
    </div>
  )
}
