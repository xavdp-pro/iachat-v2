import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Loader2, Plus, RefreshCw, Save, Search, Trash2, Truck } from 'lucide-react'
import api from '../api/index.js'

const emptyTariff = {
  label: '',
  zone: '',
  canton_codes: '',
  covered_countries: '',
  country: 'FR',
  postal_prefix: '',
  min_weight_kg: '',
  max_weight_kg: '',
  max_length_mm: '',
  max_width_mm: '',
  max_height_mm: '',
  price_ht: '',
  currency: 'EUR',
  active: true,
  sort_order: 0,
  notes: '',
}

const numberFields = new Set(['min_weight_kg', 'max_weight_kg', 'max_length_mm', 'max_width_mm', 'max_height_mm', 'price_ht', 'sort_order'])

function euro(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—'
}

function normalizeTariff(row) {
  return { ...emptyTariff, ...row, active: row.active === undefined ? true : Boolean(row.active) }
}

function fieldValue(value) {
  return value ?? ''
}

function Input({ row, field, onChange, type = 'text', width = 100, placeholder = '' }) {
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

export default function TransportTariffs() {
  const [tariffs, setTariffs] = useState([])
  const [draft, setDraft] = useState(emptyTariff)
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [matchForm, setMatchForm] = useState({ weight_kg: '', country: '', postal_code: '', canton: '', destination: '', leaf_count: '1' })
  const [matchResult, setMatchResult] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)

  const activeCount = useMemo(() => tariffs.filter(row => row.active).length, [tariffs])

  const loadTariffs = async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await api.get('/transport-tariffs')
      setTariffs(Array.isArray(rows) ? rows.map(normalizeTariff) : [])
    } catch (err) {
      setError(err.error || err.message || 'Impossible de charger les tarifs transport')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTariffs() }, [])

  const flashSaved = () => {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  const createTariff = async () => {
    if (!draft.label.trim()) {
      setError('Le libellé est requis')
      return
    }
    setSavingId('new')
    setError('')
    try {
      const created = await api.post('/transport-tariffs', draft)
      setTariffs(prev => [...prev, normalizeTariff(created)])
      setDraft(emptyTariff)
      flashSaved()
    } catch (err) {
      setError(err.error || err.message || 'Création impossible')
    } finally {
      setSavingId(null)
    }
  }

  const updateTariff = async (row) => {
    setSavingId(row.id)
    setError('')
    try {
      const updated = await api.put(`/transport-tariffs/${row.id}`, row)
      setTariffs(prev => prev.map(item => item.id === row.id ? normalizeTariff(updated) : item))
      flashSaved()
    } catch (err) {
      setError(err.error || err.message || 'Mise à jour impossible')
    } finally {
      setSavingId(null)
    }
  }

  const deleteTariff = async (row) => {
    setConfirmDialog({
      title: 'Supprimer le tarif',
      message: `Supprimer le tarif ${row.label} ?`,
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        setSavingId(row.id)
        setError('')
        try {
          await api.delete(`/transport-tariffs/${row.id}`)
          setTariffs(prev => prev.filter(item => item.id !== row.id))
          flashSaved()
        } catch (err) {
          setError(err.error || err.message || 'Suppression impossible')
        } finally {
          setSavingId(null)
        }
      },
    })
  }

  const patchRow = (id, field, value) => {
    setTariffs(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row))
  }

  const runMatch = async () => {
    setSavingId('match')
    setError('')
    try {
      const result = await api.post('/transport-tariffs/match', matchForm)
      setMatchResult(result)
    } catch (err) {
      setError(err.error || err.message || 'Recherche impossible')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <header style={{ height: 58, borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', background: 'var(--color-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/devis/grid" title="Retour au tableau de chiffrage" style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid var(--color-border)', color: 'var(--color-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            <ArrowLeft size={16} />
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Truck size={20} color="var(--color-primary)" />
            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Tarifs transport</h1>
              <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{tariffs.length} règles · {activeCount} actives</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saved && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#15803d', fontWeight: 700 }}><Check size={14} /> Enregistré</span>}
          <button onClick={loadTariffs} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
            {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />} Actualiser
          </button>
        </div>
      </header>

      <main style={{ padding: 18, display: 'grid', gap: 16 }}>
        {error && <div style={{ padding: '9px 12px', borderRadius: 6, background: 'rgba(163,60,60,0.1)', color: '#a33c3c', fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 16 }}>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--color-surface)' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 14 }}>Règles de facturation</h2>
              <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>1 tarif couvre 1 à 50 vantaux ; +1 tarif par tranche de 50</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 1280, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'color-mix(in srgb, var(--color-primary) 7%, var(--color-surface))' }}>
                    {['Actif', 'Ordre', 'Zone', 'Libellé', 'Cantons CH', 'Pays couverts', 'Prix HT', 'Notes', ''].map(head => (
                      <th key={head} style={{ padding: '8px 7px', textAlign: 'left', fontSize: 11, borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: 'var(--color-bg)' }}>
                    <td style={{ padding: 7 }}><input type="checkbox" checked={draft.active} onChange={event => setDraft(prev => ({ ...prev, active: event.target.checked }))} /></td>
                    <td style={{ padding: 7 }}><Input row={draft} field="sort_order" onChange={(field, value) => setDraft(prev => ({ ...prev, [field]: value }))} width={58} /></td>
                    <td style={{ padding: 7 }}><Input row={draft} field="zone" onChange={(field, value) => setDraft(prev => ({ ...prev, [field]: value }))} width={82} placeholder="Zone 1" /></td>
                    <td style={{ padding: 7 }}><Input row={draft} field="label" onChange={(field, value) => setDraft(prev => ({ ...prev, [field]: value }))} width={230} placeholder="Cantons Suisse proches" /></td>
                    <td style={{ padding: 7 }}><Input row={draft} field="canton_codes" onChange={(field, value) => setDraft(prev => ({ ...prev, [field]: value }))} width={260} placeholder="GE, VD, VS" /></td>
                    <td style={{ padding: 7 }}><Input row={draft} field="covered_countries" onChange={(field, value) => setDraft(prev => ({ ...prev, [field]: value }))} width={300} placeholder="Luxembourg, Belgique" /></td>
                    <td style={{ padding: 7 }}><Input row={draft} field="price_ht" onChange={(field, value) => setDraft(prev => ({ ...prev, [field]: value }))} width={82} /></td>
                    <td style={{ padding: 7 }}><Input row={draft} field="notes" onChange={(field, value) => setDraft(prev => ({ ...prev, [field]: value }))} width={190} /></td>
                    <td style={{ padding: 7 }}>
                      <button onClick={createTariff} disabled={savingId === 'new'} title="Créer le tarif" style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        {savingId === 'new' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={15} />}
                      </button>
                    </td>
                  </tr>

                  {tariffs.map(row => (
                    <tr key={row.id} style={{ opacity: row.active ? 1 : 0.55 }}>
                      <td style={{ padding: 7, borderTop: '1px solid var(--color-border)' }}><input type="checkbox" checked={Boolean(row.active)} onChange={event => patchRow(row.id, 'active', event.target.checked)} /></td>
                      <td style={{ padding: 7, borderTop: '1px solid var(--color-border)' }}><Input row={row} field="sort_order" onChange={(field, value) => patchRow(row.id, field, value)} width={58} /></td>
                      <td style={{ padding: 7, borderTop: '1px solid var(--color-border)' }}><Input row={row} field="zone" onChange={(field, value) => patchRow(row.id, field, value)} width={82} /></td>
                      <td style={{ padding: 7, borderTop: '1px solid var(--color-border)' }}><Input row={row} field="label" onChange={(field, value) => patchRow(row.id, field, value)} width={230} /></td>
                      <td style={{ padding: 7, borderTop: '1px solid var(--color-border)' }}><Input row={row} field="canton_codes" onChange={(field, value) => patchRow(row.id, field, value)} width={260} /></td>
                      <td style={{ padding: 7, borderTop: '1px solid var(--color-border)' }}><Input row={row} field="covered_countries" onChange={(field, value) => patchRow(row.id, field, value)} width={300} /></td>
                      <td style={{ padding: 7, borderTop: '1px solid var(--color-border)' }}><Input row={row} field="price_ht" onChange={(field, value) => patchRow(row.id, field, value)} width={82} /></td>
                      <td style={{ padding: 7, borderTop: '1px solid var(--color-border)' }}><Input row={row} field="notes" onChange={(field, value) => patchRow(row.id, field, value)} width={190} /></td>
                      <td style={{ padding: 7, borderTop: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                        <button onClick={() => updateTariff(row)} disabled={savingId === row.id} title="Enregistrer" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: 5 }}>
                          {savingId === row.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                        </button>
                        <button onClick={() => deleteTariff(row)} disabled={savingId === row.id} title="Supprimer" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: '#a33c3c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside style={{ border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface)', padding: 14, alignSelf: 'start', display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 14 }}>Simuler un tarif</h2>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-text-3)' }}>Canton suisse
              <input value={matchForm.canton} placeholder="GE, VD, ZH…" onChange={event => setMatchForm(prev => ({ ...prev, canton: event.target.value.toUpperCase() }))} style={{ padding: '8px 9px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-text-3)' }}>Destination pays
              <input value={matchForm.destination} placeholder="Belgique, Allemagne…" onChange={event => setMatchForm(prev => ({ ...prev, destination: event.target.value }))} style={{ padding: '8px 9px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-text-3)' }}>Nombre de vantaux
              <input value={matchForm.leaf_count} inputMode="numeric" onChange={event => setMatchForm(prev => ({ ...prev, leaf_count: event.target.value.replace(/\D/g, '') }))} style={{ padding: '8px 9px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-text-3)' }}>Poids kg
              <input value={matchForm.weight_kg} onChange={event => setMatchForm(prev => ({ ...prev, weight_kg: event.target.value.replace(',', '.') }))} style={{ padding: '8px 9px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-text-3)' }}>Pays
              <input value={matchForm.country} onChange={event => setMatchForm(prev => ({ ...prev, country: event.target.value }))} style={{ padding: '8px 9px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-text-3)' }}>Code postal
              <input value={matchForm.postal_code} onChange={event => setMatchForm(prev => ({ ...prev, postal_code: event.target.value }))} style={{ padding: '8px 9px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
            </label>
            <button onClick={runMatch} disabled={savingId === 'match'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 12px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
              {savingId === 'match' ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={15} />} Chercher
            </button>
            {matchResult?.tariff && (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, background: 'var(--color-bg)' }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{matchResult.tariff.label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, marginTop: 5 }}>{euro(matchResult.tariff.total_price_ht ?? matchResult.tariff.price_ht)}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginTop: 5 }}>
                  {euro(matchResult.tariff.unit_price_ht ?? matchResult.tariff.price_ht)} × {matchResult.tariff.tranche_count || 1} tranche{(matchResult.tariff.tranche_count || 1) > 1 ? 's' : ''} de 50 vantaux
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 5 }}>{matchResult.candidates?.length || 1} règle(s) compatible(s)</div>
              </div>
            )}
            {matchResult && !matchResult.tariff && (
              <div style={{ fontSize: 12, color: '#a06a2c', fontWeight: 700 }}>Aucun tarif actif ne correspond.</div>
            )}
          </aside>
        </section>
      </main>
      {confirmDialog && (
        <div onClick={() => setConfirmDialog(null)} style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={event => event.stopPropagation()} style={{ width: 360, maxWidth: '92vw', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', boxShadow: '0 14px 40px rgba(0,0,0,0.28)', padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--color-text)', marginBottom: 8 }}>{confirmDialog.title}</div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-2)', marginBottom: 14 }}>{confirmDialog.message}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setConfirmDialog(null)} style={{ padding: '7px 11px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text-2)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Annuler</button>
              <button type="button" onClick={async () => { const action = confirmDialog.onConfirm; setConfirmDialog(null); await action?.() }} style={{ padding: '7px 11px', borderRadius: 6, border: '1px solid transparent', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>{confirmDialog.confirmLabel || 'Confirmer'}</button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
