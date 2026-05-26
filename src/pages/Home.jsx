import { useState } from 'react'
import { Bot, Building2, FileSearch, FileSpreadsheet, LayoutGrid, LogOut, Moon, Search, Settings, Sun } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore.js'
import { useThemeStore } from '../store/useThemeStore.js'

const SECONDARY_ACTIONS = [
  {
    title: 'Recherche devis',
    description: 'N° devis, affaire, client',
    to: '/devis/search',
    icon: FileSearch,
    placeholder: 'N° devis, affaire, client...',
    param: 'q',
  },
  {
    title: 'Recherche client',
    description: 'Prospects et comptes HubSpot',
    to: '/prospects',
    icon: Building2,
    placeholder: 'Nom, societe...',
    param: 'q',
  },
  {
    title: 'Chatbot IA',
    description: 'Devis et connaissances chiffrage',
    to: '/chat',
    icon: Bot,
    placeholder: 'Votre question...',
    param: 'prompt',
  },
  {
    title: 'Chiffrage rapide',
    description: 'Saisie directe dans la grille devis',
    to: '/devis/grid',
    icon: LayoutGrid,
    placeholder: 'BP 2V RC5 2200 x 3200...',
    param: 'prompt',
  },
]

function HomeSidebar() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { darkMode, toggleDarkMode } = useThemeStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className="home-sidebar">
      <div className="home-sidebar-brand">
        <img src={`${import.meta.env.BASE_URL}zerux-logo.png`} alt="Zerux" className="home-sidebar-logo" width={138} height={42} />
        <span className="home-sidebar-mobile-title">ZERUX</span>
      </div>
      <div className="home-sidebar-spacer" />
      {user?.role === 'admin' && (
        <Link to="/admin" className="home-sidebar-link">
          <Settings size={16} /> Administration
        </Link>
      )}
      <div className="home-sidebar-user">
        <div className="home-sidebar-avatar">{(user?.name || user?.email || 'U')[0].toUpperCase()}</div>
        <div>
          <div className="home-sidebar-name">{user?.name || user?.email}</div>
          <div className="home-sidebar-role">{user?.role}</div>
        </div>
      </div>
      <div className="home-sidebar-tools">
        <button type="button" onClick={toggleDarkMode} aria-label={darkMode ? 'Mode clair' : 'Mode sombre'}>
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button type="button" onClick={handleLogout} aria-label="Déconnexion" className="home-sidebar-logout">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}

export default function Home() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [quickInputs, setQuickInputs] = useState({})

  const actionUrl = (action, rawValue = '') => {
    const value = String(rawValue || '').trim()
    if (!value || !action.param) return action.to
    return `${action.to}?${action.param}=${encodeURIComponent(value)}`
  }

  const submitAction = (action) => {
    navigate(actionUrl(action, quickInputs[action.title]))
  }

  const handleActionSubmit = (event, action) => {
    event.preventDefault()
    submitAction(action)
  }

  return (
    <div className="home-shell">
      <HomeSidebar />
      <main className="home-main">
        <header className="home-topbar">
          <div>
            <div className="home-title">Tableau de bord</div>
            <div className="home-subtitle">Bonjour {user?.name || 'Armand'} - que souhaitez-vous faire ?</div>
          </div>
        </header>

        <section className="home-content" aria-label="Accueil devis Zerux">
          <div className="home-section-label">Actions rapides</div>
          <div className="home-grid">
            <Link to="/devis" className="home-hero-card">
              <div className="home-hero-left">
                <div className="home-hero-icon"><FileSpreadsheet size={28} strokeWidth={1.8} /></div>
                <div>
                  <h1>Nouveau devis</h1>
                  <p>Créer un devis NEXUS - client et projet HubSpot</p>
                </div>
              </div>
              <span className="home-hero-cta">Créer</span>
            </Link>

            {SECONDARY_ACTIONS.map((action) => {
            const Icon = action.icon
            const value = quickInputs[action.title] || ''
            return (
              <form key={action.title} className="home-action-card" onSubmit={(event) => handleActionSubmit(event, action)}>
                <div className="home-action-heading">
                  <span className="home-action-icon"><Icon size={20} strokeWidth={1.8} /></span>
                  <h2>{action.title}</h2>
                </div>
                <div className="home-action-body">
                  <p>{action.description}</p>
                  {action.placeholder && (
                    <div className="home-search-row">
                      <input
                        type="text"
                        placeholder={action.placeholder}
                        aria-label={action.title}
                        value={value}
                        onChange={(event) => setQuickInputs(previous => ({ ...previous, [action.title]: event.target.value }))}
                      />
                      <button type="submit" aria-label={`Valider ${action.title}`}><Search size={15} /></button>
                    </div>
                  )}
                </div>
                <button type="submit" className="home-card-link">Ouvrir</button>
              </form>
            )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}