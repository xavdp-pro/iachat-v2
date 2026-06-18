import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore.js'

/** Layout route guard — renders child routes via Outlet. */
export default function PrivateOutlet({ adminOnly = false }) {
  const { user, loading } = useAuthStore()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}
