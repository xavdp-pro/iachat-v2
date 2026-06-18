import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2, Sparkles } from 'lucide-react'
import api from '../api/index.js'
import AppSidebar from '../components/AppSidebar.jsx'
import AppBreadcrumbs from '../components/AppBreadcrumbs.jsx'
import { useAppBreadcrumbs } from '../hooks/useAppBreadcrumbs.js'
import { resolveRow } from './DevisGrid.jsx'

const SECTION_LABEL = {
  products: 'Produits',
  calculations: 'Calculs',
  transport: 'Transport',
}

function euro(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toLocaleString('fr-FR')} €`
}

function rowLetterLabel(index) {
  let n = index + 1
  let label = ''
  while (n > 0) {
    n -= 1
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26)
  }
  return label
}

function equipmentLabel(equipment) {
  if (!equipment) return ''
  if (typeof equipment === 'string') return equipment
  const label = String(equipment.label || equipment.designation || equipment.ref || '').trim()
  const ref = String(equipment.ref || '').trim()
  const price = Number(equipment.prix ?? equipment.price)
  const priceLabel = Number.isFinite(price) ? ` : +${price.toLocaleString('fr-FR')} €` : ''
  const note = String(equipment.note || '').trim()
  const main = label ? (ref && !label.includes(ref) ? `${label} réf.${ref}` : label) : ref
  return [main, note && !note.includes(main) ? note : ''].filter(Boolean).join(' — ') + priceLabel
}

function isDuplicateAcousticPlinthLine(value) {
  const text = String(value || '')
  return /acoustique|\b(30|35|40|45)\s*dB\b/i.test(text) && /plinthe/i.test(text)
}

function cleanPdfPreviewDesignation(value = '') {
  return String(value || '')
    .split('\n')
    .filter(line => !isDuplicateAcousticPlinthLine(line))
    .join('\n')
    .replace(/Equipement fourni-posé\s*:\s*\n\s*(?=(?:Localisation|Dimensions|Finition|$))/giu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function loadRows() {
  try {
    const raw = localStorage.getItem('devisGridRows')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export default function DevisGridPdfDraft() {
  const navigate = useNavigate()
  const breadcrumbs = useAppBreadcrumbs()
  const [rows, setRows] = useState(() => loadRows())
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [suggestingIndex, setSuggestingIndex] = useState(null)
  const [suggestingAll, setSuggestingAll] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem('devisGridRows', JSON.stringify(rows))
    } catch { /* noop */ }
  }, [rows])

  const previewRows = useMemo(() => rows.map((row) => {
    const r = resolveRow(row)
    return {
      ...row,
      _resolved: r,
      _label: cleanPdfPreviewDesignation(row.designation || r.designation || row.type || r.type || '') || 'Ligne sans libellé',
      _total: Number(r._totalHt || row.total_ligne_ht || row.prix_total_min_ht || row.prix_base_ht || 0),
      _section: row.line_section || 'products',
      _equipments: (Array.isArray(row.equip_extra) ? row.equip_extra : []).map(equipmentLabel).filter(label => label && !isDuplicateAcousticPlinthLine(label)),
    }
  }), [rows])

  const grandTotal = useMemo(
    () => previewRows.reduce((sum, row) => sum + (Number(row._total) || 0), 0),
    [previewRows],
  )

  const updateLabel = (idx, value) => {
    setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, designation: value } : row)))
  }

  const saveDraft = async () => {
    setSaving(true)
    setStatus('')
    try {
      localStorage.setItem('devisGridRows', JSON.stringify(rows))
      setStatus('Libellés enregistrés dans la grille locale')
    } catch (err) {
      setStatus(err?.message || 'Erreur sauvegarde locale')
    } finally {
      setSaving(false)
    }
  }

  const requestSuggestion = async (row, idx) => {
    try {
      const payload = resolveRow(row)
      const contextLines = rows
        .filter((r) => (r.line_section || 'products') === 'products')
        .slice(Math.max(0, idx - 2), idx + 3)
        .map((r) => resolveRow(r))
      const data = await api.post('/devis/suggest-designation', { line: payload, context_lines: contextLines }, { timeout: 90000 })
      const suggestion = String(data?.designation || '').trim()
      if (!suggestion) {
        return { ok: false, message: 'Aucune suggestion IA trouvée' }
      }
      updateLabel(idx, suggestion)
      return {
        ok: true,
        message: data?.examples?.length
          ? `Suggestion IA appliquée (${data.examples.length} exemples, contexte ${data?.context_count ?? contextLines.length} lignes)`
          : 'Suggestion IA appliquée',
      }
    } catch (err) {
      return { ok: false, message: err?.error || err?.message || 'Erreur suggestion IA' }
    }
  }

  const suggestLabel = async (row, idx) => {
    if ((row.line_section || 'products') !== 'products') return
    setSuggestingIndex(idx)
    setStatus('')
    try {
      const result = await requestSuggestion(row, idx)
      setStatus(result.message)
    } finally {
      setSuggestingIndex(null)
    }
  }

  const suggestAllLabels = async () => {
    const targets = rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => (row.line_section || 'products') === 'products')
    if (!targets.length) return

    setSuggestingAll(true)
    setStatus(`Génération IA en cours… (0/${targets.length})`)
    let okCount = 0
    for (let i = 0; i < targets.length; i += 1) {
      const { row, idx } = targets[i]
      setSuggestingIndex(idx)
      const result = await requestSuggestion(row, idx)
      if (result.ok) okCount += 1
      setStatus(`Génération IA en cours… (${i + 1}/${targets.length})`)
    }
    setSuggestingIndex(null)
    setSuggestingAll(false)
    setStatus(`Génération IA terminée : ${okCount}/${targets.length} libellés mis à jour`)
  }

  return (
    <div className="app-shell home-shell devis-grid-shell">
      <AppSidebar />
      <div className="devis-grid-shell-main">
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto auto 1fr', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <div className="devis-grid-crumb-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <AppBreadcrumbs items={breadcrumbs} compact />
      </div>
      <div style={{ borderBottom: '1px solid var(--color-border)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => navigate('/devis/grid')}
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', borderRadius: 6, width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          title="Retour à la grille"
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Pré-édition PDF (rendu web)</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Modifier les libellés à gauche, aperçu PDF live à droite</div>
        </div>
        {status ? <span style={{ fontSize: 11, color: status.toLowerCase().includes('erreur') ? '#dc2626' : 'var(--color-text-2)' }}>{status}</span> : null}
        <button
          type="button"
          onClick={saveDraft}
          disabled={saving || suggestingAll}
          style={{ border: '1px solid var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 12%, var(--color-surface))', color: 'var(--color-primary)', borderRadius: 6, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: saving ? 'default' : 'pointer', fontWeight: 700, fontSize: 11 }}
        >
          {saving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
          Enregistrer
        </button>
        <button
          type="button"
          onClick={suggestAllLabels}
          disabled={suggestingAll || saving || !rows.some((r) => (r.line_section || 'products') === 'products')}
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', borderRadius: 6, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: suggestingAll ? 'default' : 'pointer', fontWeight: 700, fontSize: 11 }}
          title="Générer automatiquement les libellés IA pour toutes les lignes produit"
        >
          {suggestingAll ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
          Lancer génération IA
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 0.95fr) minmax(560px, 1.05fr)', minHeight: 0 }}>
        <div style={{ overflowY: 'auto', borderRight: '1px solid var(--color-border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.length === 0 ? (
            <div style={{ border: '1px dashed var(--color-border)', borderRadius: 8, padding: 14, fontSize: 12, color: 'var(--color-text-3)' }}>
              Aucune ligne importée. Retournez au tableau puis importez un xlsx.
            </div>
          ) : rows.map((row, idx) => {
            const section = row.line_section || 'products'
            return (
              <div key={idx} style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--color-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--color-border)', padding: '8px 10px' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--color-text-3)' }}>{rowLetterLabel(idx)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{SECTION_LABEL[section] || section}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-3)' }}>H {row.haut_mm || '?'} × L {row.larg_mm || '?'} mm</span>
                  {section === 'products' && (
                    <button
                      type="button"
                      onClick={() => suggestLabel(row, idx)}
                      disabled={suggestingIndex === idx}
                      style={{ marginLeft: 'auto', width: 24, height: 24, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: suggestingIndex === idx ? 'default' : 'pointer' }}
                      title="Suggestion IA (libellé PDF)"
                    >
                      {suggestingIndex === idx ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
                    </button>
                  )}
                </div>
                <textarea
                  value={row.designation || ''}
                  onChange={(e) => updateLabel(idx, e.target.value)}
                  rows={Math.max(3, Math.min(10, String(row.designation || '').split('\n').length + 1))}
                  style={{ width: '100%', border: 'none', background: 'transparent', color: 'var(--color-text)', fontSize: 12, lineHeight: 1.4, padding: 10, resize: 'vertical', outline: 'none', fontFamily: 'var(--font-body)' }}
                  placeholder="Libellé imprimé sur le PDF…"
                />
              </div>
            )
          })}
        </div>

        <div style={{ overflow: 'auto', padding: 16, background: 'color-mix(in srgb, var(--color-primary) 3%, var(--color-bg))' }}>
          <div style={{ maxWidth: 920, margin: '0 auto', background: '#fff', color: '#222', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', border: '1px solid #d7d7d7', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #d9d9d9', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '0.03em', color: '#3c4b4d' }}>ZERUX</div>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#607174' }}>Prévisualisation PDF web</div>
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>Total HT: <strong>{euro(grandTotal)}</strong></div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#3c4b4d', color: '#fff' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', width: 36 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Désignation</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', width: 120 }}>Dimensions</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', width: 110 }}>Total HT</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #ececec', verticalAlign: 'top' }}>
                    <td style={{ padding: '8px 8px', color: '#5f6f72', fontWeight: 700 }}>{rowLetterLabel(idx)}</td>
                    <td style={{ padding: '8px 8px' }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{row._label}</div>
                      {row.gamme ? <div style={{ color: '#6f6f6f', fontSize: 11 }}>{row.gamme} {row.vantail ? `— ${row.vantail}` : ''}</div> : null}
                      {row._equipments?.length ? (
                        <ul style={{ margin: '5px 0 0', paddingLeft: 16, color: '#555', fontSize: 11, lineHeight: 1.45 }}>
                          {row._equipments.map((equipment, equipmentIndex) => <li key={`${idx}-equipment-${equipmentIndex}`}>{equipment}</li>)}
                        </ul>
                      ) : null}
                    </td>
                    <td style={{ padding: '8px 8px', color: '#555' }}>H {row.haut_mm || '?'} × L {row.larg_mm || '?'} mm</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700 }}>{euro(row._total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
      </div>
    </div>
  )
}
