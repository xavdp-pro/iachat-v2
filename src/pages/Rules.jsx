import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, CircleSlash, FileText, Filter,
  Loader2, Plus, Save, Search, Shield, Tag, Trash2, X,
} from 'lucide-react'
import api from '../api/index.js'
import { useAuthStore } from '../store/useAuthStore.js'

const CATEGORIES = [
  'Chiffrage', 'Validations individuelles R&D', 'Attention client', 'Règle métier',
  'Piège à éviter', 'Dimensions', 'Acoustique', 'Feu', 'Anti-effraction', 'Transport', 'Autre',
]

const SEVERITY_META = {
  info: { label: 'Info', color: '#2563eb', icon: FileText },
  warning: { label: 'Attention', color: '#a16207', icon: CircleAlert },
  blocking: { label: 'Bloquante', color: '#dc2626', icon: Shield },
}

const STATUS_META = {
  active: { label: 'Active', color: '#16845b', icon: CheckCircle2 },
  draft: { label: 'Brouillon', color: '#7c6a34', icon: FileText },
  obsolete: { label: 'Obsolète', color: '#777', icon: CircleSlash },
}

const SOURCE_TYPE_LABELS = {
  human: 'Saisie humaine',
  markdown: 'Markdown connaissance',
  experience: 'Expérience validée',
  pdf: 'PDF tarif',
  xlsx: 'Classeur XLSX',
}

const emptyForm = {
  rule_code: '',
  title: '',
  content: '',
  category: 'Règle métier',
  severity: 'warning',
  source_type: 'human',
  source_ref: '',
  tags: '',
}

function Pill({ meta, children }) {
  const Icon = meta?.icon || Tag
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, background: `${meta?.color || '#64748b'}18`, color: meta?.color || 'var(--color-text-2)', fontSize: 10, fontWeight: 800 }}>
      <Icon size={11} /> {children}
    </span>
  )
}

function parseTags(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  return String(value).split(',').map(tag => tag.trim()).filter(Boolean)
}

function SelectField({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find(option => option.value === value) || options[0]

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0 }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(value => !value)}
        style={{
          ...inputStyle(),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 34,
          textAlign: 'left',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected?.label || '—'}</span>
        <ChevronDown size={15} style={{ flexShrink: 0, color: 'var(--color-text-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms ease' }} />
      </button>
      {open && (
        <div
          className="rules-scrollbar"
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 60,
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: 'auto',
            scrollbarGutter: 'stable',
            padding: 4,
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            boxShadow: '0 14px 34px rgba(0, 0, 0, 0.28)',
          }}
        >
          {options.map(option => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { onChange(option.value); setOpen(false) }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 9px',
                  background: active ? 'var(--color-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--color-text)',
                  fontSize: 12,
                  fontWeight: active ? 800 : 600,
                  fontFamily: 'var(--font-body)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
                onMouseEnter={(event) => {
                  if (!active) event.currentTarget.style.background = 'var(--color-input-bg, var(--color-bg))'
                }}
                onMouseLeave={(event) => {
                  if (!active) event.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.label}</span>
                {active && <CheckCircle2 size={13} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RuleEditor({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => initial ? {
    rule_code: initial.rule_code || '',
    title: initial.title || '',
    content: initial.content || '',
    category: initial.category || 'Règle métier',
    severity: initial.severity || 'warning',
    source_type: initial.source_type || 'human',
    source_ref: initial.source_ref || '',
    tags: parseTags(initial.tags_json).join(', '),
  } : emptyForm)

  const patch = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form) }} style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
        <input value={form.rule_code} onChange={e => patch('rule_code', e.target.value)} placeholder="R001" style={inputStyle()} autoFocus />
        <input value={form.title} onChange={e => patch('title', e.target.value)} placeholder="Titre de règle" style={inputStyle()} />
      </div>
      <textarea value={form.content} onChange={e => patch('content', e.target.value)} placeholder="Règle opérationnelle vérifiable par Zerux IA" rows={7} style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.5 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px', gap: 8 }}>
        <SelectField value={form.category} onChange={value => patch('category', value)} ariaLabel="Catégorie" options={CATEGORIES.map(category => ({ value: category, label: category }))} />
        <SelectField value={form.severity} onChange={value => patch('severity', value)} ariaLabel="Sévérité" options={[
          { value: 'info', label: 'Info' },
          { value: 'warning', label: 'Attention' },
          { value: 'blocking', label: 'Bloquante' },
        ]} />
        <SelectField value={form.source_type} onChange={value => patch('source_type', value)} ariaLabel="Type de source" options={[
          { value: 'human', label: 'Humaine' },
          { value: 'markdown', label: 'Markdown' },
          { value: 'experience', label: 'Experience' },
          { value: 'pdf', label: 'PDF' },
          { value: 'xlsx', label: 'XLSX' },
        ]} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input value={form.source_ref} onChange={e => patch('source_ref', e.target.value)} placeholder="Source" style={inputStyle()} />
        <input value={form.tags} onChange={e => patch('tags', e.target.value)} placeholder="Tags" style={inputStyle()} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} style={buttonStyle('ghost')}><X size={13} /> Annuler</button>
        <button type="submit" disabled={saving || !form.title.trim() || !form.content.trim()} style={buttonStyle('primary')}>
          {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
          Enregistrer
        </button>
      </div>
    </form>
  )
}

function inputStyle() {
  return {
    width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 7,
    background: 'var(--color-input-bg, var(--color-surface))', color: 'var(--color-text)',
    padding: '8px 10px', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)',
  }
}

