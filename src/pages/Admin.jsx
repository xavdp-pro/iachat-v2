import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Plus, Pencil, Trash2, ShieldCheck, User, Loader2, Moon, Sun, MessageSquare, LogOut, Bot, RefreshCw, X,
  Headphones, Play, Square, Volume2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/useAuthStore.js'
import { useThemeStore } from '../store/useThemeStore.js'
import api from '../api/index.js'

const TAB_USERS = 'users'
const TAB_OLLAMA = 'ollama'
const TAB_TTS = 'tts'
const VALID_TABS = new Set([TAB_USERS, TAB_OLLAMA, TAB_TTS])

function modelHintsFromVite() {
  const raw = import.meta.env.VITE_OLLAMA_MODEL_HINTS || ''
  return raw.split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({ name }))
}

export default function Admin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, logout } = useAuthStore()
  const { darkMode, toggleDarkMode } = useThemeStore()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalUser, setModalUser] = useState(undefined)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const [ollamaCfg, setOllamaCfg] = useState(null)
  const [ollamaForm, setOllamaForm] = useState({ modelChoice: '' })
  const [modelSearch, setModelSearch] = useState('')
  const [ollamaLoading, setOllamaLoading] = useState(true)
  const [ollamaSaving, setOllamaSaving] = useState(false)
  const [modelsRefreshing, setModelsRefreshing] = useState(false)
  const [ollamaTesting, setOllamaTesting] = useState(false)
  const [ollamaTestResult, setOllamaTestResult] = useState(null)
  const [ollamaFeedback, setOllamaFeedback] = useState('')

  // ── TTS state ────────────────────────────────────────────────────────────
  const [ttsVoices, setTtsVoices] = useState([])
  const [ttsVoicesLoading, setTtsVoicesLoading] = useState(false)
  const [ttsTestText, setTtsTestText] = useState('Bonjour, je suis votre assistant vocal IA.')
  const [ttsSpeed, setTtsSpeed] = useState(0.92)
  const [ttsTestingVoice, setTtsTestingVoice] = useState(null)
  const [ttsDefaultVoice, setTtsDefaultVoice] = useState(() => localStorage.getItem('tts_voice') || 'ff_siwis')
  const [ttsError, setTtsError] = useState('')
  const ttsAdminAudioRef = useRef(null)

  const tabParam = searchParams.get('tab')
  const activeTab = VALID_TABS.has(tabParam) ? tabParam : TAB_USERS

  const setActiveTab = (next) => {
    if (next === TAB_USERS) {
      setSearchParams({}, { replace: true })
    } else {
      setSearchParams({ tab: next }, { replace: true })
    }
  }

  useEffect(() => {
    if (tabParam != null && tabParam !== '' && !VALID_TABS.has(tabParam)) {
      setSearchParams({}, { replace: true })
    }
  }, [tabParam, setSearchParams])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const data = await api.get('/admin/users')
      setUsers(data)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const loadOllamaSettings = useCallback(async () => {
    setOllamaLoading(true)
    setOllamaFeedback('')
    try {
      const d = await api.get('/admin/ollama-settings', { timeout: 45000 })
      setOllamaCfg(d)
      setOllamaForm({
        modelChoice: d.dbModelOverride ?? '',
      })
      setModelSearch('')
    } catch {
      const hints = modelHintsFromVite()
      setOllamaCfg({
        defaultModel: '',
        dbModelOverride: null,
        enabledMode: 'inherit',
        effectiveEnabled: true,
        envOllamaEnabled: true,
        envDefaultModel: '',
        models: hints,
        modelsWarning: null,
        modelsSource: 'client-fallback',
        loadDegraded: true,
      })
      setOllamaForm({ modelChoice: '' })
      setModelSearch('')
    } finally {
      setOllamaLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab !== TAB_OLLAMA) return
    loadOllamaSettings()
  }, [activeTab, loadOllamaSettings])

  // ── TTS callbacks ─────────────────────────────────────────────────────────

  const loadTtsVoices = useCallback(async () => {
    setTtsVoicesLoading(true)
    setTtsError('')
    try {
      const d = await api.get('/tts/voices')
      setTtsVoices(d.voices || [])
    } catch {
      setTtsError(t('admin.ttsVoicesError'))
    } finally {
      setTtsVoicesLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (activeTab !== TAB_TTS) return
    loadTtsVoices()
  }, [activeTab, loadTtsVoices])

  const testTtsVoice = async (voiceId) => {
    if (!ttsTestText.trim()) return
    if (ttsAdminAudioRef.current) {
      ttsAdminAudioRef.current.pause()
      ttsAdminAudioRef.current = null
    }
    setTtsTestingVoice(voiceId)
    setTtsError('')
    try {
      const token = localStorage.getItem('token') || ''
      const resp = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: ttsTestText, voice: voiceId, speed: ttsSpeed }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        setTtsError(err.error || 'Erreur TTS')
        setTtsTestingVoice(null)
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      ttsAdminAudioRef.current = audio
      const cleanup = () => {
        setTtsTestingVoice(null)
        URL.revokeObjectURL(url)
        ttsAdminAudioRef.current = null
      }
      audio.onended = cleanup
      audio.onerror = () => { cleanup(); setTtsError('Erreur de lecture audio') }
      audio.play()
    } catch (err) {
      setTtsTestingVoice(null)
      setTtsError(err.message || 'Erreur')
    }
  }

  const stopTtsPlayback = () => {
    if (ttsAdminAudioRef.current) {
      ttsAdminAudioRef.current.pause()
      ttsAdminAudioRef.current = null
    }
    setTtsTestingVoice(null)
  }

  const setDefaultTtsVoice = (voiceId) => {
    localStorage.setItem('tts_voice', voiceId)
    setTtsDefaultVoice(voiceId)
  }

  const saveOllamaSettings = async (e) => {
    e.preventDefault()
    setOllamaSaving(true)
    setOllamaFeedback('')
    try {
      await api.put('/admin/ollama-settings', {
        defaultModel: ollamaForm.modelChoice,
        enabledMode: 'inherit',
      })
      setOllamaFeedback('saved')
      await loadOllamaSettings()
    } catch (err) {
      setOllamaFeedback(err?.error || 'save_failed')
    } finally {
      setOllamaSaving(false)
    }
  }

  const refreshOllamaModels = async () => {
    setModelsRefreshing(true)
    setOllamaFeedback('')
    try {
      const result = await api.post('/admin/ollama-models/refresh')
      setOllamaFeedback(`models_refreshed:${result?.count || 0}`)
      await loadOllamaSettings()
    } catch (err) {
      setOllamaFeedback(err?.error || 'models_refresh_failed')
    } finally {
      setModelsRefreshing(false)
    }
  }

  const testOllamaPrompt = async () => {
    setOllamaTesting(true)
    setOllamaFeedback('')
    setOllamaTestResult(null)
    try {
      const result = await api.post('/admin/ollama-test')
      setOllamaFeedback('test_ok')
      setOllamaTestResult(result)
    } catch (err) {
      setOllamaFeedback(err?.error || 'test_failed')
    } finally {
      setOllamaTesting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    await api.delete(`/admin/users/${confirmDelete.id}`)
    setConfirmDelete(null)
    fetchUsers()
  }

  const filteredModels = (ollamaCfg?.models || []).filter((m) => {
    if (!modelSearch.trim()) return true
    return String(m.name || '').toLowerCase().includes(modelSearch.trim().toLowerCase())
  })

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-brand">
          <div className="admin-topbar-mark">
            <ShieldCheck size={18} strokeWidth={2} />
          </div>
          <div className="admin-topbar-text">
            <h1>{t('admin.title')}</h1>
            <p>{t('common.appName')}</p>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="admin-btn-ghost" onClick={() => navigate('/chat')}>
            <MessageSquare size={16} />
            {t('admin.backToChat')}
          </button>
          <button type="button" className="admin-btn-icon" onClick={toggleDarkMode} aria-label="Theme">
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button type="button" className="admin-btn-icon admin-btn-icon--danger" onClick={logout} aria-label="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-tabs" role="tablist" aria-label={t('admin.tabsLabel')}>
          <button
            type="button"
            role="tab"
            id="admin-tab-users"
            aria-selected={activeTab === TAB_USERS}
            aria-controls="admin-panel-users"
            className={`admin-tab ${activeTab === TAB_USERS ? 'admin-tab--active' : ''}`}
            onClick={() => setActiveTab(TAB_USERS)}
          >
            <User size={17} strokeWidth={2} aria-hidden />
            {t('admin.tabUsers')}
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-ollama"
            aria-selected={activeTab === TAB_OLLAMA}
            aria-controls="admin-panel-ollama"
            className={`admin-tab ${activeTab === TAB_OLLAMA ? 'admin-tab--active' : ''}`}
            onClick={() => setActiveTab(TAB_OLLAMA)}
          >
            <Bot size={17} strokeWidth={2} aria-hidden />
            {t('admin.tabOllama')}
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-tts"
            aria-selected={activeTab === TAB_TTS}
            aria-controls="admin-panel-tts"
            className={`admin-tab ${activeTab === TAB_TTS ? 'admin-tab--active' : ''}`}
            onClick={() => setActiveTab(TAB_TTS)}
          >
            <Headphones size={17} strokeWidth={2} aria-hidden />
            {t('admin.tabTts')}
          </button>
        </div>

        {activeTab === TAB_OLLAMA && (
        <section
          id="admin-panel-ollama"
          role="tabpanel"
          aria-labelledby="admin-tab-ollama"
          className="admin-ollama-panel"
        >
          <div className="admin-ollama-head">
            <div className="admin-ollama-icon" aria-hidden>
              <Bot size={22} strokeWidth={2} />
            </div>
            <div>
              <h2 id="admin-ollama-heading">{t('admin.ollamaTitle')}</h2>
              <p className="admin-ollama-desc">{t('admin.ollamaSubtitle')}</p>
            </div>
          </div>
          {ollamaLoading ? (
            <div className="admin-loading admin-loading--inline">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            </div>
          ) : ollamaCfg ? (
            <form className="admin-ollama-form" onSubmit={saveOllamaSettings}>
              <div className="admin-ollama-grid">
                <div className="admin-ollama-field">
                  <label className="admin-ollama-label">
                    {t('admin.ollamaEnabledLabel')}
                  </label>
                  <p className="admin-ollama-hint">
                    {t('admin.ollamaEnabledManaged')}
                  </p>
                  <p className="admin-ollama-hint">
                    {t('admin.ollamaEnabledHint', {
                      env: ollamaCfg.envOllamaEnabled ? t('common.active') : t('common.inactive'),
                    })}
                  </p>
                </div>
                <div className="admin-ollama-field">
                  <label className="admin-ollama-label" htmlFor="ollama-model">
                    {t('admin.ollamaModelLabel')}
                  </label>
                  <div className="admin-ollama-search-row">
                    <input
                      id="ollama-model"
                      className="admin-ollama-select"
                      type="text"
                      autoComplete="off"
                      value={modelSearch}
                      placeholder={t('admin.ollamaModelSearchPlaceholder')}
                      onChange={(e) => setModelSearch(e.target.value)}
                    />
                    {modelSearch && (
                      <button
                        type="button"
                        className="admin-ollama-clear-btn"
                        onClick={() => setModelSearch('')}
                        aria-label={t('admin.ollamaClearSearch')}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <select
                    className="admin-ollama-select admin-ollama-select-list"
                    value={ollamaForm.modelChoice}
                    onChange={(e) =>
                      setOllamaForm((f) => ({ ...f, modelChoice: e.target.value }))
                    }
                  >
                    <option value="">{t('admin.ollamaModelEnv')}</option>
                    {filteredModels.map((m) => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                  <div className="admin-ollama-model-actions">
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      onClick={refreshOllamaModels}
                      disabled={modelsRefreshing}
                    >
                      {modelsRefreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                      {t('admin.ollamaRefreshModels')}
                    </button>
                    {ollamaForm.modelChoice && (
                      <button
                        type="button"
                        className="admin-btn-ghost"
                        onClick={() => setOllamaForm((f) => ({ ...f, modelChoice: '' }))}
                      >
                        <X size={16} />
                        {t('admin.ollamaClearModel')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      onClick={testOllamaPrompt}
                      disabled={ollamaTesting}
                    >
                      {ollamaTesting ? <Loader2 className="animate-spin" size={16} /> : <Bot size={16} />}
                      {t('admin.ollamaTestPrompt')}
                    </button>
                  </div>
                  <p className="admin-ollama-hint">
                    {t('admin.ollamaModelHint', {
                      model:
                        ollamaCfg.defaultModel ||
                        ollamaCfg.envDefaultModel ||
                        '—',
                    })}
                  </p>
                </div>
              </div>
              {ollamaCfg.loadDegraded && (
                <p className="admin-ollama-warn" role="status">{t('admin.ollamaDegradedBanner')}</p>
              )}
              {ollamaCfg.modelsWarning && (
                <div className="admin-ollama-warn-block" role="status">
                  <p className="admin-ollama-warn-intro">{t('admin.ollamaModelsListWarningIntro')}</p>
                  <p className="admin-ollama-warn-detail">{ollamaCfg.modelsWarning}</p>
                </div>
              )}
              {ollamaFeedback === 'saved' && (
                <p className="admin-ollama-success" role="status">{t('admin.ollamaSaved')}</p>
              )}
              {typeof ollamaFeedback === 'string' && ollamaFeedback.startsWith('models_refreshed:') && (
                <p className="admin-ollama-success" role="status">
                  {t('admin.ollamaModelsRefreshed', { count: Number(ollamaFeedback.split(':')[1] || 0) })}
                </p>
              )}
              {ollamaFeedback === 'test_ok' && ollamaTestResult && (
                <p className="admin-ollama-success" role="status">
                  {t('admin.ollamaTestOk', {
                    model: ollamaTestResult.model,
                    ms: ollamaTestResult.latencyMs,
                    reply: ollamaTestResult.reply,
                  })}
                </p>
              )}
              {ollamaFeedback === 'save_failed' && (
                <p className="admin-ollama-warn" role="alert">{t('admin.ollamaError')}</p>
              )}
              {ollamaFeedback === 'models_refresh_failed' && (
                <p className="admin-ollama-warn" role="alert">{t('admin.ollamaRefreshError')}</p>
              )}
              {typeof ollamaFeedback === 'string' &&
                ollamaFeedback &&
                !['saved', 'save_failed', 'models_refresh_failed', 'test_ok'].includes(ollamaFeedback) &&
                !ollamaFeedback.startsWith('models_refreshed:') && (
                <p className="admin-ollama-warn" role="alert">{ollamaFeedback}</p>
              )}
              <div className="admin-ollama-actions">
                <button type="submit" className="admin-btn-primary" disabled={ollamaSaving}>
                  {ollamaSaving ? <Loader2 className="animate-spin" size={18} /> : t('admin.ollamaSave')}
                </button>
              </div>
            </form>
          ) : (
            <p className="admin-ollama-warn">{t('admin.ollamaError')}</p>
          )}
        </section>
        )}

        {activeTab === TAB_USERS && (
        <>
        <div
          id="admin-panel-users"
          role="tabpanel"
          aria-labelledby="admin-tab-users"
          className="admin-users-panel"
        >
        <div className="admin-toolbar">
          <div>
            <h2>{t('admin.userListTitle')}</h2>
            <p>{t('admin.subtitle')}</p>
            <p className="admin-toolbar-meta">{t('admin.userCount', { count: users.length })}</p>
          </div>
          <button type="button" className="admin-btn-primary" onClick={() => setModalUser(null)}>
            <Plus size={17} strokeWidth={2} />
            {t('admin.addUser')}
          </button>
        </div>

        <div className="admin-table-wrap">
          {loading ? (
            <div className="admin-loading">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
              <span>{t('common.loading')}</span>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.colName')}</th>
                  <th>{t('admin.colEmail')}</th>
                  <th>{t('admin.colRole')}</th>
                  <th>{t('admin.colStatus')}</th>
                  <th>{t('admin.colCreated')}</th>
                  <th aria-label={t('admin.colActions')} />
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  >
                    <td>
                      <div className="admin-user-cell">
                        <div className={`admin-avatar ${u.role === 'admin' ? '' : 'admin-avatar--user'}`}>
                          {u.role === 'admin' ? <ShieldCheck size={16} /> : <User size={16} />}
                        </div>
                        <span className="admin-user-name">{u.name || t('admin.anonymous')}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--color-text-2)' }}>{u.email}</td>
                    <td>
                      <span className={`admin-badge ${u.role === 'admin' ? '' : 'admin-badge--muted'}`}>
                        {u.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')}
                      </span>
                    </td>
                    <td>
                      <span className="admin-status">
                        <span className={`admin-status-dot ${u.active ? 'admin-status-dot--on' : 'admin-status-dot--off'}`} />
                        {u.active ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-3)', fontSize: '0.8125rem' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-table-icon-btn"
                          onClick={() => setModalUser(u)}
                          aria-label={t('common.edit')}
                        >
                          <Pencil size={15} />
                        </button>
                        {u.id !== user?.id && (
                          <button
                            type="button"
                            className="admin-table-icon-btn admin-table-icon-btn--danger"
                            onClick={() => setConfirmDelete(u)}
                            aria-label={t('common.delete')}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
        </>
        )}

        {activeTab === TAB_TTS && (
        <section
          id="admin-panel-tts"
          role="tabpanel"
          aria-labelledby="admin-tab-tts"
          className="admin-ollama-panel"
        >
          <div className="admin-ollama-head">
            <div className="admin-ollama-icon" aria-hidden>
              <Headphones size={22} strokeWidth={2} />
            </div>
            <div>
              <h2>{t('admin.ttsTitle')}</h2>
              <p className="admin-ollama-desc">{t('admin.ttsSubtitle')}</p>
            </div>
          </div>

          <div className="admin-tts-config">
            <div className="admin-ollama-field">
              <label className="admin-ollama-label" htmlFor="tts-test-input">
                {t('admin.ttsTestLabel')}
              </label>
              <input
                id="tts-test-input"
                className="admin-ollama-select"
                type="text"
                value={ttsTestText}
                onChange={(e) => setTtsTestText(e.target.value)}
                placeholder={t('admin.ttsTestPlaceholder')}
              />
            </div>
            <div className="admin-ollama-field">
              <label className="admin-ollama-label" htmlFor="tts-speed">
                {t('admin.ttsSpeedLabel')} : <strong>{ttsSpeed.toFixed(2)}×</strong>
              </label>
              <input
                id="tts-speed"
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={ttsSpeed}
                onChange={(e) => setTtsSpeed(Number(e.target.value))}
                style={{ width: '100%', maxWidth: '320px', accentColor: 'var(--color-primary)', display: 'block' }}
              />
            </div>
            <p className="admin-ollama-hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4em' }}>
              <Volume2 size={14} />
              {t('admin.ttsDefaultVoiceLabel')} : <strong>{ttsDefaultVoice}</strong>
            </p>
          </div>

          {ttsError && (
            <p className="admin-ollama-warn" role="alert">{ttsError}</p>
          )}

          {ttsVoicesLoading ? (
            <div className="admin-loading admin-loading--inline">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            </div>
          ) : (
            <div className="admin-tts-voices">
              {ttsVoices.map((voice) => {
                const isDefault = voice.id === ttsDefaultVoice
                const isTesting = ttsTestingVoice === voice.id
                return (
                  <div
                    key={voice.id}
                    className={`admin-tts-voice-card ${isDefault ? 'admin-tts-voice-card--active' : ''}`}
                  >
                    <div className="admin-tts-voice-info">
                      <span className="admin-tts-voice-name">{voice.name}</span>
                      <span className="admin-tts-voice-label">{voice.label}</span>
                    </div>
                    <div className="admin-tts-voice-actions">
                      {isDefault && (
                        <span className="admin-badge">{t('admin.ttsVoiceIsDefault')}</span>
                      )}
                      {!isDefault && (
                        <button
                          type="button"
                          className="admin-btn-ghost"
                          onClick={() => setDefaultTtsVoice(voice.id)}
                          style={{ fontSize: '0.78rem' }}
                        >
                          {t('admin.ttsVoiceSetDefault')}
                        </button>
                      )}
                      {isTesting ? (
                        <button
                          type="button"
                          className="admin-btn-ghost"
                          onClick={stopTtsPlayback}
                          style={{ color: 'var(--color-danger)' }}
                        >
                          <Square size={14} />
                          {t('admin.ttsPlaying')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-btn-primary"
                          onClick={() => testTtsVoice(voice.id)}
                          disabled={ttsTestingVoice != null}
                          style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem' }}
                        >
                          <Play size={14} />
                          {t('admin.ttsPlay')}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
        )}

      </main>

      <AnimatePresence>
        {modalUser !== undefined && (
          <UserModal
            user={modalUser}
            onSave={() => {
              setModalUser(undefined)
              fetchUsers()
            }}
            onClose={() => setModalUser(undefined)}
          />
        )}
        {confirmDelete && (
          <ConfirmModal
            title={t('admin.deleteTitle')}
            message={t('admin.deleteMessage', { email: confirmDelete.email })}
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(null)}
            confirmLabel={t('common.delete')}
            cancelLabel={t('common.cancel')}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function UserModal({ user, onSave, onClose }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    email: user?.email || '',
    name: user?.name || '',
    role: user?.role || 'user',
    password: '',
    active: user?.active !== undefined ? user.active : true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (user) await api.put(`/admin/users/${user.id}`, form)
      else await api.post('/admin/users', form)
      onSave()
    } catch (err) {
      setError(err?.error || t('admin.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="chat-modal-backdrop"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        className="chat-modal admin-modal-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="chat-modal-title">{user ? t('admin.modalEdit') : t('admin.modalNew')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="chat-modal-field">
            <label className="chat-modal-label" htmlFor="adm-email">{t('admin.email')}</label>
            <input
              id="adm-email"
              className="chat-modal-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              disabled={!!user}
              required
              autoComplete="email"
            />
          </div>
          <div className="chat-modal-field">
            <label className="chat-modal-label" htmlFor="adm-name">{t('admin.name')}</label>
            <input
              id="adm-name"
              className="chat-modal-input"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoComplete="name"
            />
          </div>
          <div className="chat-modal-field">
            <label className="chat-modal-label" htmlFor="adm-pw">{t('admin.password')}</label>
            <input
              id="adm-pw"
              className="chat-modal-input"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
          <div className="admin-form-grid">
            <div className="chat-modal-field" style={{ marginBottom: 0 }}>
              <label className="chat-modal-label" htmlFor="adm-role">{t('admin.role')}</label>
              <select
                id="adm-role"
                className="chat-modal-select"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                <option value="user">{t('admin.roleUser')}</option>
                <option value="admin">{t('admin.roleAdmin')}</option>
              </select>
            </div>
            <div className="chat-modal-field" style={{ marginBottom: 0 }}>
              <label className="chat-modal-label" htmlFor="adm-active">{t('admin.accountState')}</label>
              <select
                id="adm-active"
                className="chat-modal-select"
                value={form.active ? '1' : '0'}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === '1' }))}
              >
                <option value="1">{t('common.active')}</option>
                <option value="0">{t('common.inactive')}</option>
              </select>
            </div>
          </div>
          {error && (
            <div
              className="chat-modal-field"
              style={{
                marginBottom: 0,
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
                color: 'var(--color-danger)',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
          <div className="chat-modal-actions">
            <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="chat-modal-btn chat-modal-btn--primary" disabled={saving}>
              {saving ? <Loader2 className="animate-spin mx-auto" size={18} /> : t('common.save')}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

function ConfirmModal({ title, message, onConfirm, onCancel, confirmLabel, cancelLabel }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="chat-modal-backdrop"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="admin-confirm-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="admin-confirm-actions">
          <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="chat-modal-btn chat-modal-btn--danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
