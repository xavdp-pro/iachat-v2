/**
 * Validation activity log — timestamps for Armand / Arthur / dev team.
 */

export const VALIDATION_DEV_NAME = 'Xavier'

const DEV_ACTOR_RE = /équipe dev|equipe dev|xavier/i

export function validationActorKind(name = '') {
  const n = String(name || '').trim()
  const low = n.toLowerCase()
  if (DEV_ACTOR_RE.test(low)) return 'dev'
  if (/arthur/i.test(n)) return 'arthur'
  if (/armand/i.test(n)) return 'armand'
  return 'client'
}

export function formatValidationDateTime(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
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

/**
 * @param {object[]} items — roadmap items with feedback fields merged
 */
export function buildValidationActivityLog(items = []) {
  const events = []

  for (const item of items) {
    const agAt = item.agFeedbackAt || item.ag_feedback_at
    const agBy = item.agUpdatedBy || item.updated_by
    const hasAgText = Boolean(item.agNote || item.agAnswer)
    const agKind = validationActorKind(agBy)

    if (agAt && (hasAgText || item.ag !== 'pending')) {
      events.push({
        at: agAt,
        atLabel: formatValidationDateTime(agAt),
        actor: agActorLabel(agBy),
        actorKind: agKind === 'dev' ? 'client' : agKind,
        itemId: item.id,
        itemLabel: item.label,
        action: `Retour · ${AG_STATUS_LABELS[item.ag] || item.ag}`,
        snippet: item.agAnswer || item.agNote || null,
      })
    }

    if (item.devResponseAt || item.dev_response_at) {
      const at = item.devResponseAt || item.dev_response_at
      events.push({
        at,
        atLabel: formatValidationDateTime(at),
        actor: agActorLabel(item.devResponseBy || item.dev_response_by || VALIDATION_DEV_NAME),
        actorKind: 'dev',
        itemId: item.id,
        itemLabel: item.label,
        action: 'Correction publiée',
        snippet: item.devResponse || item.dev_response || null,
      })
    }
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return events
}

export function groupActivityByActor(events = []) {
  const groups = { armand: [], arthur: [], dev: [], other: [] }
  for (const event of events) {
    const key = event.actorKind === 'armand' ? 'armand'
      : event.actorKind === 'arthur' ? 'arthur'
        : event.actorKind === 'dev' ? 'dev'
          : 'other'
    groups[key].push(event)
  }
  return groups
}
