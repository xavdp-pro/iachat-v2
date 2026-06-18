import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2, RefreshCw } from 'lucide-react'
import api from '../../api/index.js'

export default function DataExchangeRates() {
  const [status, setStatus] = useState(null)
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/exchange-rates/status')
      setStatus(data)
      setRates(data.rates || [])
    } catch (err) {
      setMessage(err?.error || err?.message || 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const updateRate = (currency, field, value) => {
    setRates(prev => prev.map(item => item.currency === currency ? { ...item, [field]: value } : item))
  }

  const validate = async (unchanged = false) => {
    setSaving(true)
    setMessage('')
    try {
      const data = await api.post('/exchange-rates/validate', {
        rates: rates.map(r => ({
          currency: r.currency,
          rate_to_eur: Number(String(r.rate_to_eur).replace(',', '.')),
          tva_rate: Number(String(r.tva_rate).replace(',', '.')),
        })),
        confirm_unchanged: unchanged,
      })
      setStatus(data)
      setRates(data.rates || [])
      setMessage(unchanged ? 'Taux confirmés sans modification' : 'Taux enregistrés et validés')
    } catch (err) {
      setMessage(err?.error || err?.message || 'Validation impossible')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={16} className="spin" /> Chargement…</div>
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Taux de change</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-3)' }}>Semestre {status?.semester} — validation requise le 1er janvier et le 1er juin</p>
        </div>
        <button type="button" onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer' }}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {status?.alert_active && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, border: '1px solid #dc2626', background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={16} /> Les taux de change doivent être validés pour ce semestre.
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '8px 6px' }}>Devise</th>
            <th style={{ padding: '8px 6px' }}>Taux (1 décimale)</th>
            <th style={{ padding: '8px 6px' }}>TVA</th>
          </tr>
        </thead>
        <tbody>
          {rates.map(row => (
            <tr key={row.currency} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '8px 6px', fontWeight: 800 }}>{row.currency}</td>
              <td style={{ padding: '8px 6px' }}>
                <input type="text" value={row.rate_to_eur} onChange={e => updateRate(row.currency, 'rate_to_eur', e.target.value)} style={{ width: 80, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--color-border)' }} />
              </td>
              <td style={{ padding: '8px 6px' }}>
                <input type="text" value={row.tva_rate} onChange={e => updateRate(row.currency, 'tva_rate', e.target.value)} style={{ width: 80, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--color-border)' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={saving} onClick={() => validate(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          {saving ? <Loader2 size={14} /> : <Check size={14} />} Enregistrer les taux
        </button>
        <button type="button" disabled={saving} onClick={() => validate(true)} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer' }}>
          Confirmer sans changement
        </button>
      </div>
      {message && <p style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-2)' }}>{message}</p>}
    </div>
  )
}
