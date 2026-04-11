import { useState, useEffect, useCallback } from 'react'
import { ZrSearchableSelect } from '../ui/ZrSearchableSelect.jsx'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, CheckCircle2, Clock, XCircle,
  MessageCircleReply, Tag, BookOpen,
  Loader2, X, ChevronDown, ChevronUp, Search,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/useAuthStore.js'
import api from '../api/index.js'

const CATEGORIES = [
  'Chiffrage', 'Attention client', 'Règle métier', 'Piège à éviter',
  'Matériaux', 'Main d\'œuvre', 'Déplacement', 'Autre',
]

const CATEGORY_COLORS = {
  'Chiffrage': { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
  'Attention client': { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
  'Règle métier': { bg: 'rgba(139,92,246,0.12)', text: '#8b5cf6' },
  'Piège à éviter': { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' },
  'Matériaux': { bg: 'rgba(16,185,129,0.12)', text: '#10b981' },
  'Main d\'œuvre': { bg: 'rgba(6,182,212,0.12)', text: '#06b6d4' },
  'Déplacement': { bg: 'rgba(244,114,182,0.12)', text: '#f472b6' },
  'Autre': { bg: 'var(--color-input-bg)', text: 'var(--color-text-2)' },
}

const STATUS_META = {
  pending:  { label: 'En attente', icon: Clock,        color: '#f59e0b' },
  approved: { label: 'Approuvée',  icon: CheckCircle2, color: '#22c55e' },
  rejected: { label: 'Refusée',    icon: XCircle,      color: '#ef4444' },
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending
  const Icon = meta.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, color: meta.color,
      background: `${meta.color}18`, padding: '2px 8px', borderRadius: 99,
    }}>
      <Icon size={12} strokeWidth={2.5} /> {meta.label}
    </span>
  )
}

function CategoryBadge({ category }) {
  if (!category) return null
  const c = CATEGORY_COLORS[category] || CATEGORY_COLORS['Autre']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 11, fontWeight: 600, color: c.text,
      background: c.bg, padding: '2px 8px', borderRadius: 99,
    }}>
      <Tag size={10} strokeWidth={2.5} /> {category}
    </span>
  )
}

