import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { formatDocumentTitle, getBreadcrumbBackTarget } from '../lib/breadcrumbs.js'
import { useBreadcrumbBackInvoker } from '../context/BreadcrumbOverrideContext.jsx'

const APP_TITLE = 'Zerux'

/**
 * Sync document.title and Alt+← back navigation from breadcrumb trail.
 * @param {{ label: string, to?: string }[]} crumbs
 */
export function useBreadcrumbChrome(crumbs = []) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const invokeBackHandler = useBreadcrumbBackInvoker()

  useEffect(() => {
    const previous = document.title
    document.title = formatDocumentTitle(crumbs, APP_TITLE)
    return () => {
      document.title = previous
    }
  }, [crumbs])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!event.altKey || event.key !== 'ArrowLeft') return
      const active = document.activeElement
      const tag = active?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active?.isContentEditable) return
      if (invokeBackHandler()) {
        event.preventDefault()
        return
      }
      const target = getBreadcrumbBackTarget(crumbs, pathname)
      if (!target) return
      event.preventDefault()
      navigate(target)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [crumbs, navigate, pathname, invokeBackHandler])
}
