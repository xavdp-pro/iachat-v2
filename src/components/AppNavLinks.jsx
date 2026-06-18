import { Link, useLocation } from 'react-router-dom'
import {
  Bot, Building2, FileSearch, FileSpreadsheet, LayoutDashboard, LayoutGrid,
} from 'lucide-react'
import { COMMERCIAL_SECTIONS, isNavItemActive } from '../config/navigation.js'

const ICONS = { LayoutDashboard, FileSpreadsheet, FileSearch, LayoutGrid, Building2, Bot }

/** Compact nav links for Chat sidebar — key commercial destinations. */
const CHAT_QUICK_LINKS = [
  ...COMMERCIAL_SECTIONS.find(s => s.id === 'hub')?.items || [],
  ...(COMMERCIAL_SECTIONS.find(s => s.id === 'devis')?.items || []).slice(0, 3),
  ...(COMMERCIAL_SECTIONS.find(s => s.id === 'clients')?.items || []),
]

export default function AppNavLinks({ onNavigate, className = '' }) {
  const { pathname, search } = useLocation()

  return (
    <div className={`app-nav-links-compact ${className}`.trim()}>
      <div className="chat-sidebar-heading chat-sidebar-heading--muted">Applications</div>
      <div className="app-nav-links-list">
        {CHAT_QUICK_LINKS.map(item => {
          const Icon = ICONS[item.icon] || LayoutGrid
          const isActive = isNavItemActive(item, pathname, search)
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`app-nav-links-item ${isActive ? 'app-nav-links-item--active' : ''}`}
              onClick={onNavigate}
            >
              <Icon size={15} strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
