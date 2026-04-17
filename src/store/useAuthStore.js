import { create } from 'zustand'
import api from '../api/index.js'

// Restore cached user synchronously to avoid blank screen on reload
const _cachedUser = (() => { try { const u = localStorage.getItem('auth_user'); return u ? JSON.parse(u) : null } catch { return null } })()
const _cachedToken = localStorage.getItem('token') || null

export const useAuthStore = create((set) => ({
  user: _cachedUser,
  token: _cachedToken,
  loading: false,

  // Validate token in background (no spinner)
  init: async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      localStorage.removeItem('auth_user')
      return set({ user: null, token: null, loading: false })
    }
    try {
      const user = await api.get('/auth/me')
      localStorage.setItem('auth_user', JSON.stringify(user))
      set({ user, token, loading: false })
    } catch {
      localStorage.removeItem('token')
      localStorage.removeItem('auth_user')
      set({ user: null, token: null, loading: false })
    }
  },

  login: async (email, password) => {
    const { token, user } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    set({ token, user })
    return user
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('auth_user')
    set({ user: null, token: null })
  },
}))
