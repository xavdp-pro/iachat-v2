/**
 * Group IMAP messages into conversation threads for the email viewer.
 */

export function normalizeSubject(subject = '') {
  return String(subject)
    .replace(/^(re|fw|fwd|tr):\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * @param {Array<{ uid, message_id?, in_reply_to?, references?, subject?, date?, from?, preview?, body_text? }>} messages
 */
export function groupMessagesIntoThreads(messages = []) {
  const list = [...messages]
  const byMessageId = new Map()
  for (const m of list) {
    if (m.message_id) byMessageId.set(m.message_id, m)
  }

  function threadRootKey(msg) {
    let cur = msg
    const seen = new Set()
    while (cur?.in_reply_to && byMessageId.has(cur.in_reply_to) && !seen.has(cur.in_reply_to)) {
      seen.add(cur.in_reply_to)
      cur = byMessageId.get(cur.in_reply_to)
    }
    if (cur?.message_id) return cur.message_id
    return `subject:${normalizeSubject(cur?.subject || msg.subject || '')}`
  }

  const buckets = new Map()
  for (const msg of list) {
    const key = threadRootKey(msg)
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: key,
        subject: normalizeSubject(msg.subject) ? msg.subject?.replace(/^(re|fw|fwd):\s*/i, '').trim() || msg.subject : msg.subject,
        root_subject: msg.subject,
        messages: [],
      })
    }
    buckets.get(key).messages.push(msg)
  }

  const threads = [...buckets.values()].map(thread => {
    const sorted = [...thread.messages].sort((a, b) => {
      const da = new Date(a.date || 0).getTime()
      const db = new Date(b.date || 0).getTime()
      return da - db
    })
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const displaySubject = first?.subject?.replace(/^(re|fw|fwd):\s*/i, '').trim() || thread.subject || '(sans objet)'
    return {
      id: thread.id,
      subject: displaySubject,
      message_count: sorted.length,
      first_date: first?.date || null,
      last_date: last?.date || null,
      preview: last?.preview || first?.preview || '',
      messages: sorted,
    }
  })

  threads.sort((a, b) => new Date(b.last_date || 0) - new Date(a.last_date || 0))
  return threads
}
