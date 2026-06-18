import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, User } from 'lucide-react'
import EmailConversationViewer from '../components/EmailConversationViewer.jsx'
import api from '../api/index.js'
import AppPageShell from '../components/AppPageShell.jsx'

/**
 * Dev lab: browse all fictional IMAP test contacts and their email threads.
 */
export default function ImapConversationsLab() {
  const [status, setStatus] = useState(null)
  const [contacts, setContacts] = useState([])
  const [selectedEmail, setSelectedEmail] = useState('')
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [st, ct] = await Promise.all([
        api.get('/imap/status'),
        api.get('/imap/test-contacts'),
      ])
      setStatus(st)
      const list = ct.contacts || st.test_contacts || []
      setContacts(list)
      if (!selectedEmail && list.length) setSelectedEmail(list[0])
    } catch {
      setContacts([])
    } finally {
      setLoading(false)
    }
  }, [selectedEmail])

  useEffect(() => { load() }, [load])

  return (
    <AppPageShell
      title="Lab IMAP — conversations fictives"
      subtitle={`Mode ${status?.mode || '—'} · ${contacts.length} contacts de test`}
      contentClassName="app-page-content app-page-content--flush"
      hideHeader={false}
      headerActions={(
        <button type="button" className="admin-btn-ghost" onClick={load}>
          <RefreshCw size={14} /> Actualiser
        </button>
      )}
    >
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 'calc(100vh - 58px)', height: '100%' }}>
        <aside style={{ borderRight: '1px solid var(--color-border)', overflowY: 'auto', padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-3)', marginBottom: 8 }}>Contacts fictifs</div>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {contacts.map(email => (
                <button
                  key={email}
                  type="button"
                  onClick={() => { setSelectedEmail(email); setSelectedMessage(null) }}
                  style={{
                    textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: `1px solid ${selectedEmail === email ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: selectedEmail === email ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))' : 'var(--color-surface)',
                    cursor: 'pointer', fontSize: 11,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <User size={12} /> {email}
                  </span>
                </button>
              ))}
            </div>
          )}
          {status?.mode !== 'dovecot-test' && (
            <p style={{ marginTop: 16, fontSize: 11, color: '#b45309', lineHeight: 1.4 }}>
              Lancez le serveur de test : <code>npm run imap:test:up</code>
            </p>
          )}
        </aside>

        <main style={{ padding: 16, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <EmailConversationViewer
            contactEmail={selectedEmail}
            selectedMessage={selectedMessage}
            onSelectMessage={(msg) => setSelectedMessage(msg)}
            height="calc(100vh - 120px)"
          />
          {selectedMessage && (
            <div style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 6%, var(--color-surface))', fontSize: 12 }}>
              <strong>Email sélectionné :</strong> {selectedMessage.subject}
              <span style={{ color: 'var(--color-text-3)', marginLeft: 8 }}>{formatWhen(selectedMessage.date)}</span>
            </div>
          )}
        </main>
      </div>
    </AppPageShell>
  )
}

function formatWhen(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('fr-FR')
  } catch {
    return ''
  }
}
