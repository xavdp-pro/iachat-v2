/**
 * Client-side helpers for validation activity display (mirrors server/lib/validationActivity.js).
 */

export const VALIDATION_DEV_NAME = 'Xavier'

const DEV_ACTOR_RE = /équipe dev|equipe dev|xavier/i

export function validationActorKind(name = '') {
  const low = String(name || '').trim().toLowerCase()
  if (DEV_ACTOR_RE.test(low)) return 'dev'
  if (/arthur/i.test(low)) return 'arthur'
  if (/armand/i.test(low)) return 'armand'
  return 'client'
}

export function formatValidationDateTime(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function agActorLabel(by = '') {
  const kind = validationActorKind(by)
  if (kind === 'arthur') return 'Arthur'
  if (kind === 'armand') return 'Armand'
  if (kind === 'dev') return VALIDATION_DEV_NAME
  return by || 'Client'
}

const AG_STATUS_LABELS = {
  validated: 'Validé',
  return: 'Retour',
  question: 'Question',
  to_provide: 'À fournir',
  recheck: 'À re-confirmer',
  pending: 'À valider',
}

export function agActionLabel(status) {
  return AG_STATUS_LABELS[status] || status
}
