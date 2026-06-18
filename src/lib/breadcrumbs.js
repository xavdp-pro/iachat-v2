/**
 * Breadcrumb trail builder from current route.
 * Pages can pass overrides (e.g. company name on prospect quotes).
 */

const ADMIN_TAB_LABELS = {
  users: 'Utilisateurs & SSO',
  stt: 'Test STT',
  tts: 'Voix TTS',
  experiences: 'Valider expériences',
  data: 'Données métier',
  maintenance: 'Maintenance',
}

const ADMIN_SUB_LABELS = {
  weight: 'Calcul poids',
  equipements: 'Équipements',
  'taux-change': 'Taux de change',
  numerotation: 'Numérotation',
  'tarif-nexus': 'Tarif NEXUS',
  thermolaquage: 'Thermolaquage',
}

/**
 * @param {string} pathname
 * @param {string} [search]
 * @param {{ companyName?: string, devisLabel?: string, chatProjectName?: string, chatDiscussionTitle?: string }} [overrides]
 * @returns {{ label: string, to?: string }[]}
 */
export function buildBreadcrumbs(pathname, search = '', overrides = {}) {
  const params = new URLSearchParams(search || '')

  if (pathname === '/') {
    return [{ label: 'Tableau de bord' }]
  }

  if (pathname.startsWith('/devis')) {
    const crumbs = [{ label: 'Devis NEXUS', to: '/devis' }]
    if (pathname === '/devis') {
      crumbs.push({ label: overrides.devisLabel || 'Workflow' })
      return crumbs
    }
    if (pathname === '/devis/search') {
      crumbs.push({ label: 'Recherche devis' })
      return crumbs
    }
    if (pathname === '/devis/grid') {
      crumbs.push({ label: overrides.devisLabel || 'Grille chiffrage' })
      return crumbs
    }
    if (pathname === '/devis/grid/pdf-draft') {
      crumbs.push({ label: 'Grille chiffrage', to: '/devis/grid' })
      crumbs.push({ label: 'Pré-édition PDF' })
      return crumbs
    }
    if (pathname === '/devis/transport') {
      crumbs.push({ label: 'Tarifs transport' })
      return crumbs
    }
    if (pathname === '/devis/imap-lab') {
      crumbs.push({ label: 'Lab IMAP' })
      return crumbs
    }
    crumbs.push({ label: pathname.replace('/devis/', '') })
    return crumbs
  }

  if (pathname === '/prospects') {
    return [
      { label: 'Clients', to: '/prospects' },
      { label: 'Prospects HubSpot' },
    ]
  }

  if (/^\/prospects\/[^/]+\/quotes$/.test(pathname)) {
    return [
      { label: 'Clients', to: '/prospects' },
      { label: 'Prospects', to: '/prospects' },
      { label: overrides.companyName || 'Devis client' },
    ]
  }

  if (pathname === '/chat') {
    const crumbs = [
      { label: 'IA & savoir', to: '/chat' },
      { label: 'Chatbot', to: '/chat' },
    ]
    if (overrides.chatProjectName) crumbs.push({ label: overrides.chatProjectName })
    if (overrides.chatDiscussionTitle) crumbs.push({ label: overrides.chatDiscussionTitle })
    return crumbs
  }

  if (pathname === '/knowledge') {
    return [{ label: 'IA & savoir', to: '/knowledge' }, { label: 'Base connaissance' }]
  }

  if (pathname === '/experiences') {
    return [{ label: 'IA & savoir', to: '/experiences' }, { label: 'Expériences terrain' }]
  }

  if (pathname === '/rules') {
    return [{ label: 'IA & savoir', to: '/rules' }, { label: 'Règles devis' }]
  }

  if (pathname === '/admin') {
    const crumbs = [{ label: 'Administration', to: '/admin' }]
    const tab = params.get('tab') || 'users'
    const sub = params.get('sub')
    const tabLabel = ADMIN_TAB_LABELS[tab] || tab
    if (tab === 'data' && sub) {
      crumbs.push({ label: tabLabel, to: `/admin?tab=data&sub=${sub}` })
      crumbs.push({ label: ADMIN_SUB_LABELS[sub] || sub })
    } else if (tab !== 'users') {
      crumbs.push({ label: tabLabel })
    } else {
      crumbs.push({ label: tabLabel })
    }
    return crumbs
  }

  return [{ label: 'Zerux' }]
}

const DEFAULT_APP_TITLE = 'Zerux'

/**
 * @param {{ label: string, to?: string }[]} crumbs
 * @param {string} [appTitle]
 */
export function formatDocumentTitle(crumbs, appTitle = DEFAULT_APP_TITLE) {
  if (!crumbs?.length) return appTitle
  const leaf = crumbs[crumbs.length - 1]?.label || appTitle
  return `${leaf} — ${appTitle}`
}

/**
 * Parent link for Alt+← navigation.
 * @param {{ label: string, to?: string }[]} crumbs
 * @param {string} [currentPath]
 * @returns {string|null}
 */
export function getBreadcrumbBackTarget(crumbs, currentPath = '') {
  if (!crumbs?.length) return '/'
  const normalizedCurrent = currentPath.split('?')[0] || ''
  if (crumbs.length === 1) {
    const to = crumbs[0].to
    if (!to || to.split('?')[0] === normalizedCurrent) return '/'
    return to
  }
  for (let index = crumbs.length - 2; index >= 0; index -= 1) {
    const to = crumbs[index]?.to
    if (!to) continue
    if (to.split('?')[0] === normalizedCurrent) continue
    return to
  }
  return '/'
}
