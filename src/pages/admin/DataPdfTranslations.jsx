import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import api from '../../api/index.js'

const EMPTY = { fr_text: '', en_text: '', de_text: '', category: 'general', sort_order: 0, active: true }

export default function DataPdfTranslations() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState({ ...EMPTY })

  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const data = await api.get('/pdf-translations')
      setEntries(Array.isArray(data?.entries) ? data.entries : [])
    } catch (err) {
      setMessage(err?.error || err?.message || 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const downloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/pdf-translations/template-html?download=1', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'zerux-devis-template-fr.html'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setMessage(err?.message || 'Export HTML impossible')
    }
  }

  const saveEntry = async (entry) => {
    setSavingId(entry.id || 'new')
    setMessage('')
    try {
      const payload = {
        fr_text: entry.fr_text,
        en_text: entry.en_text,
        de_text: entry.de_text,
        category: entry.category || 'general',
        sort_order: Number(entry.sort_order) || 0,
        active: entry.active === false || entry.active === 0 ? 0 : 1,
      }
      if (entry.id) await api.put(`/pdf-translations/${entry.id}`, payload)
      else {
        await api.post('/pdf-translations', payload)
        setDraft({ ...EMPTY })
      }
      await load()
      setMessage('Traduction enregistrée')
    } catch (err) {
      setMessage(err?.error || err?.message || 'Enregistrement impossible')
    } finally {
      setSavingId(null)
    }
  }

  const removeEntry = async (id) => {
    if (!window.confirm('Supprimer cette entrée ?')) return
    setSavingId(id)
    try {
      await api.delete(`/pdf-translations/${id}`)
      await load()
      setMessage('Entrée supprimée')
    } catch (err) {
      setMessage(err?.error || err?.message || 'Suppression impossible')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="admin-ollama-head">
        <div className="admin-ollama-icon"><Save size={22} /></div>
        <div>
          <h2>Traductions PDF devis</h2>
          <p className="admin-ollama-desc">
            Dictionnaire FR → EN / DE utilisé à la génération du PDF. Exportez le template HTML français pour relecture externe.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button type="button" className="admin-btn-primary" onClick={downloadTemplate}>
            <Download size={14} /> Template HTML FR
          </button>
        </div>
      </div>

      {message && <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--color-primary)' }}>{message}</p>}

      <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, background: 'var(--color-surface)' }}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Nouvelle entrée</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 120px 80px auto', gap: 8, alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 11 }}>
            <span>Texte FR</span>
            <input className="chat-modal-input" value={draft.fr_text} onChange={(e) => setDraft((d) => ({ ...d, fr_text: e.target.value }))} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 11 }}>
            <span>EN</span>
            <input className="chat-modal-input" value={draft.en_text} onChange={(e) => setDraft((d) => ({ ...d, en_text: e.target.value }))} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 11 }}>
            <span>DE</span>
            <input className="chat-modal-input" value={draft.de_text} onChange={(e) => setDraft((d) => ({ ...d, de_text: e.target.value }))} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 11 }}>
            <span>Catégorie</span>
            <input className="chat-modal-input" value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 11 }}>
            <span>Ordre</span>
            <input className="chat-modal-input" type="number" value={draft.sort_order} onChange={(e) => setDraft((d) => ({ ...d, sort_order: e.target.value }))} />
          </label>
          <button type="button" className="admin-btn-primary" onClick={() => saveEntry(draft)} disabled={!draft.fr_text.trim() || savingId === 'new'}>
            {savingId === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ajouter
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}><Loader2 size={16} className="animate-spin" /> Chargement…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>FR</th>
                <th>EN</th>
                <th>DE</th>
                <th>Cat.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td><input className="chat-modal-input" value={entry.fr_text || ''} onChange={(e) => setEntries((rows) => rows.map((r) => r.id === entry.id ? { ...r, fr_text: e.target.value } : r))} /></td>
                  <td><input className="chat-modal-input" value={entry.en_text || ''} onChange={(e) => setEntries((rows) => rows.map((r) => r.id === entry.id ? { ...r, en_text: e.target.value } : r))} /></td>
                  <td><input className="chat-modal-input" value={entry.de_text || ''} onChange={(e) => setEntries((rows) => rows.map((r) => r.id === entry.id ? { ...r, de_text: e.target.value } : r))} /></td>
                  <td style={{ width: 90 }}><input className="chat-modal-input" value={entry.category || ''} onChange={(e) => setEntries((rows) => rows.map((r) => r.id === entry.id ? { ...r, category: e.target.value } : r))} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={() => saveEntry(entry)} disabled={savingId === entry.id} style={{ marginRight: 6 }}>
                      {savingId === entry.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    </button>
                    <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={() => removeEntry(entry.id)} disabled={savingId === entry.id}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {!entries.length && (
                <tr><td colSpan={5} style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Aucune entrée — les règles automatiques FR→EN/DE restent actives.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
