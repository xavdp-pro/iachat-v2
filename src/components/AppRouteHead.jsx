import { useAppBreadcrumbs } from '../hooks/useAppBreadcrumbs.js'
import { useBreadcrumbChrome } from '../hooks/useBreadcrumbChrome.js'

/** Global document title + Alt+← based on route and breadcrumb overrides. */
export default function AppRouteHead() {
  const crumbs = useAppBreadcrumbs()
  useBreadcrumbChrome(crumbs)
  return null
}
