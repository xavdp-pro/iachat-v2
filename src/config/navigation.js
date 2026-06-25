/**
 * Central navigation config — commercial vs admin areas, role-gated.
 * Single source of truth for AppSidebar, Home quick actions, and Chat links.
 */

export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
}

/** @typedef {{ label: string, to: string, icon?: string, description?: string, param?: string, placeholder?: string, roles?: string[], end?: boolean, matchTab?: string, matchSub?: string, badge?: string }} NavItem */
/** @typedef {{ id: string, label: string, roles?: string[], defaultOpen?: boolean, items: NavItem[] }} NavSection */

export const COMMERCIAL_SECTIONS = [
  {
    id: 'hub',
    label: 'Accueil',
    items: [
      { label: 'Tableau de bord', to: '/', icon: 'LayoutDashboard', end: true },
    ],
  },
  {
    id: 'devis',
    label: 'Devis NEXUS',
    defaultOpen: true,
    items: [
      { label: 'Nouveau devis', to: '/devis', icon: 'FileSpreadsheet', description: 'Workflow client → envoi' },
      { label: 'Recherche devis', to: '/devis/search', icon: 'FileSearch', param: 'q', placeholder: 'N° devis, affaire, client...' },
      { label: 'Grille chiffrage', to: '/devis/grid', icon: 'LayoutGrid', param: 'prompt', placeholder: 'BP 2V RC5 2200 x 3200...' },
      { label: 'Tarifs transport', to: '/devis/transport', icon: 'Truck' },
      { label: 'Suivi validation P2', to: '/validation', icon: 'CheckCircle2' },
      { label: 'Lab Mail Graph', to: '/devis/imap-lab', icon: 'FlaskConical', roles: [ROLES.ADMIN] },
    ],
  },
  {
    id: 'clients',
    label: 'Clients',
    items: [
      { label: 'Prospects HubSpot', to: '/prospects', icon: 'Building2', param: 'q', placeholder: 'Nom, société...' },
    ],
  },
  {
    id: 'ia',
    label: 'IA & savoir',
    items: [
      { label: 'Chatbot chiffrage', to: '/chat', icon: 'Bot', param: 'prompt', placeholder: 'Votre question...' },
      { label: 'Base connaissance', to: '/knowledge', icon: 'Database' },
      { label: 'Expériences terrain', to: '/experiences', icon: 'BookOpen' },
      { label: 'Règles devis', to: '/rules', icon: 'Shield' },
    ],
  },
]

export const ADMIN_SECTIONS = [
  {
    id: 'admin-platform',
    label: 'Plateforme',
    roles: [ROLES.ADMIN],
    items: [
      { label: 'Utilisateurs & SSO', to: '/admin?tab=users', icon: 'Users', matchTab: 'users' },
      { label: 'Maintenance', to: '/admin?tab=maintenance', icon: 'ShieldCheck', matchTab: 'maintenance' },
    ],
  },
  {
    id: 'admin-data',
    label: 'Données métier',
    roles: [ROLES.ADMIN],
    defaultOpen: true,
    items: [
      { label: 'Calcul poids', to: '/admin?tab=data&sub=weight', icon: 'Scale', matchTab: 'data', matchSub: 'weight' },
      { label: 'Équipements', to: '/admin?tab=data&sub=equipements', icon: 'Shield', matchTab: 'data', matchSub: 'equipements' },
      { label: 'Taux de change', to: '/admin?tab=data&sub=taux-change', icon: 'Coins', matchTab: 'data', matchSub: 'taux-change' },
      { label: 'Numérotation', to: '/admin?tab=data&sub=numerotation', icon: 'Hash', matchTab: 'data', matchSub: 'numerotation' },
      { label: 'Tarif NEXUS', to: '/admin?tab=data&sub=tarif-nexus', icon: 'FileSpreadsheet', matchTab: 'data', matchSub: 'tarif-nexus' },
      { label: 'Thermolaquage', to: '/admin?tab=data&sub=thermolaquage', icon: 'Palette', matchTab: 'data', matchSub: 'thermolaquage' },
      { label: 'Traductions PDF', to: '/admin?tab=data&sub=traductions-pdf', icon: 'BookOpen', matchTab: 'data', matchSub: 'traductions-pdf' },
    ],
  },
  {
    id: 'admin-validation',
    label: 'Validation & règles',
    roles: [ROLES.ADMIN],
    items: [
      { label: 'Valider expériences', to: '/admin?tab=experiences', icon: 'CheckCircle2', matchTab: 'experiences' },
      { label: 'Règles actives', to: '/rules', icon: 'Shield' },
      { label: 'Connaissance IA', to: '/knowledge', icon: 'Database' },
    ],
  },
  {
    id: 'admin-voice',
    label: 'Voix & audio',
    roles: [ROLES.ADMIN],
    items: [
      { label: 'Test STT', to: '/admin?tab=stt', icon: 'Mic', matchTab: 'stt' },
      { label: 'Voix TTS', to: '/admin?tab=tts', icon: 'Headphones', matchTab: 'tts' },
    ],
  },
]

export function canAccessNavItem(item, user) {
  const roles = item.roles
  if (!roles?.length) return true
  return roles.includes(user?.role)
}

export function filterSectionsForUser(sections, user) {
  return sections
    .filter(section => !section.roles?.length || section.roles.includes(user?.role))
    .map(section => ({
      ...section,
      items: section.items.filter(item => canAccessNavItem(item, user)),
    }))
    .filter(section => section.items.length > 0)
}

export function getCommercialQuickActions() {
  const actions = []
  for (const section of COMMERCIAL_SECTIONS) {
    for (const item of section.items) {
      if (item.to === '/') continue
      if (!item.param && item.to !== '/devis') continue
      actions.push({
        title: item.label,
        description: item.description || section.label,
        to: item.to,
        param: item.param,
        placeholder: item.placeholder,
        iconKey: item.icon,
      })
    }
  }
  return actions
}

function parseQuery(pathname, search) {
  const url = new URL(pathname + (search || ''), 'http://local')
  return {
    pathname: url.pathname,
    tab: url.searchParams.get('tab'),
    sub: url.searchParams.get('sub'),
  }
}

export function isNavItemActive(item, pathname, search = '') {
  const current = parseQuery(pathname, search)
  const target = parseQuery(item.to.split('?')[0], item.to.includes('?') ? `?${item.to.split('?')[1]}` : '')

  if (item.matchTab) {
    if (current.pathname !== '/admin') return false
    if (current.tab !== item.matchTab) return false
    if (item.matchSub && current.sub !== item.matchSub) return false
    return true
  }

  if (item.end) return current.pathname === target.pathname
  if (target.pathname === '/') return current.pathname === '/'
  return current.pathname === target.pathname || current.pathname.startsWith(`${target.pathname}/`)
}

export function sectionHasActiveItem(section, pathname, search) {
  return section.items.some(item => isNavItemActive(item, pathname, search))
}
