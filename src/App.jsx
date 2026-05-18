import { useEffect, Suspense, lazy, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { useAuthStore } from './store/useAuthStore.js'
import { useThemeStore } from './store/useThemeStore.js'

// Lazy loading the pages to reduce initial bundle size
const Login = lazy(() => import('./pages/Login.jsx'))
const Home = lazy(() => import('./pages/Home.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))
const Chat = lazy(() => import('./pages/Chat.jsx'))
const Experiences = lazy(() => import('./pages/Experiences.jsx'))
const Prospects = lazy(() => import('./pages/Prospects.jsx'))
const ProspectQuotes = lazy(() => import('./pages/ProspectQuotes.jsx'))
const DevisStepper = lazy(() => import('./pages/DevisStepper.jsx'))
const DevisSearch = lazy(() => import('./pages/DevisSearch.jsx'))
const Knowledge = lazy(() => import('./pages/Knowledge.jsx'))
const Rules = lazy(() => import('./pages/Rules.jsx'))
const DevisGrid = lazy(() => import('./pages/DevisGrid.jsx'))
const DevisGridPdfDraft = lazy(() => import('./pages/DevisGridPdfDraft.jsx'))
const TransportTariffs = lazy(() => import('./pages/TransportTariffs.jsx'))

// Route guard — redirect to login if not authenticated
function PrivateRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuthStore()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/home" replace />
  return children
}

// Fallback for lazy routes
const PageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
    <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
)

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
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={
              <PrivateRoute adminOnly>
                <Admin />
              </PrivateRoute>
            } />
            <Route path="/home" element={
              <PrivateRoute>
                <Home />
              </PrivateRoute>
            } />
            <Route path="/chat" element={
              <PrivateRoute>
                <Chat />
              </PrivateRoute>
            } />
            <Route path="/experiences" element={
              <PrivateRoute>
                <Experiences />
              </PrivateRoute>
            } />
            <Route path="/knowledge" element={
              <PrivateRoute>
                <Knowledge />
              </PrivateRoute>
            } />
            <Route path="/rules" element={
              <PrivateRoute>
                <Rules />
              </PrivateRoute>
            } />
            <Route path="/devis" element={
              <PrivateRoute>
                <DevisStepper />
              </PrivateRoute>
            } />
            <Route path="/devis/search" element={
              <PrivateRoute>
                <DevisSearch />
              </PrivateRoute>
            } />
            <Route path="/devis/legacy" element={
              <PrivateRoute>
                <Navigate to="/home" replace />
              </PrivateRoute>
            } />
            <Route path="/devis/grid" element={
              <PrivateRoute>
                <DevisGrid />
              </PrivateRoute>
            } />
            <Route path="/devis/grid/pdf-draft" element={
              <PrivateRoute>
                <DevisGridPdfDraft />
              </PrivateRoute>
            } />
            <Route path="/devis/transport" element={
              <PrivateRoute>
                <TransportTariffs />
              </PrivateRoute>
            } />
            <Route path="/prospects" element={
              <PrivateRoute>
                <Prospects />
              </PrivateRoute>
            } />
            <Route path="/prospects/:id/quotes" element={
              <PrivateRoute>
                <ProspectQuotes />
              </PrivateRoute>
            } />
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </MotionConfig>
  )
}
