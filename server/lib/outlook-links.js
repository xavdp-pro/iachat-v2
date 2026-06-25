/**
 * Deep links to open Graph-created drafts in Outlook desktop (preferred) or OWA.
 */

function encodeRestId(draftId) {
  return encodeURIComponent(String(draftId || '').trim())
}

/**
 * Opens a draft in Outlook desktop (Windows/macOS) when the handler is registered.
 * Tries legacy Win32 handler first (Classic), then New Outlook ms-outlook URI.
 */
export function buildOutlookDesktopDraftUrl({ draftId, mailbox } = {}) {
  const id = String(draftId || '').trim()
  if (!id) return null
  const account = mailbox ? `&account=${encodeURIComponent(mailbox)}` : ''
  return `outlook:compose/open?restid=${encodeRestId(id)}${account}`
}

export function buildOutlookDesktopDraftUrlAlternates({ draftId, mailbox } = {}) {
  const id = String(draftId || '').trim()
  if (!id) return []
  const account = mailbox ? `&account=${encodeURIComponent(mailbox)}` : ''
  const rest = encodeRestId(id)
  return [
    `outlook:compose/open?restid=${rest}${account}`,
    `ms-outlook:compose/open?restid=${rest}${account}`,
    `ms-outlook://compose/open?restid=${rest}${account}`,
  ].filter(Boolean)
}

/**
 * OWA compose deeplink — opens draft in edit mode (browser fallback).
 */
export function buildOutlookComposeWebUrl({ draftId } = {}) {
  const id = String(draftId || '').trim()
  if (!id) return null
  return `https://outlook.office.com/mail/deeplink/compose/${encodeRestId(id)}?ItemID=${encodeRestId(id)}&exvsurl=1`
}

export function buildOutlookDraftLinks({ draftId, mailbox, webLink = null } = {}) {
  const alternates = buildOutlookDesktopDraftUrlAlternates({ draftId, mailbox })
  const desktopLink = alternates[0] || null
  const composeWebLink = buildOutlookComposeWebUrl({ draftId })
  return {
    desktopLink,
    desktopLinks: alternates,
    composeWebLink,
    composeLink: composeWebLink,
    webLink: webLink || composeWebLink,
    openLink: desktopLink || composeWebLink || webLink || null,
  }
}
