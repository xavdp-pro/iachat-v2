import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Default skin bundled so login/layout work even if /api/skins is slow or misconfigured
import '../skins/default/theme.css'
import App from './App.jsx'
import './i18n.js' // Import i18n initialization

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
