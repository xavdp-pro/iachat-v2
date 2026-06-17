import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, RefreshCw, Save, Scale, Trash2 } from 'lucide-react'
import api from '../api/index.js'

const emptyProfile = {
  type_label: '',
  product_family: 'BP',
  leaf_kg_m2: '',
  frame_kg_m: '',
  leaf_formula: '',
  sort_order: 0,
  active: true,
  notes: '',
}

const numberFields = new Set(['leaf_kg_m2', 'frame_kg_m', 'sort_order'])

function normalizeProfile(row) {
  return {
    ...emptyProfile,
    ...row,
    active: row.active === undefined ? true : Boolean(row.active),
  }
}

function fieldValue(value) {
  return value ?? ''
}

function Input({ row, field, onChange, type = 'text', width = 120, placeholder = '' }) {
  return (
    <input
      type={type}
      value={fieldValue(row[field])}
      placeholder={placeholder}
      onChange={event => onChange(field, numberFields.has(field) ? event.target.value.replace(',', '.') : event.target.value)}
      style={{ width, minWidth: width, padding: '6px 7px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 12 }}
    />
  )
}

export default function DataWeightProfiles() {
  const [profiles, setProfiles] = useState([])
  const [draft, setDraft] = useState(emptyProfile)
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [previewForm, setPreviewForm] = useState({
    designation: 'BP 1V CR4 EI60 2100 x 1000',
    gamme: 'CR4 EI60',
    rc: 'CR4',
    cf: 'EI60',
    haut_mm: '2100',
    larg_mm: '1000',
    qty: '1',
    vitrage_kg_m2: '',
  })
  const [previewResult, setPreviewResult] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)

  const activeCount = useMemo(() => profiles.filter(row => row.active).length, [profiles])

  const flashSaved = () => {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  const loadProfiles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await api.get('/weight-profiles')
      setProfiles(Array.isArray(rows) ? rows.map(normalizeProfile) : [])
    } catch (err) {
      setError(err.error || err.message || 'Impossible de charger les profils poids')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProfiles() }, [loadProfiles])

  const seedDefaults = async () => {
    setSavingId('seed')
    setError('')
    try {
      await api.post('/weight-profiles/seed-defaults')
      await loadProfiles()
      flashSaved()
    } catch (err) {
      setError(err.error || err.message || 'Import impossible')
    } finally {
      setSavingId(null)
    }
  }

  const createProfile = async () => {
    if (!draft.type_label.trim()) {
      setError('Le libellé type est requis')
      return
    }
    setSavingId('new')
    setError('')
    try {
      const created = await api.post('/weight-profiles', draft)
      setProfiles(prev => [...prev, normalizeProfile(created)])
      setDraft(emptyProfile)
      flashSaved()
    } catch (err) {
      setError(err.error || err.message || 'Création impossible')
    } finally {
      setSavingId(null)
    }
  }

  const updateProfile = async (row) => {
    setSavingId(row.id)
    setError('')
    try {
      const updated = await api.put(`/weight-profiles/${row.id}`, row)
      setProfiles(prev => prev.map(item => item.id === row.id ? normalizeProfile(updated) : item))
      flashSaved()
    } catch (err) {
      setError(err.error || err.message || 'Mise à jour impossible')
    } finally {
      setSavingId(null)
    }
  }

  const deleteProfile = async (row) => {
    setConfirmDialog({
      title: 'Supprimer le profil',
      message: `Supprimer le profil « ${row.type_label} » ?`,
      danger: true,
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        setConfirmDialog(null)
        setSavingId(row.id)
        setError('')
        try {
          await api.delete(`/weight-profiles/${row.id}`)
          setProfiles(prev => prev.filter(item => item.id !== row.id))
          flashSaved()
        } catch (err) {
          setError(err.error || err.message || 'Suppression impossible')
        } finally {
          setSavingId(null)
        }
      },
    })
  }

  const runPreview = async () => {
    setError('')
    try {
      const row = {
        designation: previewForm.designation,
        gamme: previewForm.gamme,
        rc: previewForm.rc || null,
        cf: previewForm.cf || null,
        haut_mm: Number(previewForm.haut_mm),
        larg_mm: Number(previewForm.larg_mm),
        qty: Number(previewForm.qty) || 1,
        line_section: 'products',
      }
      const result = await api.post('/weight-profiles/preview-line', {
        row,
        vitrage_kg_m2: previewForm.vitrage_kg_m2 || null,
      })
      setPreviewResult(result)
    } catch (err) {
      setError(err.error || err.message || 'Prévisualisation impossible')
    }
  }

  const updateDraft = (field, value) => setDraft(prev => ({ ...prev, [field]: value }))
  const updateRow = (id, field, value) => {
    setProfiles(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="admin-ollama-head">
        <div className="admin-ollama-icon"><Scale size={22} strokeWidth={2} /></div>
        <div>
          <h2>Calcul poids</h2>
          <p className="admin-ollama-desc">
            Coefficients issus de <code>ressources/XLSX/2606/Calcul poids.xlsx</code>.
            Utilisés pour estimer le poids total d&apos;un devis et sélectionner le tarif transport.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="admin-btn-ghost" onClick={loadProfiles} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Recharger
          </button>
          {profiles.length === 0 && (
            <button type="button" className="admin-btn-primary" onClick={seedDefaults} disabled={savingId === 'seed'}>
              {savingId === 'seed' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Importer Calcul poids.xlsx
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', color: '#b91c1c', fontSize: 13 }}>
          {error}
        </div>
      )}
      {saved && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.12)', color: '#15803d', fontSize: 13 }}>
          Enregistré.
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--color-text-2)' }}>
        <span><strong>{profiles.length}</strong> profils</span>
        <span><strong>{activeCount}</strong> actifs</span>
        <span>Formule BP : kg/m² × surface + kg/m × périmètre bâti</span>
      </div>

      <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', display: 'grid', gap: 10 }}>
        <strong style={{ fontSize: 13 }}>Test rapide (lien devis)</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <input value={previewForm.designation} onChange={e => setPreviewForm(p => ({ ...p, designation: e.target.value }))} placeholder="Désignation" style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid var(--color-border)' }} />
          <input value={previewForm.rc} onChange={e => setPreviewForm(p => ({ ...p, rc: e.target.value }))} placeholder="RC ex. CR4" style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid var(--color-border)' }} />
          <input value={previewForm.cf} onChange={e => setPreviewForm(p => ({ ...p, cf: e.target.value }))} placeholder="Feu ex. EI60" style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid var(--color-border)' }} />
          <input value={previewForm.haut_mm} onChange={e => setPreviewForm(p => ({ ...p, haut_mm: e.target.value }))} placeholder="H mm" style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid var(--color-border)' }} />
          <input value={previewForm.larg_mm} onChange={e => setPreviewForm(p => ({ ...p, larg_mm: e.target.value }))} placeholder="L mm" style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid var(--color-border)' }} />
          <input value={previewForm.qty} onChange={e => setPreviewForm(p => ({ ...p, qty: e.target.value }))} placeholder="Qté" style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid var(--color-border)' }} />
        </div>
        <button type="button" className="admin-btn-primary" onClick={runPreview} style={{ width: 'fit-content' }}>
          Calculer le poids ligne
        </button>
        {previewResult && (
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <div>Profil : <strong>{previewResult.profile?.type_label || '—'}</strong></div>
            <div>Poids estimé : <strong>{previewResult.weight_kg != null ? `${previewResult.weight_kg} kg` : '—'}</strong></div>
            {previewResult.candidates?.length > 0 && (
              <div style={{ color: 'var(--color-text-2)', marginTop: 4 }}>
                Candidats : {previewResult.candidates.join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--color-input-bg)' }}>
              {['Type', 'Fam.', 'kg/m² vantail', 'kg/m bâti', 'Formule', 'Ordre', 'Actif', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map(row => (
              <tr key={row.id}>
                <td style={{ padding: 8 }}><Input row={row} field="type_label" onChange={(f, v) => updateRow(row.id, f, v)} width={220} /></td>
                <td style={{ padding: 8 }}>
                  <select value={row.product_family || 'BP'} onChange={e => updateRow(row.id, 'product_family', e.target.value)} style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                    <option value="BP">BP</option>
                    <option value="CF">CF</option>
                  </select>
                </td>
                <td style={{ padding: 8 }}><Input row={row} field="leaf_kg_m2" onChange={(f, v) => updateRow(row.id, f, v)} width={80} /></td>
                <td style={{ padding: 8 }}><Input row={row} field="frame_kg_m" onChange={(f, v) => updateRow(row.id, f, v)} width={70} /></td>
                <td style={{ padding: 8 }}>
                  <select value={row.leaf_formula || ''} onChange={e => updateRow(row.id, 'leaf_formula', e.target.value || null)} style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', minWidth: 180 }}>
                    <option value="">Numérique (kg/m²)</option>
                    <option value="vitrage_surface_minus_100mm">Vitrage × surface −100 mm</option>
                  </select>
                </td>
                <td style={{ padding: 8 }}><Input row={row} field="sort_order" onChange={(f, v) => updateRow(row.id, f, v)} width={50} /></td>
                <td style={{ padding: 8 }}>
                  <input type="checkbox" checked={Boolean(row.active)} onChange={e => updateRow(row.id, 'active', e.target.checked)} />
                </td>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                  <button type="button" className="admin-table-icon-btn" onClick={() => updateProfile(row)} disabled={savingId === row.id} title="Enregistrer">
                    {savingId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  </button>
                  <button type="button" className="admin-table-icon-btn admin-table-icon-btn--danger" onClick={() => deleteProfile(row)} title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(99,102,241,0.06)' }}>
              <td style={{ padding: 8 }}><Input row={draft} field="type_label" onChange={updateDraft} width={220} placeholder="BP Nexus CR4" /></td>
              <td style={{ padding: 8 }}>
                <select value={draft.product_family} onChange={e => updateDraft('product_family', e.target.value)} style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
                  <option value="BP">BP</option>
                  <option value="CF">CF</option>
                </select>
              </td>
              <td style={{ padding: 8 }}><Input row={draft} field="leaf_kg_m2" onChange={updateDraft} width={80} /></td>
              <td style={{ padding: 8 }}><Input row={draft} field="frame_kg_m" onChange={updateDraft} width={70} /></td>
              <td style={{ padding: 8 }}>
                <select value={draft.leaf_formula || ''} onChange={e => updateDraft('leaf_formula', e.target.value)} style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid var(--color-border)', minWidth: 180 }}>
                  <option value="">Numérique (kg/m²)</option>
                  <option value="vitrage_surface_minus_100mm">Vitrage × surface −100 mm</option>
                </select>
              </td>
              <td style={{ padding: 8 }}><Input row={draft} field="sort_order" onChange={updateDraft} width={50} /></td>
              <td style={{ padding: 8 }}><input type="checkbox" checked={draft.active} onChange={e => updateDraft('active', e.target.checked)} /></td>
              <td style={{ padding: 8 }}>
                <button type="button" className="admin-btn-primary" onClick={createProfile} disabled={savingId === 'new'}>
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
