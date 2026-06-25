/**
 * Resolve which Outlook mailbox to use (Armand / Arthur / admin preview).
 */

export const COMMERCIAL_MAILBOXES = {
  'armand.guilhot@zerux.com': 'armand.guilhot@zerux.com',
  'arthur.milz@zerux.com': 'arthur.milz@zerux.com',
}

const ALLOWED_MAILBOXES = new Set(Object.values(COMMERCIAL_MAILBOXES))

export function getDefaultPreviewMailbox() {
  const fromEnv = process.env.MS_GRAPH_PREVIEW_MAILBOX?.trim().toLowerCase()
  if (fromEnv && ALLOWED_MAILBOXES.has(fromEnv)) return fromEnv
  return 'armand.guilhot@zerux.com'
}

export function isAllowedMailbox(mailbox) {
  return ALLOWED_MAILBOXES.has(String(mailbox || '').trim().toLowerCase())
}

/**
 * @param {{ email?: string, role?: string } | null} user
 * @param {{ previewMailbox?: string | null }} options
 */
export function resolveMailbox(user, { previewMailbox = null } = {}) {
  const email = String(user?.email || '').trim().toLowerCase()
  const commercial = COMMERCIAL_MAILBOXES[email]
  if (commercial) {
    return {
      mailbox: commercial,
      mode: 'commercial',
      read_only: false,
      actor_email: email,
    }
  }

  if (user?.role === 'admin') {
    const requested = String(previewMailbox || '').trim().toLowerCase()
    const mailbox = requested && isAllowedMailbox(requested) ? requested : getDefaultPreviewMailbox()
    return {
      mailbox,
      mode: 'admin_preview',
      read_only: true,
      actor_email: email || null,
      preview_as: mailbox,
    }
  }

  const err = new Error('Boîte mail non autorisée pour cet utilisateur')
  err.code = 'MAILBOX_FORBIDDEN'
  err.status = 403
  throw err
}

export function listCommercialMailboxes() {
  return Object.entries(COMMERCIAL_MAILBOXES).map(([email, mailbox]) => ({ email, mailbox }))
}
