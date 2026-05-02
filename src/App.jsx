import { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { useAuthStore } from './store/useAuthStore.js'
import { useThemeStore } from './store/useThemeStore.js'

// Lazy loading the pages to reduce initial bundle size
const Login = lazy(() => import('./pages/Login.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))
const Chat = lazy(() => import('./pages/Chat.jsx'))
const Experiences = lazy(() => import('./pages/Experiences.jsx'))
const Devis = lazy(() => import('./pages/Devis.jsx'))
const Prospects = lazy(() => import('./pages/Prospects.jsx'))
const ProspectQuotes = lazy(() => import('./pages/ProspectQuotes.jsx'))
const DevisStepper = lazy(() => import('./pages/DevisStepper.jsx'))
const Knowledge = lazy(() => import('./pages/Knowledge.jsx'))
const DevisGrid = lazy(() => import('./pages/DevisGrid.jsx'))

// Route guard — redirect to login if not authenticated
function PrivateRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuthStore()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/chat" replace />
  return children
}

// Fallback for lazy routes
const PageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
    <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
)

export default function App() {
  const { init: initAuth } = useAuthStore()
  const { init: initTheme, fetchSkins } = useThemeStore()

  useEffect(() => {
    initTheme()
    fetchSkins()
    initAuth()
  }, [])

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
            <Route path="/devis" element={
              <PrivateRoute>
                <DevisStepper />
              </PrivateRoute>
            } />
            <Route path="/devis/legacy" element={
              <PrivateRoute>
                <Devis />
              </PrivateRoute>
            } />
            <Route path="/devis/grid" element={
              <PrivateRoute>
                <DevisGrid />
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
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </MotionConfig>
  )
}
