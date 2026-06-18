import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, FileSearch, Loader2, RefreshCw, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../api/index.js'
import AppPageShell from '../components/AppPageShell.jsx'

function formatMoney(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return '—'
  return `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € HT`
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function matchesSearch(devis, query) {
  if (!query.trim()) return true
  const haystack = [devis.display_name, devis.quote_number, devis.current_version_number, devis.name, devis.client_name, devis.deal_id, devis.company_id, devis.status]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query.trim().toLowerCase())
}

export default function DevisSearch() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') || '')

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/devis')
      setRows(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err?.error || err?.message || 'Impossible de charger les devis')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRows() }, [loadRows])

  const filteredRows = useMemo(() => rows.filter(row => matchesSearch(row, query)), [query, rows])

  return (
    <AppPageShell
      title="Recherche devis"
      subtitle="Tous les devis en ordre chronologique, avec accès rapide au devis et au PDF."
      contentClassName="quote-search-main-wrap"
      headerActions={(
        <button type="button" className="admin-btn-ghost" onClick={loadRows} disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Actualiser
        </button>
      )}
    >
      <main className="quote-search-main">
        <div className="quote-search-toolbar">
          <div className="quote-search-input-wrap">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher par numéro, client, affaire..." />
          </div>
          <span>{filteredRows.length} devis</span>
        </div>

        {error && <div className="quote-search-error">{error}</div>}

        <div className="quote-search-table-wrap">
          <table className="quote-search-table">
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Affaire</th>
                <th>Client</th>
                <th className="amount-cell">Montant</th>
                <th>Versions</th>
                <th>Modifié</th>
                <th>Accès</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="quote-search-empty"><Loader2 size={18} className="spin" /> Chargement...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={7} className="quote-search-empty"><FileSearch size={18} /> Aucun devis trouvé</td></tr>
              ) : filteredRows.map((devis) => (
                <tr key={devis.id}>
                  <td><strong>{devis.display_name || devis.quote_number || `#${devis.id}`}</strong></td>
                  <td>{devis.name || devis.deal_id || '—'}</td>
                  <td>{devis.client_name || '—'}</td>
                  <td className="amount-cell">{formatMoney(devis.total_ht)}</td>
                  <td>{Number(devis.versions_count || 0)} · {Number(devis.row_count || 0)} ligne(s)</td>
                  <td>{formatDate(devis.updated_at)}</td>
                  <td>
                    <div className="quote-search-actions">
                      <button type="button" onClick={() => navigate(`/devis?devis=${devis.id}`)} title="Ouvrir le devis">
                        <ExternalLink size={14} />
                      </button>
                      <a href={`/api/devis/${devis.id}/pdf`} target="_blank" rel="noreferrer" title="Ouvrir le PDF">
                        <Download size={14} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </AppPageShell>
  )
}