function ExperienceModal({ initial, onClose, onSave }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [category, setCategory] = useState(initial?.category || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) { setError('Titre et contenu requis'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ title: title.trim(), content: content.trim(), category: category.trim() || null })
      onClose()
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <motion.div
        className="chat-modal admin-modal-wide"
        style={{ maxWidth: 560 }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-modal-header">
          <h2 className="chat-modal-title">{initial ? 'Modifier l\'expérience' : 'Nouvelle expérience'}</h2>
          <button className="chat-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="chat-modal-field">
            <label className="chat-modal-label">Titre *</label>
            <input
              className="chat-modal-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Toujours prévoir +10% sur les câbles en rénovation"
              maxLength={255}
              autoFocus
            />
          </div>
          <div className="chat-modal-field">
            <label className="chat-modal-label">Catégorie</label>
            <ZrSearchableSelect
              value={category}
              onChange={setCategory}
              options={[{ value: '', label: '— Choisir —' }, ...CATEGORIES.map(c => ({ value: c, label: c }))]}
              ariaLabel="Catégorie"
              fullWidth
            />
            {category && (
              <button type="button" aria-label="Effacer catégorie" style={{ marginTop: 4, marginLeft: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: '1.1em' }} onClick={() => setCategory('')}>
                ×
              </button>
            )}
          </div>
          <div className="chat-modal-field">
            <label className="chat-modal-label">Contenu *</label>
            <textarea
              className="chat-modal-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Décris le contexte, la situation, ce qu'il faut faire ou éviter, avec des exemples concrets..."
            />
          </div>
          {error && (
            <p style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', fontWeight: 500, margin: '0 0 0.5rem' }}>{error}</p>
          )}
          <div className="chat-modal-actions">
            <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="chat-modal-btn chat-modal-btn--primary" disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" style={{ marginRight: 4 }} />}
              {initial ? 'Enregistrer' : 'Soumettre'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function ExpandableContent({ text, maxLen = 200 }) {
  const [expanded, setExpanded] = useState(false)
  if (text.length <= maxLen) {
    return <p style={{ color: 'var(--color-text-2)', fontSize: '0.8125rem', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{text}</p>
  }
  return (
    <div>
      <p style={{ color: 'var(--color-text-2)', fontSize: '0.8125rem', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
        {expanded ? text : text.slice(0, maxLen) + '…'}
      </p>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 0',
          fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)',
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}
      >
        {expanded ? <><ChevronUp size={12} /> Réduire</> : <><ChevronDown size={12} /> Lire la suite</>}
      </button>
    </div>
  )
}

export default function Experiences() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [experiences, setExperiences] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [search, setSearch] = useState('')

  const fetchExperiences = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/experiences')
      setExperiences(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchExperiences() }, [fetchExperiences])

  const handleSave = async (payload) => {
    if (modal?.mode === 'edit') {
      const updated = await api.put(`/experiences/${modal.exp.id}`, payload)
      setExperiences((prev) => prev.map((e) => e.id === updated.id ? updated : e))
    } else {
      const created = await api.post('/experiences', payload)
      setExperiences((prev) => [created, ...prev])
    }
  }

  const handleDelete = async (exp) => {
    await api.delete(`/experiences/${exp.id}`)
    setExperiences((prev) => prev.filter((e) => e.id !== exp.id))
    setConfirmDelete(null)
  }

  const filtered = experiences.filter((e) => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false
    if (filterCategory !== 'all' && e.category !== filterCategory) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!e.title.toLowerCase().includes(q) && !e.content.toLowerCase().includes(q)) return false
    }
    return true
  })

  const counts = {
    total: experiences.length,
    pending: experiences.filter((e) => e.status === 'pending').length,
    approved: experiences.filter((e) => e.status === 'approved').length,
    rejected: experiences.filter((e) => e.status === 'rejected').length,
  }

  return (
    <div className="admin-shell">
      {/* ── Topbar ── */}
      <header className="admin-topbar">
        <div className="admin-topbar-brand">
          <div className="admin-topbar-mark">
            <BookOpen size={18} strokeWidth={2} />
          </div>
          <div className="admin-topbar-text">
            <h1>Base d'expériences</h1>
            <p>{counts.approved} approuvée{counts.approved !== 1 ? 's' : ''} · {counts.pending} en attente</p>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="admin-btn-ghost" onClick={() => navigate('/chat')}>
            <MessageCircleReply size={16} />
            <span>Retour au chat</span>
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="admin-main" style={{ overflow: 'visible' }}>
        {/* Intro banner */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--color-border)',
          background: 'color-mix(in srgb, var(--color-primary) 4%, var(--color-surface))',
          fontSize: '0.8125rem', lineHeight: 1.55, color: 'var(--color-text-2)',
        }}>
          <strong style={{ color: 'var(--color-text)' }}>💡 Base de connaissances commerciale</strong><br />
          Partagez vos expériences terrain : règles de chiffrage, pièges à éviter, astuces clients.
          L'IA s'en servira lors du contrôle qualité des devis. Vos contributions sont validées par un administrateur avant d'être utilisées.
        </div>

        {/* Toolbar */}
        <div className="admin-toolbar">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 300 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)', pointerEvents: 'none' }} />
              <input
                className="chat-modal-input"
                style={{ paddingLeft: 30, width: '100%' }}
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ZrSearchableSelect
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'all', label: `Tous les statuts` },
                { value: 'pending', label: `En attente (${counts.pending})` },
                { value: 'approved', label: `Approuvées (${counts.approved})` },
                { value: 'rejected', label: `Refusées (${counts.rejected})` },
              ]}
              ariaLabel="Filtrer par statut"
              minWidth={140}
            />
            <ZrSearchableSelect
              value={filterCategory}
              onChange={setFilterCategory}
              options={[
                { value: 'all', label: 'Toutes catégories' },
                ...CATEGORIES.map(c => ({ value: c, label: c })),
              ]}
              ariaLabel="Filtrer par catégorie"
              minWidth={170}
            />
          </div>
          <button className="admin-btn-primary" onClick={() => setModal({ mode: 'create' })}>
            <Plus size={15} strokeWidth={2.5} />
            Nouvelle expérience
          </button>
        </div>

        {/* List */}
        <div style={{ padding: '1rem 1.25rem', flex: 1 }}>
          {loading ? (
            <div className="admin-loading">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
              <span>Chargement…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-loading" style={{ padding: '3rem' }}>
              <BookOpen size={32} style={{ opacity: 0.3 }} />
              <span>{search || filterStatus !== 'all' || filterCategory !== 'all'
                ? 'Aucun résultat pour ces filtres'
                : 'Aucune expérience partagée pour l\'instant. Soyez le premier !'}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((exp) => (
                <motion.div
                  key={exp.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg, 10px)',
                    padding: '0.875rem 1rem',
                    borderLeft: `3px solid ${(STATUS_META[exp.status] || STATUS_META.pending).color}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9rem' }}>{exp.title}</span>
                        <CategoryBadge category={exp.category} />
                        <StatusBadge status={exp.status} />
                      </div>
                      {/* Content */}
                      <ExpandableContent text={exp.content} />
                      {/* Meta */}
                      <div style={{ marginTop: 8, fontSize: '0.6875rem', color: 'var(--color-text-3)' }}>
                        {exp.author_name && <span>Par <strong>{exp.author_name}</strong> · </span>}
                        {new Date(exp.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, paddingTop: 2 }}>
                      {(exp.status === 'pending' || user?.role === 'admin') && (
                        <button
                          className="admin-table-icon-btn"
                          title="Modifier"
                          onClick={() => setModal({ mode: 'edit', exp })}
                        >
                          <Pencil size={14} strokeWidth={2} />
                        </button>
                      )}
                      <button
                        className="admin-table-icon-btn admin-table-icon-btn--danger"
                        title="Supprimer"
                        onClick={() => setConfirmDelete(exp)}
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Modals ── */}
      <AnimatePresence>
        {modal && (
          <ExperienceModal
            key="exp-modal"
            initial={modal.mode === 'edit' ? modal.exp : null}
            onClose={() => setModal(null)}
            onSave={handleSave}
          />
        )}
        {confirmDelete && (
          <div key="confirm-delete" className="chat-modal-backdrop" onClick={() => setConfirmDelete(null)}>
            <motion.div
              className="admin-confirm-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Supprimer l'expérience ?</h3>
              <p>
                Supprimer <strong>"{confirmDelete.title}"</strong> ? Cette action est irréversible.
              </p>
              <div className="admin-confirm-actions">
                <button className="chat-modal-btn chat-modal-btn--secondary" onClick={() => setConfirmDelete(null)}>Annuler</button>
                <button className="chat-modal-btn chat-modal-btn--danger" onClick={() => handleDelete(confirmDelete)}>Supprimer</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
