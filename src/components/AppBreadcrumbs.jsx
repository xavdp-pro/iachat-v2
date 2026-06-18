import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

/**
 * @param {{ items: { label: string, to?: string }[], compact?: boolean }} props
 */
export default function AppBreadcrumbs({ items = [], compact = false }) {
  if (!items?.length) return null

  return (
    <nav className={`app-breadcrumbs ${compact ? 'app-breadcrumbs--compact' : ''}`} aria-label="Fil d'Ariane">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={`${item.label}-${index}`} className="app-breadcrumbs-segment">
            {index > 0 && <ChevronRight size={compact ? 12 : 13} className="app-breadcrumbs-sep" aria-hidden />}
            {item.onActivate && !isLast ? (
              <button type="button" onClick={item.onActivate} className="app-breadcrumbs-link app-breadcrumbs-button">
                {item.label}
              </button>
            ) : item.to && !isLast ? (
              <Link to={item.to} className="app-breadcrumbs-link">{item.label}</Link>
            ) : (
              <span className={`app-breadcrumbs-current ${isLast ? 'app-breadcrumbs-current--last' : ''}`}>{item.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
