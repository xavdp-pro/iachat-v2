import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Bot, BookOpen, Building2, CheckCircle2, Coins, Database, FileSearch, FileSpreadsheet, FlaskConical,
  Hash, Headphones, LayoutDashboard, LayoutGrid, LogOut, Mic, Moon, Palette, Scale, Shield,
  ShieldCheck, Sun, Truck, Users,
} from 'lucide-react'
import { useAuthStore } from '../store/useAuthStore.js'
import { useThemeStore } from '../store/useThemeStore.js'
import {
  ADMIN_SECTIONS,
  COMMERCIAL_SECTIONS,
  filterSectionsForUser,
  isNavItemActive,
  sectionHasActiveItem,
} from '../config/navigation.js'

const ICONS = {
  LayoutDashboard, FileSpreadsheet, FileSearch, LayoutGrid, Truck, Building2, Bot, Database,
  BookOpen, Shield, Users, ShieldCheck, Scale, Coins, Hash, Palette, CheckCircle2, Mic, Headphones, FlaskConical,
}

function NavIcon({ name, size = 16 }) {
  const Icon = ICONS[name] || LayoutGrid
  return <Icon size={size} strokeWidth={2} />
}

function NavSectionBlock({ section, pathname, search, open, onToggle }) {
  const isSingle = section.items.length === 1 && section.id === 'hub'
  const active = sectionHasActiveItem(section, pathname, search)

  if (isSingle) {
    const item = section.items[0]
    const isActive = isNavItemActive(item, pathname, search)
    return (
      <Link to={item.to} className={`app-nav-item app-nav-item--top ${isActive ? 'app-nav-item--active' : ''}`}>
        <NavIcon name={item.icon} />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <div className={`app-nav-section ${active ? 'app-nav-section--active' : ''}`}>
      <button type="button" className="app-nav-section-toggle" onClick={onToggle} aria-expanded={open}>
        <span>{section.label}</span>
        <span className="app-nav-chevron">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="app-nav-section-items">
          {section.items.map(item => {
            const isActive = isNavItemActive(item, pathname, search)
            return (
              <Link key={item.to} to={item.to} className={`app-nav-item ${isActive ? 'app-nav-item--active' : ''}`} title={item.description}>
                <NavIcon name={item.icon} size={15} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function AppSidebar({ compact = false }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { user, logout } = useAuthStore()
  const { darkMode, toggleDarkMode } = useThemeStore()
  const isAdmin = user?.role === 'admin'
  const onAdminRoute = pathname.startsWith('/admin')

  const commercialSections = useMemo(() => filterSectionsForUser(COMMERCIAL_SECTIONS, user), [user])
  const adminSections = useMemo(() => (isAdmin ? filterSectionsForUser(ADMIN_SECTIONS, user) : []), [isAdmin, user])

  const [openSections, setOpenSections] = useState(() => {
    const initial = {}
    for (const section of [...COMMERCIAL_SECTIONS, ...ADMIN_SECTIONS]) {
      initial[section.id] = section.defaultOpen ?? false
    }
    return initial
  })

  useEffect(() => {
    setOpenSections(previous => {
      const next = { ...previous }
      for (const section of [...commercialSections, ...adminSections]) {
        if (sectionHasActiveItem(section, pathname, search)) next[section.id] = true
      }
      if (onAdminRoute) {
        for (const section of adminSections) next[section.id] = true
      }
      return next
    })
  }, [pathname, search, commercialSections, adminSections, onAdminRoute])

  const toggleSection = (id) => {
    setOpenSections(previous => ({ ...previous, [id]: !previous[id] }))
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className={`app-sidebar home-sidebar ${compact ? 'app-sidebar--compact' : ''}`}>
      <div className="home-sidebar-brand">
        <Link to="/" className="app-sidebar-brand-link">
          <img src={`${import.meta.env.BASE_URL}zerux-logo.png`} alt="Zerux" className="home-sidebar-logo" width={138} height={42} />
        </Link>
      </div>

      <nav className="app-nav-scroll" aria-label="Navigation principale">
        {commercialSections.map(section => (
          <NavSectionBlock
            key={section.id}
            section={section}
            pathname={pathname}
            search={search}
            open={openSections[section.id] ?? false}
            onToggle={() => toggleSection(section.id)}
          />
        ))}

        {isAdmin && adminSections.length > 0 && (
          <>
            <div className="app-nav-divider">
              <span>Administration</span>
            </div>
            {adminSections.map(section => (
              <NavSectionBlock
                key={section.id}
                section={section}
                pathname={pathname}
                search={search}
                open={openSections[section.id] ?? onAdminRoute}
                onToggle={() => toggleSection(section.id)}
              />
            ))}
          </>
        )}
      </nav>

      <div className="home-sidebar-user">
        <div className="home-sidebar-avatar">{(user?.name || user?.email || 'U')[0].toUpperCase()}</div>
        <div>
          <div className="home-sidebar-name">{user?.name || user?.email}</div>
          <div className="home-sidebar-role">{user?.role === 'admin' ? 'Administrateur' : 'Commercial'}</div>
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
