import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { buildBreadcrumbs } from '../lib/breadcrumbs.js'
import { useBreadcrumbOverridesState } from '../context/BreadcrumbOverrideContext.jsx'

/** @param {Record<string, string|undefined>} [localOverrides] */
export function useAppBreadcrumbs(localOverrides = {}) {
  const { pathname, search } = useLocation()
  const globalOverrides = useBreadcrumbOverridesState()
  const overrides = useMemo(
    () => ({ ...globalOverrides, ...localOverrides }),
    [globalOverrides, localOverrides],
  )
  return useMemo(
    () => buildBreadcrumbs(pathname, search, overrides),
    [pathname, search, overrides],
  )
}
