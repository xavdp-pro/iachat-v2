import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Loader2, Mail, MessageSquare, User } from 'lucide-react'
import api from '../api/index.js'

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function initials(name = '', email = '') {
  const n = String(name || '').trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?'
  }
  return String(email || '?')[0]?.toUpperCase() || '?'
}

/**
 * Threaded email conversation viewer (IMAP).
 */
export default function EmailConversationViewer({
  contactEmail,
  selectedMessage = null,
  onSelectMessage,
  disabled = false,
  height = 360,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [threads, setThreads] = useState([])
  const [activeThreadId, setActiveThreadId] = useState(null)

  const load = useCallback(async () => {
    const email = String(contactEmail || '').trim()
    if (!email || disabled) {
      setThreads([])
      setActiveThreadId(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await api.get(`/imap/contact-threads?email=${encodeURIComponent(email)}`)
      const list = data.threads || []
      setThreads(list)
      if (list.length) {
        const hasSelected = selectedMessage && list.some(t => t.messages?.some(m => m.uid === selectedMessage.uid))
        if (hasSelected) {
          const t = list.find(th => th.messages?.some(m => m.uid === selectedMessage.uid))
          setActiveThreadId(t?.id || list[0].id)
        } else {
          setActiveThreadId(list[0].id)
        }
      } else {
        setActiveThreadId(null)
      }
    } catch (err) {
      setError(err?.error || err?.message || 'Impossible de charger les conversations')
      setThreads([])
    } finally {
      setLoading(false)
    }
  }, [contactEmail, disabled, selectedMessage])

  useEffect(() => { load() }, [load])

  const activeThread = useMemo(
    () => threads.find(t => t.id === activeThreadId) || threads[0] || null,
    [threads, activeThreadId]
  )

  if (!contactEmail) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-3)', textAlign: 'center' }}>
        Sélectionnez un contact avec une adresse email.
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, fontSize: 12, color: 'var(--color-text-3)' }}>
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Chargement des conversations…
      </div>
    )
  }

  if (error) {
    return <div style={{ padding: 12, fontSize: 12, color: '#dc2626' }}>{error}</div>
  }

  if (!threads.length) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-3)', textAlign: 'center' }}>
        Aucun email reçu de <strong>{contactEmail}</strong>.
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(140px, 0.38fr) minmax(0, 0.62fr)',
      height,
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      overflow: 'hidden',
      background: 'var(--color-bg)',
    }}>
      {/* Thread list */}
      <div style={{ borderRight: '1px solid var(--color-border)', overflowY: 'auto', background: 'var(--color-surface)' }}>
        <div style={{ padding: '8px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)' }}>
          Conversations ({threads.length})
        </div>
        {threads.map(thread => {
          const active = thread.id === activeThread?.id
          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => setActiveThreadId(thread.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 10px', border: 'none', borderBottom: '1px solid var(--color-border)',
                background: active ? 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))' : 'transparent',
                cursor: 'pointer',
                boxShadow: active ? 'inset 3px 0 0 var(--color-primary)' : 'none',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {thread.subject}
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 10, color: 'var(--color-text-3)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <MessageSquare size={10} /> {thread.message_count}
                </span>
                <span>{formatWhen(thread.last_date)}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Messages timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {activeThread && (
          <>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.3 }}>{activeThread.subject}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 2 }}>
                {activeThread.message_count} message{activeThread.message_count > 1 ? 's' : ''} · {contactEmail}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeThread.messages.map((msg, index) => {
                const selected = selectedMessage?.uid === msg.uid
                const isFirst = index === 0
                return (
                  <button
                    key={msg.uid}
                    type="button"
                    onClick={() => onSelectMessage?.(msg, activeThread)}
                    title={isFirst ? 'Premier message — demande initiale' : 'Choisir cet email comme source devis'}
                    style={{
                      textAlign: 'left', border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: 10, padding: 0, cursor: 'pointer', background: 'transparent',
                      boxShadow: selected ? '0 0 0 1px color-mix(in srgb, var(--color-primary) 40%, transparent)' : 'none',
                    }}
                  >
                    <div style={{
                      display: 'flex', gap: 10, padding: '10px 12px',
                      background: selected ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))' : 'var(--color-surface)',
                      borderRadius: 10,
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: 'color-mix(in srgb, var(--color-primary) 18%, var(--color-surface))',
                        color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800,
                      }}>
                        {initials(msg.from_name, msg.from)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-text)' }}>
                            {msg.from_name || msg.from}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>{formatWhen(msg.date)}</span>
                        </div>
                        {isFirst && (
                          <span style={{ display: 'inline-block', marginTop: 4, fontSize: 9, fontWeight: 800, color: '#166534', background: 'rgba(22,163,74,0.12)', padding: '2px 6px', borderRadius: 4 }}>
                            Demande initiale probable
                          </span>
                        )}
                        <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-2)', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}>
                          {msg.body_text || msg.preview || '—'}
                        </div>
                        {selected && (
                          <div style={{ marginTop: 8, fontSize: 10, fontWeight: 800, color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Mail size={11} /> Email source du devis <ChevronRight size={11} />
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
