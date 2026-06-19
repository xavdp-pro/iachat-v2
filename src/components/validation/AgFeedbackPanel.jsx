import { useState } from 'react'
import api from '../../api/index.js'
import { useAuthStore } from '../../store/useAuthStore.js'

const AG_BUTTONS = [
  { status: 'validated', label: '✓ Validé', className: 'val-ag-btn val-ag-btn--ok' },
  { status: 'return', label: '↩ Retour', className: 'val-ag-btn val-ag-btn--warn' },
  { status: 'to_provide', label: '📎 À fournir', className: 'val-ag-btn val-ag-btn--danger' },
  { status: 'question', label: '? Autre', className: 'val-ag-btn' },
]

export default function AgFeedbackPanel({ item, onSaved }) {
  const { user } = useAuthStore()
  const [status, setStatus] = useState(item.ag || 'pending')
  const [comment, setComment] = useState(item.agNote || '')
  const [answer, setAnswer] = useState(item.agAnswer || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    if (!user) {
      setMsg('Connexion requise')
      return
    }
    if (!['validated', 'return', 'to_provide', 'question'].includes(status)) {
      setMsg('Choisissez un statut')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      await api.put(`/validation/feedback/${item.id}`, {
        ag_status: status,
        ag_comment: comment || null,
        ag_answer: answer || null,
        respondent_name: user.name || user.email,
      })
      setMsg('✓ Enregistré')
      onSaved?.()
    } catch (err) {
      setMsg(err?.error || err?.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  if (!user) {
    return <p className="val-note">Connectez-vous pour enregistrer une réponse.</p>
  }

  return (
    <div className="val-ag-panel">
      {item.ag === 'recheck' && (
        <p className="val-ag-recheck-hint">
          Une correction a été publiée par l&apos;équipe. Merci de re-tester puis indiquer <strong>Validé</strong> ou <strong>Retour</strong>.
        </p>
      )}
      {item.question && (
        <>
          <p className="val-question-prompt">❓ {item.question}</p>
          <textarea
            className="val-ag-textarea"
            placeholder="Votre réponse…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={2}
          />
        </>
      )}
      <textarea
        className="val-ag-textarea"
        placeholder="Commentaire / retour…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />
      <div className="val-ag-btns">
        {AG_BUTTONS.map((b) => (
          <button
            key={b.status}
            type="button"
            className={`${b.className}${status === b.status ? ' val-ag-btn--active' : ''}`}
            onClick={() => setStatus(b.status)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <button type="button" className="val-ag-save" disabled={saving} onClick={save}>
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      {msg && <p className={`val-ag-msg${msg.startsWith('✓') ? '' : ' val-ag-msg--err'}`}>{msg}</p>}
    </div>
  )
}

export async function bulkValidateJalon(jalonId, user) {
  return api.post('/validation/feedback/bulk', {
    jalonId,
    ag_status: 'validated',
    onlyDevDone: true,
    respondent_name: user?.name || user?.email,
  })
}
