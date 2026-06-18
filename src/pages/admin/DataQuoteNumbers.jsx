import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react'
import api from '../../api/index.js'

export default function DataQuoteNumbers() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [nextValue, setNextValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [openMonths, setOpenMonths] = useState(new Set())
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await api.get('/quote-admin/numbers')
      setData(payload)
      setNextValue(String(payload.next_value || ''))
      if (payload.months?.[0]?.month) setOpenMonths(new Set([payload.months[0].month]))
    } catch (err) {
      setMessage(err?.error || err?.message || 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const saveSequence = async () => {
    setSaving(true)
    setMessage('')
    try {
      const result = await api.put('/quote-admin/sequence', { next_value: Number(nextValue) })
      setNextValue(String(result.next_value))
      setMessage(`Prochain numéro : 605.${String(result.next_value).padStart(4, '0')}`)
      await load()
    } catch (err) {
      setMessage(err?.error || err?.message || 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  const toggleMonth = (month) => {
    setOpenMonths(prev => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  if (loading) return <div style={{ padding: 24 }}><Loader2 size={16} /> Chargement…</div>

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>Numérotation des devis</h2>
      <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--color-text-3)' }}>Format actuel AMM.9999 (ex. 605.0106)</p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 24, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>Prochaine séquence (4 chiffres)</span>
          <input type="number" min={1} max={9999} value={nextValue} onChange={e => setNextValue(e.target.value)} style={{ width: 120, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)' }} />
        </label>
        <button type="button" onClick={saveSequence} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          <Save size={14} /> Enregistrer
        </button>
      </div>
      {message && <p style={{ fontSize: 12, marginBottom: 16 }}>{message}</p>}

      {data?.reserved_label && (
        <p style={{ fontSize: 12, marginBottom: 12, color: 'var(--color-text-2)' }}>
          Prochain numéro réservé : <strong>{data.reserved_label}</strong>
          {data.global_hole_count > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--color-warning, #b45309)' }}>
              ({data.global_hole_count} trou{data.global_hole_count > 1 ? 's' : ''} dans la séquence)
            </span>
          )}
        </p>
      )}

      {data?.global_holes?.length > 0 && (
        <div style={{ marginBottom: 20, padding: '10px 12px', borderRadius: 8, border: '1px dashed var(--color-border)', fontSize: 12 }}>
          <strong>Trous de numérotation (séquence globale)</strong>
          <div style={{ marginTop: 6, color: 'var(--color-text-3)', lineHeight: 1.6 }}>
            {data.global_holes.slice(0, 20).map(seq => `605.${String(seq).padStart(4, '0')}`).join(', ')}
            {data.global_hole_count > 20 ? ` … +${data.global_hole_count - 20}` : ''}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(data?.months || []).map(month => (
          <div key={month.month} style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <button type="button" onClick={() => toggleMonth(month.month)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: 'none', background: 'var(--color-surface)', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              {openMonths.has(month.month) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              {month.month} — {month.count} devis
            </button>
            {openMonths.has(month.month) && (
              <div style={{ padding: '8px 12px 12px', fontSize: 12 }}>
                {month.holes?.length > 0 && (
                  <div style={{ marginBottom: 8, padding: '6px 8px', borderRadius: 6, background: 'var(--color-surface-2, rgba(0,0,0,0.03))' }}>
                    {month.holes.map(hole => (
                      <div key={hole.prefix} style={{ marginBottom: 4 }}>
                        <span style={{ color: 'var(--color-text-3)' }}>Trous {hole.prefix}.xxxx : </span>
                        {hole.holes.slice(0, 12).map(seq => `${hole.prefix}.${String(seq).padStart(4, '0')}`).join(', ')}
                        {hole.holes.length > 12 ? ` … +${hole.holes.length - 12}` : ''}
                      </div>
                    ))}
                  </div>
                )}
                {month.items.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: '1px dashed var(--color-border)' }}>
                    <strong>{item.quote_number || item.name}</strong>
                    <span style={{ color: 'var(--color-text-3)' }}>{item.client_name || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
