import { useState } from 'react'
import { Bot, Building2, FileSearch, FileSpreadsheet, LayoutGrid, Search, Truck, Database, BookOpen, Shield } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore.js'
import AppSidebar from '../components/AppSidebar.jsx'
import { getCommercialQuickActions } from '../config/navigation.js'

const QUICK_ACTION_ICONS = {
  FileSearch,
  Building2,
  Bot,
  LayoutGrid,
  FileSpreadsheet,
  Truck,
  Database,
  BookOpen,
  Shield,
}

const SECONDARY_ACTIONS = getCommercialQuickActions().map((action) => ({
  ...action,
  title: action.title,
  icon: QUICK_ACTION_ICONS[action.iconKey] || LayoutGrid,
}))

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
      <AppSidebar />
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