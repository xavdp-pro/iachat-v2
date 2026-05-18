import axios from 'axios'

export function getAuthToken() {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || ''
    return token.trim().replace(/^"|"$/g, '')
  } catch {
    return ''
  }
}

export function hasAuthToken() {
  return Boolean(getAuthToken())
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
})

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = getAuthToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Global error handling
api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 503 && err.response?.data?.code === 'MAINTENANCE_MODE') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app:maintenance', { detail: err.response.data }))
      }
    }
    if (err.response?.status === 401) {
      try {
        localStorage.removeItem('token')
        localStorage.removeItem('auth_user')
        sessionStorage.removeItem('token')
      } catch { /* noop */ }
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.dispatchEvent(new CustomEvent('auth:expired'))
      }
    }
    return Promise.reject(err.response?.data || { error: err.message })
  }
)

export default api
