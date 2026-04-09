import { create } from 'zustand'
import api from '../api/index.js'

export const useThemeStore = create((set, get) => ({
  skins: [],
  activeSkin: localStorage.getItem('skin') || 'default',
  darkMode: localStorage.getItem('darkMode') === 'true',
  skinLinkEl: null,

  // Load available skins from API
  fetchSkins: async () => {
    try {
      const skins = await api.get('/skins')
      set({ skins })
    } catch {
      set({ skins: [] })
    }
  },

  // Apply a skin: default is bundled in main.jsx; others load via /api
  applySkin: (slug) => {
    const existing = document.getElementById('iachat-skin')
    if (existing) existing.remove()

    if (slug !== 'default') {
      const link = document.createElement('link')
      link.id = 'iachat-skin'
      link.rel = 'stylesheet'
      link.href = `/api/skins/${slug}/theme.css?t=${Date.now()}`
      document.head.appendChild(link)
    }

    localStorage.setItem('skin', slug)
    set({ activeSkin: slug })
  },

  // Toggle dark / light mode
  toggleDarkMode: () => {
    const next = !get().darkMode
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('darkMode', String(next))
    set({ darkMode: next })
  },

  // Init both skin and dark mode on app load
  init: () => {
    const { activeSkin, darkMode } = get()
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    const existing = document.getElementById('iachat-skin')
    if (existing) existing.remove()
    // Non-default skins only: default theme is imported in main.jsx
    if (activeSkin !== 'default') {
      const link = document.createElement('link')
      link.id = 'iachat-skin'
      link.rel = 'stylesheet'
      link.href = `/api/skins/${activeSkin}/theme.css?t=${Date.now()}`
      document.head.appendChild(link)
    }
  },
}))