function buttonStyle(kind = 'ghost') {
  const primary = kind === 'primary'
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    border: primary ? 'none' : '1px solid var(--color-border)', borderRadius: 7,
    background: primary ? 'var(--color-primary)' : 'var(--color-surface)',
    color: primary ? '#fff' : 'var(--color-text)', padding: '7px 10px',
    fontSize: 12, fontWeight: 800, cursor: 'pointer', minHeight: 32,
  }
}

export default function Rules() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.returnTo || '/devis'
  const returnLabel = location.state?.returnLabel || 'Retour devis'
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ status: 'all', severity: 'all', category: 'all', q: '' })

  const queryString = useMemo(() => {
    const qs = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== 'all') qs.set(key, value)
    }
    return qs.toString()
  }, [filters])

  const loadRules = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await api.get(`/rules${queryString ? `?${queryString}` : ''}`)
      setRules(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur chargement règles')
    } finally {
      setLoading(false)
    }
  }, [queryString])

  useEffect(() => { loadRules() }, [loadRules])

  const saveRule = async (payload) => {
    setSaving(true); setError('')
    try {
      if (editing) await api.put(`/rules/${editing.id}`, payload)
      else await api.post('/rules', payload)
      setEditing(null)
      setShowNew(false)
      await loadRules()
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur sauvegarde règle')
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (rule, status) => {
    setSaving(true); setError('')
    try {
      await api.post(`/rules/${rule.id}/${status}`)
      await loadRules()
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur changement statut')
    } finally {
      setSaving(false)
    }
  }

  const deleteRule = async (rule) => {
    setSaving(true); setError('')
    try {
      await api.delete(`/rules/${rule.id}`)
      await loadRules()
    } catch (err) {
      setError(err?.error || err?.message || 'Erreur suppression')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ height: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', overflow: 'hidden' }}>
      <style>{`
        .rules-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: var(--color-border-strong, var(--color-border)) var(--color-surface);
        }
        .rules-scrollbar::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .rules-scrollbar::-webkit-scrollbar-track {
          background: var(--color-surface);
          border-left: 1px solid var(--color-border);
        }
        .rules-scrollbar::-webkit-scrollbar-thumb {
          background: var(--color-border-strong, var(--color-border));
          border: 2px solid var(--color-surface);
          border-radius: 999px;
        }
        .rules-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--color-primary);
        }
      `}</style>
      <div style={{ height: 52, borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', background: 'var(--color-surface)' }}>
        <button type="button" onClick={() => navigate(returnTo)} style={{ ...buttonStyle('ghost'), width: 34, padding: 0 }} title={returnLabel}><ArrowLeft size={15} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Règles</div>
          <div style={{ color: 'var(--color-text-3)', fontSize: 11 }}>Règles atomiques utilisées par les checks devis</div>
        </div>
        <button type="button" onClick={() => { setEditing(null); setShowNew(true) }} style={buttonStyle('primary')}><Plus size={14} /> Nouvelle règle</button>
      </div>

      <div style={{ borderBottom: '1px solid var(--color-border)', padding: '10px 16px', display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) 140px 150px 180px', gap: 8, background: 'var(--color-surface)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--color-text-3)' }} />
          <input value={filters.q} onChange={e => setFilters(prev => ({ ...prev, q: e.target.value }))} placeholder="Rechercher R001, titre, source" style={{ ...inputStyle(), paddingLeft: 30 }} />
        </div>
        <SelectField value={filters.status} onChange={value => setFilters(prev => ({ ...prev, status: value }))} ariaLabel="Filtre statut" options={[
          { value: 'all', label: 'Tous statuts' },
          { value: 'active', label: 'Actives' },
          { value: 'draft', label: 'Brouillons' },
          { value: 'obsolete', label: 'Obsolètes' },
        ]} />
        <SelectField value={filters.severity} onChange={value => setFilters(prev => ({ ...prev, severity: value }))} ariaLabel="Filtre sévérité" options={[
          { value: 'all', label: 'Toutes sévérités' },
          { value: 'info', label: 'Info' },
          { value: 'warning', label: 'Attention' },
          { value: 'blocking', label: 'Bloquante' },
        ]} />
        <SelectField value={filters.category} onChange={value => setFilters(prev => ({ ...prev, category: value }))} ariaLabel="Filtre catégorie" options={[
          { value: 'all', label: 'Toutes catégories' },
          ...CATEGORIES.map(category => ({ value: category, label: category })),
        ]} />
      </div>

      <div className="rules-scrollbar" style={{ minHeight: 0, overflowY: 'scroll', overflowX: 'hidden', padding: 16, scrollbarGutter: 'stable' }}>
        {error && <div style={{ marginBottom: 12, padding: 10, borderRadius: 7, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: 12 }}>{error}</div>}
        {(showNew || editing) && (
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface)', padding: 14, marginBottom: 14 }}>
            <RuleEditor key={editing?.id || 'new'} initial={editing} saving={saving} onSave={saveRule} onCancel={() => { setEditing(null); setShowNew(false) }} />
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {loading && <div style={{ color: 'var(--color-text-3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Chargement</div>}
          {!loading && rules.length === 0 && (
            <div style={{ border: '1px dashed var(--color-border)', borderRadius: 8, padding: 18, color: 'var(--color-text-3)', fontSize: 12 }}>Aucune règle</div>
          )}
          {rules.map(rule => {
            const statusMeta = STATUS_META[rule.status] || STATUS_META.draft
            const severityMeta = SEVERITY_META[rule.severity] || SEVERITY_META.warning
            const tags = parseTags(rule.tags_json)
            const canEdit = isAdmin || (rule.created_by === user?.id && rule.status === 'draft')
            return (
              <article key={rule.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface)', padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 6 }}>
                      {rule.rule_code && <Pill meta={{ color: 'var(--color-primary)', icon: Shield }}>{rule.rule_code}</Pill>}
                      <strong style={{ fontSize: 13 }}>{rule.title}</strong>
                      <Pill meta={statusMeta}>{statusMeta.label}</Pill>
                      <Pill meta={severityMeta}>{severityMeta.label}</Pill>
                      {rule.category && <Pill meta={{ color: 'var(--color-primary)', icon: Filter }}>{rule.category}</Pill>}
                    </div>
                    <div style={{ color: 'var(--color-text-2)', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{rule.content}</div>
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8, flexWrap: 'wrap', color: 'var(--color-text-3)', fontSize: 10, lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 800, color: 'var(--color-text-2)' }}>Sources d'information</span>
                      <span>{SOURCE_TYPE_LABELS[rule.source_type] || rule.source_type || 'Source'}{rule.source_ref ? ` : ${rule.source_ref}` : ''}</span>
                      {tags.map(tag => <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Tag size={10} />{tag}</span>)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 250 }}>
                    {canEdit && <button type="button" onClick={() => { setEditing(rule); setShowNew(false) }} style={buttonStyle('ghost')}>Modifier</button>}
                    {isAdmin && rule.status !== 'active' && <button type="button" onClick={() => setStatus(rule, 'activate')} style={buttonStyle('ghost')}>Activer</button>}
                    {isAdmin && rule.status !== 'obsolete' && <button type="button" onClick={() => setStatus(rule, 'obsolete')} style={buttonStyle('ghost')}>Obsolète</button>}
                    {canEdit && <button type="button" onClick={() => deleteRule(rule)} style={{ ...buttonStyle('ghost'), color: '#dc2626' }} title="Supprimer"><Trash2 size={13} /></button>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
