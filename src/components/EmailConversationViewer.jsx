import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Loader2, Mail, Paperclip, Plus } from 'lucide-react'
import api from '../api/index.js'

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function formatSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}

function initials(name = '', email = '') {
  const n = String(name || '').trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?'
  }
  return String(email || '?')[0]?.toUpperCase() || '?'
}

function MessageAttachments({ graphId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!graphId) {
      setItems([])
      return
    }
    let active = true
    setLoading(true)
    api.get(`/mail/messages/${encodeURIComponent(graphId)}/attachments`)
      .then(data => { if (active) setItems(data.attachments || []) })
      .catch(() => { if (active) setItems([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [graphId])

  if (!graphId || (!loading && !items.length)) return null

  return (
    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {loading && (
        <span style={{ fontSize: 10, color: 'var(--color-text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> PJ…
        </span>
      )}
      {items.map(att => (
        <span
          key={att.id}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
            padding: '3px 8px', borderRadius: 6,
            background: 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))',
            color: 'var(--color-text-2)', border: '1px solid var(--color-border)',
          }}
        >
          <Paperclip size={10} />
          {att.name}
          {att.size ? <span style={{ opacity: 0.65, fontWeight: 500 }}>({formatSize(att.size)})</span> : null}
        </span>
      ))}
    </div>
  )
}

const PAGE_SIZE = 5

/**
 * Recent emails received from a contact (flat list, no thread scoring).
 */
export default function EmailConversationViewer({
  contactEmail,
  selectedMessage = null,
  onSelectMessage,
  disabled = false,
  height = 360,
  previewMailbox = null,
}) {
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [mailMeta, setMailMeta] = useState(null)

  const fetchPage = useCallback(async (offset, append = false) => {
    const email = String(contactEmail || '').trim()
    if (!email || disabled) {
      setMessages([])
      setHasMore(false)
      setMailMeta(null)
      return
    }

    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')

    try {
      const qs = new URLSearchParams({
        email,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      if (previewMailbox) qs.set('preview_mailbox', previewMailbox)
      const data = await api.get(`/mail/contact-emails?${qs}`)
      const batch = data.messages || []
      setMessages(prev => (append ? [...prev, ...batch] : batch))
      setHasMore(Boolean(data.has_more) || batch.length >= PAGE_SIZE)
      setMailMeta({
        mode: data.mode,
        mailbox: data.mailbox,
        read_only: data.read_only,
        mailbox_mode: data.mailbox_mode,
      })
    } catch (err) {
      setError(err?.error || err?.message || 'Impossible de charger les emails')
      if (!append) {
        setMessages([])
        setMailMeta(null)
      }
      setHasMore(false)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [contactEmail, disabled, previewMailbox])

  useEffect(() => {
    fetchPage(0, false)
  }, [fetchPage])

  const loadMore = () => {
    if (loadingMore || !hasMore) return
    fetchPage(messages.length, true)
  }

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
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Recherche des emails reçus…
      </div>
    )
  }

  if (error) {
    return <div style={{ padding: 12, fontSize: 12, color: '#dc2626' }}>{error}</div>
  }

  if (!messages.length) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-3)', textAlign: 'center' }}>
        Aucun email reçu de <strong>{contactEmail}</strong>
        {mailMeta?.mailbox ? <> dans <strong>{mailMeta.mailbox}</strong></> : null}.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {mailMeta?.read_only && mailMeta?.mailbox_mode === 'admin_preview' && (
        <div style={{ fontSize: 10, fontWeight: 700, color: '#b45309', padding: '6px 10px', borderRadius: 8, border: '1px solid #fbbf24', background: 'rgba(251,191,36,0.12)' }}>
          Lecture seule — aperçu boîte {mailMeta.mailbox} (aucun envoi ni modification)
        </div>
      )}
      <div style={{
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-text)' }}>
            {messages.length} email{messages.length > 1 ? 's' : ''} reçu{messages.length > 1 ? 's' : ''} de {contactEmail}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 2 }}>
            Les {PAGE_SIZE} plus récents affichés en premier{mailMeta?.mailbox ? ` · boîte ${mailMeta.mailbox}` : ''}
          </div>
        </div>
        <div style={{ maxHeight: height, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((msg, index) => {
            const selected = selectedMessage?.uid === msg.uid
            const graphId = msg.graph_id || (String(msg.uid || '').includes('-') ? msg.uid : null)
            return (
              <button
                key={msg.uid || msg.message_id || index}
                type="button"
                onClick={() => onSelectMessage?.(msg)}
                title="Choisir cet email comme source du devis"
                style={{
                  textAlign: 'left', border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  borderRadius: 10, padding: 0, cursor: onSelectMessage ? 'pointer' : 'default', background: 'transparent',
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
                    <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3 }}>
                      {msg.subject}
                    </div>
                    {msg.has_attachments && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 9, fontWeight: 700, color: 'var(--color-text-3)' }}>
                        <Paperclip size={10} /> Pièces jointes
                      </span>
                    )}
                    <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-2)', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}>
                      {msg.body_text || msg.preview || '—'}
                    </div>
                    {(selected || msg.has_attachments) && graphId && (
                      <MessageAttachments graphId={graphId} />
                    )}
                    {selected && onSelectMessage && (
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
        {hasMore && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
                padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-border)',
                background: 'var(--color-bg)', color: 'var(--color-primary)', cursor: loadingMore ? 'wait' : 'pointer',
              }}
            >
              {loadingMore ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={12} />}
              + {PAGE_SIZE} emails plus anciens
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
