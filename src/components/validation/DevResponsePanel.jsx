import { useState } from 'react'
import { Wrench } from 'lucide-react'
import api from '../../api/index.js'
import { useAuthStore } from '../../store/useAuthStore.js'
import { DEV_FIX_NOTES } from '../../data/armandValidationFixes.js'

export default function DevResponsePanel({ item, onSaved }) {
  const { user } = useAuthStore()
  const preset = DEV_FIX_NOTES[item.id] || ''
  const [text, setText] = useState(item.devResponse || preset)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const publishFix = async () => {
    const dev_response = String(text || '').trim()
    if (!dev_response) {
      setMsg('Décrivez la correction')
      return
    }
    if (!user) {
      setMsg('Connexion requise')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      await api.put(`/validation/feedback/${item.id}/dev-fix`, {
        dev_response,
        respondent_name: user.name || user.email,
      })
      setMsg('✓ Publié — en attente de confirmation Armand')
      onSaved?.()
    } catch (err) {
      setMsg(err?.error || err?.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  const showForm = item.ag === 'return' || item.ag === 'question' || item.ag === 'recheck' || preset

  if (!showForm && !item.devResponse) return null

  return (
    <div className="val-dev-panel">
      <div className="val-dev-panel-head">
        <Wrench size={14} aria-hidden />
        <strong>Correction déployée (Xavier)</strong>
      </div>
      <p className="val-dev-panel-hint">
        Après le retour d&apos;Armand, décrivez ce qui a été corrigé puis publiez : le point repasse en
        <span className="val-badge val-badge--recheck"> À re-confirmer</span>
        et Armand pourra valider ou refaire un retour.
      </p>
      <textarea
        className="val-ag-textarea val-dev-textarea"
        placeholder="Ex. : Correction déployée le … — merci de retester …"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
      />
      <button type="button" className="val-dev-publish" disabled={saving} onClick={publishFix}>
        {saving ? 'Publication…' : 'Publier la correction — demander re-validation'}
      </button>
      {msg && <p className={`val-ag-msg${msg.startsWith('✓') ? '' : ' val-ag-msg--err'}`}>{msg}</p>}
    </div>
  )
}

export async function bulkPublishDevFixes(user) {
  return api.post('/validation/feedback/bulk-dev-fix', {
    respondent_name: user?.name || user?.email,
  })
}
