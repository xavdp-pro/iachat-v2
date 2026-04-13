/**
 * Prospects — HubSpot companies with contacts & deals per company (server: /api/prospects).
 * Layout: theme.css (.prospects-*). UI state: localStorage (search + selected company).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Loader2, Search, MessageCircleReply, ChevronRight,
  Users, Handshake, Globe, Phone, MapPin, Briefcase, X, FileText, ExternalLink
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api/index.js'

const LS_KEY = 'prospects_ui_v1'

function loadProspectsUi() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { search: '', selectedId: null }
    const j = JSON.parse(raw)
    return {
      search: typeof j.search === 'string' ? j.search : '',
      selectedId: j.selectedId != null ? String(j.selectedId) : null,
    }
  } catch {
    return { search: '', selectedId: null }
  }
}

const fmtMoney = (v) => {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return `${n.toLocaleString('fr-FR')} €`
}

const fmtDate = (v) => {
  if (!v) return '—'
  const t = Date.parse(v)
  if (Number.isNaN(t)) return String(v)
  return new Date(t).toLocaleDateString('fr-FR')
}

function Cell({ icon, label, value }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-2, rgba(0,0,0,0.03))',
        borderRadius: '8px',
        padding: '8px 10px',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        style={{
          fontSize: '10px',
          color: 'var(--color-text-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: 2,
        }}
      >
        {icon} {label}
      </div>
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)', wordBreak: 'break-word' }}>
        {value || '—'}
      </div>
    </div>
  )
}

export default function Prospects() {
  const navigate = useNavigate()
  const initial = useRef(loadProspectsUi()).current

  const [list, setList] = useState([])
  const [pagingAfter, setPagingAfter] = useState(null)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [search, setSearch] = useState(initial.search)
  const [searchDebounced, setSearchDebounced] = useState(initial.search)

  const [selectedId, setSelectedId] = useState(initial.selectedId)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const selectedRowRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ search, selectedId }))
    } catch {
      /* ignore quota / private mode */
    }
  }, [search, selectedId])

  const loadList = useCallback(async ({ reset, after } = {}) => {
    setListLoading(true)
    setListError('')
    try {
      const params = { limit: 30 }
      if (after) params.after = after
      if (searchDebounced) params.q = searchDebounced
      const data = await api.get('/prospects/companies', { params })
      const rows = data.results || []
      setPagingAfter(data.paging?.next?.after || null)
      if (reset) setList(rows)
      else setList((prev) => [...prev, ...rows])
    } catch (e) {
      setListError(e?.error || e?.message || 'Impossible de charger les entreprises')
      if (reset) setList([])
    } finally {
      setListLoading(false)
    }
  }, [searchDebounced])

  useEffect(() => {
    setPagingAfter(null)
    loadList({ reset: true })
  }, [loadList])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError('')
    ;(async () => {
      try {
        const data = await api.get(`/prospects/companies/${selectedId}`)
        if (!cancelled) setDetail(data)
      } catch (e) {
        if (!cancelled) {
          setDetail(null)
          setDetailError(e?.error || e?.message || 'Erreur chargement détail')
        }
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  // Scroll selected company into view once list is rendered (e.g. restored from localStorage)
  useEffect(() => {
    if (!selectedId || !selectedRowRef.current) return
    const id = requestAnimationFrame(() => {
      selectedRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [selectedId, list])

  const pickRow = (id) => {
    setSelectedId(String(id))
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-brand">
          <div className="admin-topbar-mark">
            <Building2 size={18} strokeWidth={2} />
          </div>
          <div className="admin-topbar-text">
            <h1>Prospects</h1>
            <p>HubSpot — entreprises, contacts et opportunités</p>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="admin-btn-ghost" onClick={() => navigate('/chat')}>
            <MessageCircleReply size={16} />
            <span>Retour au chat</span>
          </button>
        </div>
      </header>

      <main className="admin-main prospects-main">
        <div className="prospects-main-inner">
          <div className="prospects-intro">
            <strong style={{ color: 'var(--color-text)' }}>Vue CRM</strong>
            {' — '}
            Sélectionnez une entreprise pour voir les contacts rattachés et les deals associés (données HubSpot).
          </div>

          <div className="prospects-split">
            <aside className="prospects-aside">
              <div className="prospects-aside-search">
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--color-text-3)',
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    className="chat-modal-input"
                    style={{ paddingLeft: 30, paddingRight: search ? 30 : 10, width: '100%' }}
                    placeholder="Rechercher (nom, domaine)…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Recherche entreprises"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-primary)',
                        background: 'rgba(255,255,255,0.05)',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        zIndex: 10,
                      }}
                      aria-label="Effacer la recherche"
                    >
                      <X size={14} strokeWidth={3} />
                    </button>
                  )}
                </div>
              </div>
              <div className="prospects-aside-scroll">
                {listError && (
                  <div style={{ padding: 12, color: '#b91c1c', fontSize: 13 }}>{listError}</div>
                )}
                {listLoading && list.length === 0 ? (
                  <div className="admin-loading">
                    <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                    <span>Chargement…</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {list.map((row) => {
                      const p = row.properties || {}
                      const active = String(selectedId) === String(row.id)
                      const deals = row.associations?.deals?.results || []
                      const hasDeals = deals.length > 0
                      
                      return (
                        <button
                          key={row.id}
                          ref={active ? selectedRowRef : undefined}
                          type="button"
                          onClick={() => pickRow(row.id)}
                          style={{
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-lg, 10px)',
                            border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            background: active
                              ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))'
                              : 'var(--color-surface)',
                            cursor: 'pointer',
                            color: 'var(--color-text)',
                            position: 'relative'
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: '0.875rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 6,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                              <Building2 size={14} style={{ opacity: 0.7, flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.name || `Entreprise #${row.id}`}
                              </span>
                            </div>
                            {hasDeals && (
                              <div 
                                style={{ 
                                  fontSize: '9px', 
                                  background: 'var(--color-primary)', 
                                  color: 'white', 
                                  padding: '1px 4px', 
                                  borderRadius: '4px',
                                  fontWeight: 800,
                                  flexShrink: 0
                                }}
                              >
                                PDF
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-3)', marginTop: 4 }}>
                            {[p.domain, p.city, p.country].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
                {pagingAfter && (
                  <div style={{ padding: '8px 4px' }}>
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      style={{ width: '100%', justifyContent: 'center' }}
                      disabled={listLoading}
                      onClick={() => loadList({ after: pagingAfter })}
                    >
                      {listLoading ? <Loader2 size={16} className="animate-spin" /> : 'Charger plus'}
                    </button>
                  </div>
                )}
              </div>
            </aside>

            <section className="prospects-detail">
              {!selectedId && (
                <div className="prospects-empty">
                  <ChevronRight size={28} style={{ opacity: 0.25 }} />
                  <span>Choisissez une entreprise dans la liste</span>
                </div>
              )}
              {selectedId && detailLoading && (
                <div className="admin-loading">
                  <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                  <span>Chargement du détail…</span>
                </div>
              )}
              {selectedId && detailError && !detailLoading && (
                <div style={{ padding: 16, color: '#b91c1c', fontSize: 14 }}>{detailError}</div>
              )}
              <AnimatePresence mode="wait">
                {detail && !detailLoading && (
                  <motion.div
                    key={detail.company?.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    {(() => {
                      const p = detail.company?.properties || {}
                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: '1rem' }}>
                            <h2
                              style={{
                                fontSize: '1.125rem',
                                fontWeight: 700,
                                color: 'var(--color-text)',
                                margin: 0,
                              }}
                            >
                              {p.name || `Entreprise #${detail.company?.id}`}
                            </h2>
                            <button
                              type="button"
                              className="admin-btn-primary"
                              onClick={() => navigate(`/prospects/${detail.company?.id}/quotes`)}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}
                            >
                              <Briefcase size={14} /> Gérer les devis
                            </button>
                          </div>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                              gap: 8,
                              marginBottom: 20,
                            }}
                          >
                            <Cell icon={<Globe size={12} />} label="Site" value={p.website} />
                            <Cell icon={<Globe size={12} />} label="Domaine" value={p.domain} />
                            <Cell icon={<Phone size={12} />} label="Téléphone" value={p.phone} />
                            <Cell icon={<MapPin size={12} />} label="Ville" value={p.city} />
                            <Cell icon={<MapPin size={12} />} label="Pays" value={p.country} />
                            <Cell icon={<Briefcase size={12} />} label="Secteur" value={p.industry} />
                            <Cell icon={<Users size={12} />} label="Effectif" value={p.numberofemployees} />
                            <Cell icon={<Handshake size={12} />} label="CA annuel" value={fmtMoney(p.annualrevenue)} />
                          </div>

                          {p.description && (
                            <div
                              style={{
                                marginBottom: 20,
                                padding: 12,
                                borderRadius: 8,
                                border: '1px solid var(--color-border)',
                                fontSize: 13,
                                color: 'var(--color-text-2)',
                                lineHeight: 1.5,
                              }}
                            >
                              {p.description}
                            </div>
                          )}

                          <h3
                            style={{
                              fontSize: '0.8125rem',
                              fontWeight: 700,
                              marginBottom: 8,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Users size={16} /> Contacts ({detail.contacts?.length ?? 0})
                          </h3>
                          <div className="admin-table-wrap" style={{ marginBottom: 24 }}>
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th>Nom</th>
                                  <th>Email</th>
                                  <th>Poste</th>
                                  <th>Tél.</th>
                                  <th>Cycle</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(detail.contacts || []).length === 0 ? (
                                  <tr>
                                    <td colSpan={5} style={{ color: 'var(--color-text-3)' }}>
                                      Aucun contact lié
                                    </td>
                                  </tr>
                                ) : (
                                  (detail.contacts || []).map((c) => {
                                    const cp = c.properties || {}
                                    const name = [cp.firstname, cp.lastname].filter(Boolean).join(' ') || '—'
                                    return (
                                      <tr key={c.id}>
                                        <td>{name}</td>
                                        <td>{cp.email || '—'}</td>
                                        <td>{cp.jobtitle || '—'}</td>
                                        <td>{cp.phone || '—'}</td>
                                        <td>{cp.lifecyclestage || '—'}</td>
                                      </tr>
                                    )
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>

                          <h3
                            style={{
                              fontSize: '0.8125rem',
                              fontWeight: 700,
                              marginBottom: 8,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Handshake size={16} /> Deals ({detail.deals?.length ?? 0})
                          </h3>
                          <div className="admin-table-wrap">
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th>Deal</th>
                                  <th>Montant</th>
                                  <th>Étape</th>
                                  <th>Pipeline</th>
                                  <th>Clôture</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(detail.deals || []).length === 0 ? (
                                  <tr>
                                    <td colSpan={5} style={{ color: 'var(--color-text-3)' }}>
                                      Aucun deal lié
                                    </td>
                                  </tr>
                                ) : (
                                  (detail.deals || []).map((d) => {
                                    const dp = d.properties || {}
                                    const attachments = d.attachments || []
                                    return (
                                      <tr key={d.id}>
                                        <td>
                                          <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                                            {dp.dealname || '—'}
                                          </div>
                                          {attachments.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
                                              {attachments.map((file, idx) => (
                                                <div 
                                                  key={file.id} 
                                                  style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    height: 24,
                                                    position: 'relative'
                                                  }}
                                                >
                                                  {/* Tree lines connectors */}
                                                  <div style={{
                                                    width: 12,
                                                    height: idx === 0 ? 12 : 24,
                                                    borderLeft: '1.5px solid var(--color-border)',
                                                    position: 'absolute',
                                                    left: 6,
                                                    top: 0
                                                  }} />
                                                  <div style={{
                                                    width: 12,
                                                    height: 12,
                                                    borderBottom: '1.5px solid var(--color-border)',
                                                    borderLeft: idx === attachments.length - 1 ? '1.5px solid var(--color-border)' : 'none',
                                                    marginLeft: 6,
                                                    marginRight: 8
                                                  }} />
                                                  
                                                  <a
                                                    href={file.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                      display: 'flex',
                                                      alignItems: 'center',
                                                      justifyContent: 'space-between',
                                                      gap: 12,
                                                      fontSize: '11px',
                                                      color: 'var(--color-text-2)',
                                                      textDecoration: 'none',
                                                      background: 'rgba(0,0,0,0.03)',
                                                      padding: '2px 8px',
                                                      borderRadius: '6px',
                                                      flex: 1,
                                                      maxWidth: '100%',
                                                      transition: 'all 0.15s ease',
                                                      border: '1px solid transparent'
                                                    }}
                                                    title={`${file.name} (Source: ${file.source || 'Inconnue'})`}
                                                    onMouseOver={(e) => {
                                                      e.currentTarget.style.borderColor = 'var(--color-primary)';
                                                      e.currentTarget.style.color = 'var(--color-primary)';
                                                      e.currentTarget.style.background = 'white';
                                                    }}
                                                    onMouseOut={(e) => {
                                                      e.currentTarget.style.borderColor = 'transparent';
                                                      e.currentTarget.style.color = 'var(--color-text-2)';
                                                      e.currentTarget.style.background = 'rgba(0,0,0,0.03)';
                                                    }}
                                                  >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                                                      <FileText size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
                                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                        {file.name}
                                                      </span>
                                                    </div>
                                                    
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                      {file.source && (
                                                        <span style={{ 
                                                          fontSize: '9px', 
                                                          fontWeight: 600,
                                                          textTransform: 'uppercase', 
                                                          opacity: 0.6, 
                                                          background: 'rgba(0,0,0,0.06)',
                                                          padding: '1px 5px',
                                                          borderRadius: '4px',
                                                          color: 'var(--color-text-1)'
                                                        }}>
                                                          {file.source}
                                                        </span>
                                                      )}
                                                      <ExternalLink size={10} style={{ opacity: 0.3 }} />
                                                    </div>
                                                  </a>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </td>
                                        <td>{fmtMoney(dp.amount)}</td>
                                        <td>
                                          <span style={{ fontSize: 11 }}>{dp.dealstage || '—'}</span>
                                        </td>
                                        <td>
                                          <span style={{ fontSize: 11 }}>{dp.pipeline || '—'}</span>
                                        </td>
                                        <td>{fmtDate(dp.closedate)}</td>
                                      </tr>
                                    )
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
