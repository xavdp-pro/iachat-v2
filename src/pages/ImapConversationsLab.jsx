import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Eye, Loader2, RefreshCw, Search, Shield, User } from 'lucide-react'
import EmailConversationViewer from '../components/EmailConversationViewer.jsx'
import api from '../api/index.js'
import AppPageShell from '../components/AppPageShell.jsx'
import { ZrSelect } from '../ui/ZrSelect.jsx'
import { ZrSearchableSelect } from '../ui/ZrSearchableSelect.jsx'

const PREVIEW_MAILBOXES = [
  { email: 'armand.guilhot@zerux.com', label: 'Armand Guilhot' },
  { email: 'arthur.milz@zerux.com', label: 'Arthur Milz' },
]

/**
 * Admin lab: preview commercial mailboxes via Microsoft Graph (read-only).
 * Contact picker is restricted to HubSpot CRM contacts only.
 */
export default function ImapConversationsLab() {
  const [status, setStatus] = useState(null)
  const [previewMailbox, setPreviewMailbox] = useState('armand.guilhot@zerux.com')
  const [crmContacts, setCrmContacts] = useState([])
  const [contactSearch, setContactSearch] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (previewMailbox) qs.set('preview_mailbox', previewMailbox)
      const st = await api.get(`/mail/status?${qs}`)
      setStatus(st)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [previewMailbox])

  const loadCrmContacts = useCallback(async (q = '', resetSelection = false) => {
    setContactsLoading(true)
    try {
      const qs = new URLSearchParams({ limit: '80' })
      if (previewMailbox) qs.set('preview_mailbox', previewMailbox)
      if (q.trim()) qs.set('q', q.trim())
      else qs.set('with_threads', '1')
      const data = await api.get(`/mail/crm-contacts?${qs}`)
      const list = data.contacts || []
      setCrmContacts(list)
      if (resetSelection || !contactEmail) {
        const withMail = list.find((c) => c.thread_count > 0) || list[0]
        if (withMail) setContactEmail(withMail.email)
      }
    } catch {
      setCrmContacts([])
    } finally {
      setContactsLoading(false)
    }
  }, [previewMailbox, contactEmail])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    loadCrmContacts(contactSearch, true)
  }, [previewMailbox])

  useEffect(() => {
    const timer = setTimeout(() => loadCrmContacts(contactSearch, false), 300)
    return () => clearTimeout(timer)
  }, [contactSearch, loadCrmContacts])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await api.post('/mail/sync')
      await load()
      await loadCrmContacts(contactSearch)
    } catch (err) {
      console.error(err)
    } finally {
      setSyncing(false)
    }
  }

  const graphOk = status?.mode === 'graph' && status?.graph?.auth_ok !== false
  const selectedContact = useMemo(
    () => crmContacts.find((c) => c.email === contactEmail) || null,
    [crmContacts, contactEmail],
  )
  const syncInfo = status?.mail_sync

  return (
    <AppPageShell
      title="Lab Mail Graph — aperçu commercial"
      subtitle={graphOk
        ? `Lecture seule · boîte ${status?.mailbox || previewMailbox} · contacts HubSpot uniquement`
        : 'Microsoft Graph non disponible — vérifier MS_GRAPH_*'}
      contentClassName="app-page-content app-page-content--flush"
      hideHeader={false}
      headerActions={(
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="admin-btn-ghost" onClick={triggerSync} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Sync…' : 'Sync CRM'}
          </button>
          <button type="button" className="admin-btn-ghost" onClick={load}>
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>
      )}
    >
      <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 10,
          border: '1px solid #fbbf24', background: 'rgba(251,191,36,0.1)',
        }}>
          <Shield size={18} style={{ flexShrink: 0, marginTop: 2, color: '#b45309' }} />
          <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--color-text-2)' }}>
            <strong style={{ color: '#b45309' }}>Lab admin — lecture seule</strong> — seuls les contacts présents dans le CRM HubSpot sont listés.
            Le robot synchronise régulièrement leurs emails depuis la boîte commerciale.
            {syncInfo ? (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-3)' }}>
                Index CRM : {syncInfo.crm_contacts_indexed} contacts · cache : {syncInfo.mail_cache_entries} entrées
                {syncInfo.last_run?.finished_at ? ` · dernière sync ${new Date(syncInfo.last_run.finished_at).toLocaleString('fr-FR')}` : ''}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontWeight: 700 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>
              <Eye size={12} /> Aperçu boîte
            </span>
            <ZrSelect
              fullWidth
              ariaLabel="Aperçu boîte mail"
              value={previewMailbox}
              options={PREVIEW_MAILBOXES.map((box) => ({
                value: box.email,
                label: `${box.label} — ${box.email}`,
              }))}
              onChange={(next) => {
                setPreviewMailbox(next)
                setSelectedMessage(null)
                setContactEmail('')
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontWeight: 700 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>
              <Search size={12} /> Recherche CRM
            </span>
            <input
              type="search"
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
              placeholder="Nom, entreprise, email…"
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12 }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontWeight: 700 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>
              <User size={12} /> Contact HubSpot
            </span>
            <ZrSearchableSelect
              fullWidth
              ariaLabel="Contact HubSpot"
              value={contactEmail}
              disabled={contactsLoading || !crmContacts.length}
              options={contactsLoading
                ? [{ value: '', label: 'Chargement…' }]
                : !crmContacts.length
                  ? [{ value: '', label: 'Aucun contact CRM indexé' }]
                  : crmContacts.map((c) => ({
                      value: c.email,
                      label: `${c.label}${c.thread_count ? ` (${c.thread_count} msg)` : ''}`,
                    }))}
              onChange={(next) => {
                setContactEmail(next)
                setSelectedMessage(null)
              }}
            />
          </label>
        </div>

        {selectedContact && (
          <div style={{ fontSize: 11, color: 'var(--color-text-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={12} />
            {selectedContact.company_name || 'Entreprise non renseignée'}
            {selectedContact.threads_synced_at
              ? ` · emails synchronisés le ${new Date(selectedContact.threads_synced_at).toLocaleString('fr-FR')}`
              : ' · pas encore synchronisé dans cette boîte'}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-3)' }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Connexion Graph…
          </div>
        ) : !graphOk ? (
          <div style={{ fontSize: 12, color: '#dc2626' }}>
            Graph indisponible : {status?.graph?.error || 'configurer MS_GRAPH_TENANT_ID, CLIENT_ID, CLIENT_SECRET'}
          </div>
        ) : !contactEmail ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
            Sélectionnez un contact HubSpot ou lancez une synchronisation CRM.
          </div>
        ) : (
          <EmailConversationViewer
            contactEmail={contactEmail}
            previewMailbox={previewMailbox}
            selectedMessage={selectedMessage}
            onSelectMessage={(msg) => setSelectedMessage(msg)}
            height={420}
          />
        )}
      </div>
    </AppPageShell>
  )
}
