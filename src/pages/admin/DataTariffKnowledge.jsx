import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MarkdownRenderer } from '../../components/MarkdownRenderer.jsx'
import api from '../../api/index.js'

const TARIF_CATEGORIES = new Set(['gamme', 'spec', 'process', 'equip'])
const THERMO_DOC = 'THERMOLAQUAGE.md'

export default function DataTariffKnowledge({ mode = 'tarif' }) {
  const navigate = useNavigate()
  const [docs, setDocs] = useState([])
  const [activeDoc, setActiveDoc] = useState(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [search, setSearch] = useState('')
  const isThermo = mode === 'thermo'

  const loadInventory = useCallback(async () => {
    setLoading(true)
    try {
      const inv = await api.get('/knowledge')
      const filtered = (inv?.docs || []).filter((doc) => {
        if (isThermo) return doc.name === THERMO_DOC
        return TARIF_CATEGORIES.has(doc.category) && doc.name !== THERMO_DOC
      })
      setDocs(filtered)
      setActiveDoc((prev) => {
        if (prev && filtered.some(d => d.name === prev)) return prev
        return filtered[0]?.name || null
      })
    } catch {
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [isThermo])

  useEffect(() => { loadInventory() }, [loadInventory])

  useEffect(() => {
    if (!activeDoc) {
      setContent('')
      return undefined
    }
    let cancelled = false
    setLoadingDoc(true)
    api.get(`/knowledge/docs/${encodeURIComponent(activeDoc)}`)
      .then((row) => { if (!cancelled) setContent(row.content || '') })
      .catch(() => { if (!cancelled) setContent('Erreur de chargement') })
      .finally(() => { if (!cancelled) setLoadingDoc(false) })
    return () => { cancelled = true }
  }, [activeDoc])

  const visibleDocs = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return docs
    return docs.filter(doc => [doc.label, doc.name, doc.title].join(' ').toLowerCase().includes(q))
  }, [docs, search])

  if (loading) {
    return (
      <div style={{ padding: 24, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Loader2 size={16} className="spin" /> Chargement…
      </div>
    )
  }

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {isThermo ? 'Thermolaquage' : 'Tarif NEXUS'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-3)' }}>
              {isThermo ? 'THERMOLAQUAGE.md' : 'Grilles markdown ressources/XLSX'}
            </p>
          </div>
          <button type="button" onClick={loadInventory} style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', borderRadius: 6, padding: 6, cursor: 'pointer' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={14} style={{ position: 'absolute', left: 8, top: 9, color: 'var(--color-text-3)' }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 8px 7px 28px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', fontSize: 12 }}
          />
        </div>
        <div style={{ display: 'grid', gap: 6, maxHeight: '62vh', overflowY: 'auto' }}>
          {visibleDocs.map((doc) => (
            <button
              key={doc.name}
              type="button"
              onClick={() => setActiveDoc(doc.name)}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${activeDoc === doc.name ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: activeDoc === doc.name ? 'rgba(99,102,241,0.08)' : 'var(--color-surface)',
                cursor: 'pointer',
              }}
            >
              <strong style={{ display: 'block', fontSize: 12 }}>{doc.label}</strong>
              <small style={{ fontSize: 10, color: 'var(--color-text-3)' }}>{doc.lines} lignes</small>
            </button>
          ))}
          {!visibleDocs.length && (
            <p style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Aucun document trouvé.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/knowledge')}
          style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer' }}
        >
          <ExternalLink size={13} /> Ouvrir la base complète
        </button>
      </div>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)', minHeight: 420, overflow: 'hidden' }}>
        {loadingDoc ? (
          <div style={{ padding: 24, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={16} /> Lecture…</div>
        ) : activeDoc ? (
          <div style={{ padding: 16, maxHeight: '72vh', overflowY: 'auto', fontSize: 13 }}>
            <MarkdownRenderer content={content} />
          </div>
        ) : (
          <div style={{ padding: 24, color: 'var(--color-text-3)', fontSize: 12 }}>Sélectionnez un document.</div>
        )}
      </div>
    </div>
  )
}
