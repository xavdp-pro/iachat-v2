import AppSidebar from './AppSidebar.jsx'
import AppBreadcrumbs from './AppBreadcrumbs.jsx'
import { useAppBreadcrumbs } from '../hooks/useAppBreadcrumbs.js'
import { useBreadcrumbOverrideEffect } from '../context/BreadcrumbOverrideContext.jsx'

/**
 * Shared layout: sidebar + page header + scrollable content.
 */
export default function AppPageShell({
  title,
  subtitle,
  children,
  headerActions = null,
  contentClassName = 'app-page-content',
  centerContent = false,
  hideHeader = false,
  breadcrumbs: breadcrumbsProp = null,
  breadcrumbOverrides = null,
  hideBreadcrumbs = false,
}) {
  useBreadcrumbOverrideEffect(breadcrumbOverrides || {})
  const autoBreadcrumbs = useAppBreadcrumbs()
  const breadcrumbs = breadcrumbsProp ?? autoBreadcrumbs

  return (
    <div className="app-shell home-shell">
      <AppSidebar />
      <div className={`app-page-column ${centerContent ? 'app-page-column--center' : ''}`}>
        {!hideHeader && (title || headerActions || (!hideBreadcrumbs && breadcrumbs?.length)) && (
          <header className="app-page-topbar">
            <div className="app-page-topbar-text">
              {!hideBreadcrumbs && <AppBreadcrumbs items={breadcrumbs} />}
              {title && <h1>{title}</h1>}
              {subtitle && <p>{subtitle}</p>}
            </div>
            {headerActions && <div className="app-page-topbar-actions">{headerActions}</div>}
          </header>
        )}
        <div className={contentClassName}>{children}</div>
      </div>
    </div>
  )
}
