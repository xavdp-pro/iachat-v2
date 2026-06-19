/**
 * Roadmap payload for /api/validation — mirrors armandValidationRoadmap.js
 */
import {
  ROADMAP_META,
  JALONS,
  FILES_BLOCKERS,
  MEETING_AGENDA,
  jalonStats,
} from '../../src/data/armandValidationRoadmap.js'
import { enrichItemWithGuide } from '../../src/data/armandValidationGuide.js'
import { buildValidationActivityLog, groupActivityByActor } from '../lib/validationActivity.js'

export function buildRoadmapPayload(feedbackMap = {}) {
  const mergeItem = (item) => {
    const fb = feedbackMap[item.id] || {}
    return enrichItemWithGuide({
      ...item,
      ag: fb.ag_status || item.ag || 'pending',
      agNote: fb.ag_comment || item.agNote || null,
      agAnswer: fb.ag_answer || null,
      agUpdatedAt: fb.updated_at || null,
      agFeedbackAt: fb.ag_feedback_at || null,
      agUpdatedBy: fb.updated_by || null,
      devResponse: fb.dev_response || null,
      devResponseAt: fb.dev_response_at || null,
      devResponseBy: fb.dev_response_by || null,
    })
  }

  const jalons = JALONS.map((j) => {
    const items = j.items.map(mergeItem)
    const stats = jalonStats({ ...j, items: items.map((i) => ({ ...i, ag: i.ag })) })
    const agValidated = items.filter((i) => i.ag === 'validated').length
    return {
      ...j,
      items,
      stats: { ...stats, agValidated },
    }
  })

  const files = FILES_BLOCKERS.map(mergeItem)

  const allIds = [
    ...jalons.flatMap((j) => j.items),
    ...files,
  ]
  const agValidated = allIds.filter((i) => i.ag === 'validated').length
  const agPending = allIds.filter((i) => i.ag === 'pending' || i.ag === 'to_provide').length
  const agReturn = allIds.filter((i) => i.ag === 'return' || i.ag === 'question').length
  const agRecheck = allIds.filter((i) => i.ag === 'recheck').length

  const activityLog = buildValidationActivityLog(allIds)
  const activityByActor = groupActivityByActor(activityLog)

  return {
    meta: ROADMAP_META,
    jalons,
    files,
    agenda: MEETING_AGENDA,
    activityLog,
    activityByActor,
    summary: {
      agValidated,
      agPending,
      agReturn,
      agRecheck,
      total: allIds.length,
    },
  }
}

export const VALID_ITEM_IDS = new Set([
  ...JALONS.flatMap((j) => j.items.map((i) => i.id)),
  ...FILES_BLOCKERS.map((f) => f.id),
])

export const VALID_AG_STATUSES = new Set(['pending', 'validated', 'return', 'to_provide', 'question', 'recheck'])
