import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, RefreshCw, Save, Shield, Trash2, Upload } from 'lucide-react'
import api from '../../api/index.js'

const emptyItem = {
  performance: 'CR4',
  grid_column: 'serrure',
  ref: '',
  label: '',
  section_label: '',
  row_kind: 'item',
  sort_order: 0,
  price_ht: '',
  active: true,
  notes: '',
}

function normalizeItem(row) {
  return {
    ...emptyItem,
    ...row,
    active: row.active === undefined ? true : Boolean(row.active),
    row_kind: row.row_kind === 'section' ? 'section' : 'item',
  }
}

function fieldValue(value) {
  return value ?? ''
}

function Input({ row, field, onChange, width = 120, placeholder = '' }) {
  return (
    <input
      value={fieldValue(row[field])}
      placeholder={placeholder}
      onChange={event => onChange(field, event.target.value)}
      style={{ width, minWidth: width, padding: '6px 7px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 12 }}
    />
  )
}

export default function DataEquipmentCatalog() {
  const [columns, setColumns] = useState([])
  const [performanceStats, setPerformanceStats] = useState([])
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState(emptyItem)
  const [performance, setPerformance] = useState('CR4')
  const [columnFilter, setColumnFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [newPerformance, setNewPerformance] = useState('')

  const flashSaved = () => {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  const loadMeta = useCallback(async () => {
    try {
      const [meta, stats] = await Promise.all([
        api.get('/equipment-catalog/meta'),
        api.get('/equipment-catalog/performances'),
      ])
      setColumns(Array.isArray(meta?.columns) ? meta.columns : [])
      setPerformanceStats(Array.isArray(stats) ? stats : [])
    } catch {
      /* ignore */
    }
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await api.get('/equipment-catalog', { params: { performance } })
      setItems(Array.isArray(rows) ? rows.map(normalizeItem) : [])
    } catch (err) {
      setError(err.error || err.message || 'Impossible de charger les équipements')
    } finally {
      setLoading(false)
    }
  }, [performance])

  useEffect(() => { loadMeta() }, [loadMeta])
  useEffect(() => { loadItems() }, [loadItems])
  useEffect(() => { setDraft(prev => ({ ...prev, performance })) }, [performance])

  const performances = useMemo(() => {
    const fromStats = performanceStats.map(row => row.performance)
    const defaults = ['CR3', 'CR4', 'CR5', 'CR6', 'EI30', 'EI60', 'EI120', 'FB4', 'FB6', 'FB7', 'BLAST', 'PRISON', 'ANTI-BELIER', 'EF2']
    return [...new Set([...defaults, ...fromStats, performance].filter(Boolean))].sort()
  }, [performance, performanceStats])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(row => {
      if (columnFilter && row.grid_column !== columnFilter) return false
      if (!q) return true
      return [row.ref, row.label, row.section_label, row.grid_column, row.notes]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    })
  }, [items, columnFilter, search])

  const activeCount = useMemo(() => items.filter(row => row.active && row.row_kind === 'item').length, [items])

  const importPerformance = async (replace = true) => {
    setSavingId('import')
    setError('')
    try {
      await api.post('/equipment-catalog/import', { performance, replace })
      await Promise.all([loadItems(), loadMeta()])
      flashSaved()
    } catch (err) {
      setError(err.error || err.message || 'Import impossible')
    } finally {
      setSavingId(null)
    }
  }

  const seedDefaults = async () => {
    setSavingId('seed')
    setError('')
    try {
      await api.post('/equipment-catalog/seed-defaults')
      await Promise.all([loadItems(), loadMeta()])
      flashSaved()
    } catch (err) {
      setError(err.error || err.message || 'Import initial impossible')
    } finally {
      setSavingId(null)
    }
  }

  const reimportAll = async () => {
    setSavingId('reimport')
    setError('')
    try {
      await api.post('/equipment-catalog/reimport-all')
      await Promise.all([loadItems(), loadMeta()])
      flashSaved()
    } catch (err) {
      setError(err.error || err.message || 'Réimport impossible')
    } finally {
      setSavingId(null)
    }
  }

  const createItem = async () => {
    if (!draft.label.trim()) {
      setError('Le libellé est requis')
      return
    }
    setSavingId('new')
    setError('')
    try {
      const created = await api.post('/equipment-catalog', { ...draft, performance })
      setItems(prev => [...prev, normalizeItem(created)])
      setDraft({ ...emptyItem, performance, grid_column: draft.grid_column })
      flashSaved()
    } catch (err) {
      setError(err.error || err.message || 'Création impossible')
    } finally {
      setSavingId(null)
    }
  }

  const updateItem = async (row) => {
    setSavingId(row.id)
    setError('')
    try {
      const updated = await api.put(`/equipment-catalog/${row.id}`, row)
      setItems(prev => prev.map(item => item.id === row.id ? normalizeItem(updated) : item))
      flashSaved()
    } catch (err) {
      setError(err.error || err.message || 'Mise à jour impossible')
    } finally {
      setSavingId(null)
    }
  }

  const deleteItem = async (row) => {
    setConfirmDialog({
      title: 'Supprimer',
      message: `Supprimer « ${row.label} » ?`,
      danger: true,
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        setConfirmDialog(null)
        setSavingId(row.id)
        setError('')
        try {
          await api.delete(`/equipment-catalog/${row.id}`)
          setItems(prev => prev.filter(item => item.id !== row.id))
          flashSaved()
        } catch (err) {
          setError(err.error || err.message || 'Suppression impossible')
        } finally {
          setSavingId(null)
        }
      },
    })
  }

  const updateDraft = (field, value) => setDraft(prev => ({ ...prev, [field]: value }))
  const updateRow = (id, field, value) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  const addPerformance = () => {
    const perf = String(newPerformance || '').trim().toUpperCase().replace(/^RC/, 'CR')
    if (!perf) return
    setPerformance(perf)
    setNewPerformance('')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="admin-ollama-head">
        <div className="admin-ollama-icon"><Shield size={22} strokeWidth={2} /></div>
        <div>
          <h2>Équipements par performance</h2>
          <p className="admin-ollama-desc">
            Matrices <code>Equipements de portes - CR*.xlsx</code> — alimente les menus de la grille devis pour chaque performance (RC3, RC4…).
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="admin-btn-ghost" onClick={() => Promise.all([loadItems(), loadMeta()])} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Recharger
          </button>
          {!performanceStats.length && (
            <button type="button" className="admin-btn-primary" onClick={seedDefaults} disabled={savingId === 'seed'}>
              {savingId === 'seed' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              Importer CR3 + CR4
            </button>
          )}
          {performanceStats.length > 0 && (
            <button type="button" className="admin-btn-ghost" onClick={reimportAll} disabled={savingId === 'reimport'}>
              {savingId === 'reimport' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              Réimporter depuis XLSX
            </button>
          )}
          <button type="button" className="admin-btn-primary" onClick={() => importPerformance(true)} disabled={savingId === 'import'}>
            {savingId === 'import' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            Réimporter {performance}
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', color: '#b91c1c', fontSize: 13 }}>{error}</div>}
      {saved && <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.12)', color: '#15803d', fontSize: 13 }}>Enregistré.</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {performances.map(perf => (
          <button
            key={perf}
            type="button"
            onClick={() => setPerformance(perf)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${performance === perf ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: performance === perf ? 'rgba(99,102,241,0.12)' : 'var(--color-input-bg)',
              fontWeight: performance === perf ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {perf}
            {performanceStats.find(row => row.performance === perf) ? ` (${performanceStats.find(row => row.performance === perf).count})` : ''}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newPerformance} onChange={e => setNewPerformance(e.target.value)} placeholder="CR5…" style={{ width: 72, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }} />
          <button type="button" className="admin-btn-ghost" onClick={addPerformance}><Plus size={14} /></button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13, color: 'var(--color-text-2)' }}>
        <span><strong>{filteredItems.length}</strong> lignes affichées</span>
        <span><strong>{activeCount}</strong> équipements actifs ({performance})</span>
        <select value={columnFilter} onChange={e => setColumnFilter(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
          <option value="">Toutes les colonnes</option>
          {columns.map(col => <option key={col.id} value={col.id}>{col.label}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher réf, libellé…" style={{ minWidth: 220, padding: '6px 9px', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--color-input-bg)' }}>
              {['Colonne', 'Type', 'Réf.', 'Libellé', 'Section', 'Ordre', 'Prix HT', 'Actif', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(row => (
              <tr key={row.id} style={row.row_kind === 'section' ? { background: 'rgba(99,102,241,0.06)' } : undefined}>
                <td style={{ padding: 8 }}>
                  <select value={row.grid_column} onChange={e => updateRow(row.id, 'grid_column', e.target.value)} style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid var(--color-border)', minWidth: 130 }}>
                    {columns.map(col => <option key={col.id} value={col.id}>{col.label}</option>)}
                  </select>
                </td>
                <td style={{ padding: 8 }}>
                  <select value={row.row_kind} onChange={e => updateRow(row.id, 'row_kind', e.target.value)} style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
                    <option value="item">Équipement</option>
                    <option value="section">Section</option>
                  </select>
                </td>
                <td style={{ padding: 8 }}><Input row={row} field="ref" onChange={(f, v) => updateRow(row.id, f, v)} width={70} placeholder="4120" /></td>
                <td style={{ padding: 8 }}><Input row={row} field="label" onChange={(f, v) => updateRow(row.id, f, v)} width={280} /></td>
                <td style={{ padding: 8 }}><Input row={row} field="section_label" onChange={(f, v) => updateRow(row.id, f, v)} width={160} /></td>
                <td style={{ padding: 8 }}><Input row={row} field="sort_order" onChange={(f, v) => updateRow(row.id, f, v)} width={50} /></td>
                <td style={{ padding: 8 }}><Input row={row} field="price_ht" onChange={(f, v) => updateRow(row.id, f, v)} width={70} /></td>
                <td style={{ padding: 8 }}><input type="checkbox" checked={Boolean(row.active)} onChange={e => updateRow(row.id, 'active', e.target.checked)} /></td>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                  <button type="button" className="admin-table-icon-btn" onClick={() => updateItem(row)} disabled={savingId === row.id} title="Enregistrer">
                    {savingId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  </button>
                  <button type="button" className="admin-table-icon-btn admin-table-icon-btn--danger" onClick={() => deleteItem(row)} title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(34,197,94,0.06)' }}>
              <td style={{ padding: 8 }}>
                <select value={draft.grid_column} onChange={e => updateDraft('grid_column', e.target.value)} style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid var(--color-border)', minWidth: 130 }}>
                  {columns.map(col => <option key={col.id} value={col.id}>{col.label}</option>)}
                </select>
              </td>
              <td style={{ padding: 8 }}>
                <select value={draft.row_kind} onChange={e => updateDraft('row_kind', e.target.value)} style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
                  <option value="item">Équipement</option>
                  <option value="section">Section</option>
                </select>
              </td>
              <td style={{ padding: 8 }}><Input row={draft} field="ref" onChange={updateDraft} width={70} /></td>
              <td style={{ padding: 8 }}><Input row={draft} field="label" onChange={updateDraft} width={280} placeholder="Libellé équipement" /></td>
              <td style={{ padding: 8 }}><Input row={draft} field="section_label" onChange={updateDraft} width={160} /></td>
              <td style={{ padding: 8 }}><Input row={draft} field="sort_order" onChange={updateDraft} width={50} /></td>
              <td style={{ padding: 8 }}><Input row={draft} field="price_ht" onChange={updateDraft} width={70} /></td>
              <td style={{ padding: 8 }}><input type="checkbox" checked={draft.active} onChange={e => updateDraft('active', e.target.checked)} /></td>
              <td style={{ padding: 8 }}>
                <button type="button" className="admin-btn-primary" onClick={createItem} disabled={savingId === 'new'}>
                  {savingId === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ajouter
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {confirmDialog && (
        <div data-modal-backdrop="true" onClick={() => setConfirmDialog(null)} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--color-surface)', borderRadius: 10, padding: 20, width: 420, maxWidth: '92vw' }}>
            <h3 style={{ margin: '0 0 8px' }}>{confirmDialog.title}</h3>
            <p style={{ margin: '0 0 16px', color: 'var(--color-text-2)' }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="admin-btn-ghost" onClick={() => setConfirmDialog(null)}>Annuler</button>
              <button type="button" className="admin-btn-primary" style={confirmDialog.danger ? { background: '#dc2626' } : undefined} onClick={confirmDialog.onConfirm}>{confirmDialog.confirmLabel || 'Confirmer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
