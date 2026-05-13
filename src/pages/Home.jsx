import { Bot, BookOpen, Building2, FileSearch, FileSpreadsheet, LayoutGrid, LogOut, Moon, Settings, Sparkles, Sun } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore.js'
import { useThemeStore } from '../store/useThemeStore.js'

const HOME_ACTIONS = [
  {
    title: 'Nouveau devis',
    description: 'Amène vers Devis NEXUS',
    to: '/devis',
    icon: FileSpreadsheet,
    accent: '#94d82d',
  },
  {
    title: 'Recherche devis',
    description: 'Liste chronologique avec numéro, affaire, client, montant et accès PDF rapide',
    to: '/devis/search',
    icon: FileSearch,
    accent: '#354346',
  },
  {
    title: 'Recherche client',
    description: 'Amène vers Prospects',
    to: '/prospects',
    icon: Building2,
    accent: '#6d8fc4',
  },
  {
    title: 'Chatbot IA',
    description: 'Chatbot IA avec accès aux devis et aux connaissances de chiffrage',
    to: '/chat',
    icon: Bot,
    accent: '#354346',
  },
  {
    title: 'Expériences chiffrage',
    description: 'Base des expériences et validations terrain',
    to: '/experiences',
    icon: BookOpen,
    accent: '#f2b705',
  },
  {
    title: 'Chiffrage rapide',
    description: 'Amène vers Grid devis',
    to: '/devis/grid',
    icon: LayoutGrid,
    accent: '#8ed9e8',
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
        <div className="home-sidebar-brand-mark"><Sparkles size={16} /></div>
        <span>DEVIS ZERUX</span>
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
  return (
    <div className="home-shell">
      <HomeSidebar />
      <main className="home-main">
        <div className="home-grid" aria-label="Accueil devis Zerux">
          {HOME_ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <Link key={action.title} to={action.to} className="home-action-card" style={{ '--home-accent': action.accent }}>
                <div className="home-action-content">
                  <h1>{action.title}</h1>
                  <p>{action.description}</p>
                </div>
                <Icon className="home-action-icon" size={30} strokeWidth={1.8} />
              </Link>
            )
          })}
        </div>
      </main>
    </div>
  )
}