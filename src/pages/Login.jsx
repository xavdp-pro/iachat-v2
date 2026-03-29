import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Sparkles, Sun, Moon, Eye, EyeOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/useAuthStore.js'
import { useThemeStore } from '../store/useThemeStore.js'

export default function Login() {
  const { t, i18n } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const { login } = useAuthStore()
  const { darkMode, toggleDarkMode } = useThemeStore()

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(email, password)
      navigate('/chat')
    } catch (err) {
      setError(err?.error || t('login.invalidCredentials'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-toolbar">
        <div className="chat-sidebar-lang login-toolbar-lang" role="group" aria-label={t('login.language')}>
          {(['fr', 'en', 'es']).map((lng) => (
            <button
              key={lng}
              type="button"
              className={`chat-sidebar-lang-btn ${i18n.language.startsWith(lng) ? 'chat-sidebar-lang-btn--active' : ''}`}
              onClick={() => changeLanguage(lng)}
              aria-pressed={i18n.language.startsWith(lng)}
              aria-label={t(`chat.locale${lng.charAt(0).toUpperCase()}${lng.slice(1)}`)}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleDarkMode}
          className="login-toolbar-btn"
          aria-label={darkMode ? t('login.themeLight') : t('login.themeDark')}
        >
          {darkMode ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
        </button>
      </div>

      <motion.div
        className="login-page-inner"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
      >
        <div className="login-card">
          <div className="login-card-accent" aria-hidden />
          <div className="login-card-body">
            <div className="login-brand">
              <div className="login-logo">
                <Sparkles size={26} strokeWidth={1.75} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div>
                <h1 className="login-title">IAChat</h1>
                <p className="login-subtitle">{t('login.subtitle')}</p>
              </div>
            </div>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <div>
                <label className="login-field-label" htmlFor="login-email">
                  {t('login.email')}
                </label>
                <input
                  id="login-email"
                  className="login-input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.emailPlaceholder')}
                />
              </div>

              <div>
                <label className="login-field-label" htmlFor="login-password">
                  {t('login.password')}
                </label>
                <div className="login-input-wrap">
                  <input
                    id="login-password"
                    className="login-input login-input--password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('login.passwordPlaceholder')}
                  />
                  <button
                    type="button"
                    className="login-eye"
                    tabIndex={-1}
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                  </button>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    key="err"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="login-error"
                    role="alert"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="animate-spin" size={20} style={{ display: 'inline-block' }} />
                ) : (
                  t('login.submit')
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="login-footer">{t('login.footer')}</p>
      </motion.div>
    </div>
  )
}
