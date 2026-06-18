import { useEffect, Suspense, lazy, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { useAuthStore } from './store/useAuthStore.js'
import { useThemeStore } from './store/useThemeStore.js'
import PrivateOutlet from './components/PrivateOutlet.jsx'
import { BreadcrumbOverrideProvider } from './context/BreadcrumbOverrideContext.jsx'
import AppRouteHead from './components/AppRouteHead.jsx'

// Lazy loading the pages to reduce initial bundle size
const Login = lazy(() => import('./pages/Login.jsx'))
const Home = lazy(() => import('./pages/Home.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))
const Chat = lazy(() => import('./pages/Chat.jsx'))
const Experiences = lazy(() => import('./pages/Experiences.jsx'))
const Prospects = lazy(() => import('./pages/Prospects.jsx'))
const ProspectQuotes = lazy(() => import('./pages/ProspectQuotes.jsx'))
const ImapConversationsLab = lazy(() => import('./pages/ImapConversationsLab.jsx'))
const DevisStepper = lazy(() => import('./pages/DevisStepper.jsx'))
const DevisSearch = lazy(() => import('./pages/DevisSearch.jsx'))
const Knowledge = lazy(() => import('./pages/Knowledge.jsx'))
const Rules = lazy(() => import('./pages/Rules.jsx'))
const DevisGrid = lazy(() => import('./pages/DevisGrid.jsx'))
const DevisGridPdfDraft = lazy(() => import('./pages/DevisGridPdfDraft.jsx'))
const TransportTariffs = lazy(() => import('./pages/TransportTariffs.jsx'))

// Fallback for lazy routes
const PageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
    <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
)

function ModalDismissController() {
  useEffect(() => {
    const selector = '.chat-modal-backdrop, [data-modal-backdrop="true"], [role="dialog"][aria-modal="true"]'
    const visibleBackdrops = () => Array.from(document.querySelectorAll(selector))
      .filter((element) => {
        const style = window.getComputedStyle(element)
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
      })
    const topmostBackdrop = () => visibleBackdrops()
      .map((element, index) => ({ element, index, zIndex: Number.parseInt(window.getComputedStyle(element).zIndex, 10) || 0 }))
      .sort((a, b) => (a.zIndex - b.zIndex) || (a.index - b.index))
      .at(-1)?.element || null
    const dismiss = (element) => {
      if (!element || element.dataset.modalDismissDisabled === 'true') return false
      element.click()
      return true
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (!dismiss(topmostBackdrop())) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
    }
    const onPointerDown = (event) => {
      const target = event.target
      if (!(target instanceof Element) || !target.matches(selector)) return
      if (!dismiss(target)) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])
  return null
}

function MaintenanceScreen({ status }) {
  return (
    <div className="login-page maintenance-page">
      <main className="login-page-inner">
        <div className="login-card maintenance-card">
          <div className="login-card-body">
            <div className="login-brand maintenance-brand">
              <div className="login-logo">
                <img
                  src={`${import.meta.env.BASE_URL}zerux-logo.png`}
                  alt="Zerux"
                  className="login-logo-img"
                  width={112}
                  height={112}
                  decoding="async"
                />
              </div>
            </div>

            <section className="maintenance-content" aria-labelledby="maintenance-title">
              <h1 id="maintenance-title" className="maintenance-title">Maintenance<br />en cours</h1>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const [maintenanceStatus, setMaintenanceStatus] = useState(null)
  const { init: initAuth } = useAuthStore()
  const { init: initTheme, fetchSkins } = useThemeStore()

  useEffect(() => {
    initTheme()
    fetchSkins()
    initAuth()
  }, [fetchSkins, initAuth, initTheme])

  useEffect(() => {
    const onMaintenance = (event) => setMaintenanceStatus(event.detail || { message: 'Maintenance en cours.' })
    window.addEventListener('app:maintenance', onMaintenance)
    fetch('/api/maintenance-status')
      .then(response => response.ok ? response.json() : null)
      .then(status => {
        if (status?.enabled && !status?.bypassed) setMaintenanceStatus(status)
        else setMaintenanceStatus(null)
      })
      .catch(() => {})
    return () => window.removeEventListener('app:maintenance', onMaintenance)
  }, [])

  if (maintenanceStatus) return <MaintenanceScreen status={maintenanceStatus} />

  return (
    <MotionConfig transition={{ duration: 0 }}>
      <ModalDismissController />
      <BrowserRouter>
        <BreadcrumbOverrideProvider>
          <AppRouteHead />
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<PrivateOutlet />}>
              <Route path="/" element={<Home />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/experiences" element={<Experiences />} />
              <Route path="/knowledge" element={<Knowledge />} />
              <Route path="/rules" element={<Rules />} />
              <Route path="/prospects" element={<Prospects />} />
              <Route path="/prospects/:id/quotes" element={<ProspectQuotes />} />

              <Route path="/devis">
                <Route index element={<DevisStepper />} />
                <Route path="search" element={<DevisSearch />} />
                <Route path="imap-lab" element={<ImapConversationsLab />} />
                <Route path="grid" element={<DevisGrid />} />
                <Route path="grid/pdf-draft" element={<DevisGridPdfDraft />} />
                <Route path="transport" element={<TransportTariffs />} />
                <Route path="legacy" element={<Navigate to="/" replace />} />
              </Route>
            </Route>

            <Route element={<PrivateOutlet adminOnly />}>
              <Route path="/admin" element={<Admin />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </BreadcrumbOverrideProvider>
      </BrowserRouter>
    </MotionConfig>
  )
}
