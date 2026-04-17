import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { useAuthStore } from './store/useAuthStore.js'
import { useThemeStore } from './store/useThemeStore.js'
import Login from './pages/Login.jsx'
import Admin from './pages/Admin.jsx'
import Chat from './pages/Chat.jsx'
import Experiences from './pages/Experiences.jsx'
import Devis from './pages/Devis.jsx'
import Prospects from './pages/Prospects.jsx'
import ProspectQuotes from './pages/ProspectQuotes.jsx'
import DevisStepper from './pages/DevisStepper.jsx'

// Route guard — redirect to login if not authenticated
function PrivateRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuthStore()
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/chat" replace />
  return children
}

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
      </BrowserRouter>
    </MotionConfig>
  )
}
