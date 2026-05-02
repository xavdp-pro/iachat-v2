import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Plus, Pencil, Trash2, ShieldCheck, User, Loader2, Moon, Sun, MessageSquare, LogOut, Mic, Bot, RefreshCw, X,
  Headphones, Play, Square, Volume2, Menu, Undo2, CornerUpLeft, MessageCircleReply, BookOpen, CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/useAuthStore.js'
import { useThemeStore } from '../store/useThemeStore.js'
import api from '../api/index.js'

const TAB_USERS = 'users'
const TAB_STT = 'stt'
const TAB_TTS = 'tts'
const TAB_EXPERIENCES = 'experiences'
const VALID_TABS = new Set([TAB_USERS, TAB_STT, TAB_TTS, TAB_EXPERIENCES])

export default function Admin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, logout } = useAuthStore()
  const { darkMode, toggleDarkMode } = useThemeStore()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalUser, setModalUser] = useState(undefined)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const [sttTesting, setSttTesting] = useState(false)
  const [sttResult, setSttResult] = useState('')
  const [sttError, setSttError] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef(null)
  const sttChunksRef = useRef([])

  // ── TTS state ────────────────────────────────────────────────────────────
  const [ttsVoices, setTtsVoices] = useState([])
  const [ttsVoicesLoading, setTtsVoicesLoading] = useState(false)
  const [ttsSearch, setTtsSearch] = useState('')
  const [ttsTestText, setTtsTestText] = useState('Bonjour, je suis votre assistant vocal IA.')
  const [ttsSpeed, setTtsSpeed] = useState(0.92)
  const [ttsTestingVoice, setTtsTestingVoice] = useState(null)
  const [ttsDefaultVoice, setTtsDefaultVoice] = useState(() => localStorage.getItem('tts_voice') || 'Ana Florence')
  const [ttsError, setTtsError] = useState('')
  const ttsAdminAudioRef = useRef(null)

  // ── Experiences (knowledge base) state ────────────────────────────────
  const [allExperiences, setAllExperiences] = useState([])
  const [expLoading, setExpLoading] = useState(false)

  const tabParam = searchParams.get('tab')
  const activeTab = VALID_TABS.has(tabParam) ? tabParam : TAB_USERS

  const setActiveTab = (next) => {
    if (next === TAB_USERS) {
      setSearchParams({}, { replace: true })
    } else {
      setSearchParams({ tab: next }, { replace: true })
    }
  }

  const fetchAllExperiences = useCallback(async () => {
    setExpLoading(true)
    try {
      const data = await api.get('/experiences')
      setAllExperiences(data)
    } catch { /* ignore */ }
    finally { setExpLoading(false) }
  }, [])

  useEffect(() => {
    if (activeTab === TAB_EXPERIENCES) fetchAllExperiences()
  }, [activeTab, fetchAllExperiences])

  const handleExpApprove = async (exp) => {
    await api.post(`/experiences/${exp.id}/approve`)
    setAllExperiences((prev) => prev.map((e) => e.id === exp.id ? { ...e, status: 'approved' } : e))
  }

  const handleExpReject = async (exp) => {
    await api.post(`/experiences/${exp.id}/reject`)
    setAllExperiences((prev) => prev.map((e) => e.id === exp.id ? { ...e, status: 'rejected' } : e))
  }

  const handleExpDelete = async (exp) => {
    await api.delete(`/experiences/${exp.id}`)
    setAllExperiences((prev) => prev.filter((e) => e.id !== exp.id))
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

    const handleStartRecording = async () => {
    try {
      setSttTesting(true)
      setSttError('')
      setSttResult('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      sttChunksRef.current = []
      
      mr.ondataavailable = e => { if (e.data.size > 0) sttChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        setIsRecording(false)
        setSttTesting(true)
        stream.getTracks().forEach(t => t.stop())
        if (sttChunksRef.current.length === 0) {
          setSttTesting(false)
          setSttError("Aucun audio enregistré (fichier vide).")
          return
        }
        
        const audioBlob = new Blob(sttChunksRef.current, { type: 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', audioBlob, 'test.webm')
        formData.append('sampleRate', '48000')

        try {
          const resp = await fetch('/api/stt/transcribe', {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
            body: formData
          })
          if (!resp.ok) {
            const err = await resp.json()
            setSttError(err.error || 'Erreur STT')
            setSttTesting(false)
            return
          }
          const data = await resp.json()
          setSttResult(data.text || "Aucun texte retourné.")
        } catch (err) {
          setSttError(err.message || 'Erreur requête STT')
        } finally {
          setSttTesting(false)
        }
      }
      
      mediaRecorderRef.current = mr
      mr.start()
      setIsRecording(true)
    } catch (err) {
      setSttError('Erreur accès micro : ' + err.message)
      setSttTesting(false)
    }
  }

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }


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

  

  const handleDelete = async () => {
    if (!confirmDelete) return
    await api.delete(`/admin/users/${confirmDelete.id}`)
    setConfirmDelete(null)
    fetchUsers()
  }

  

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
            <MessageCircleReply size={16} />
            <span>{t('admin.backToChat')}</span>
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
            id="admin-tab-stt"
            aria-selected={activeTab === TAB_STT}
            aria-controls="admin-panel-stt"
            className={`admin-tab ${activeTab === TAB_STT ? 'admin-tab--active' : ''}`}
            onClick={() => setActiveTab(TAB_STT)}
          >
            <Mic size={17} strokeWidth={2} aria-hidden />
            Test STT
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
          <button
            type="button"
            role="tab"
            id="admin-tab-experiences"
            aria-selected={activeTab === TAB_EXPERIENCES}
            aria-controls="admin-panel-experiences"
            className={`admin-tab ${activeTab === TAB_EXPERIENCES ? 'admin-tab--active' : ''}`}
            onClick={() => setActiveTab(TAB_EXPERIENCES)}
          >
            <BookOpen size={17} strokeWidth={2} aria-hidden />
            Expériences
            {allExperiences.filter(e => e.status === 'pending').length > 0 && (
              <span style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '0 6px', marginLeft: 4 }}>
                {allExperiences.filter(e => e.status === 'pending').length}
              </span>
            )}
          </button>
        </div>

        {activeTab === TAB_STT && (
        <section
          id="admin-panel-stt"
          role="tabpanel"
          aria-labelledby="admin-tab-stt"
          className="admin-stt-panel admin-ollama-panel"
        >
          <div className="admin-ollama-head">
            <div className="admin-ollama-icon" aria-hidden>
              <Mic size={24} />
            </div>
            <div className="admin-ollama-head-texts">
              <h2>Test Speech-To-Text (Microphone)</h2>
              <p>Cliquez sur "Enregistrer" pour tester la reconnaissance vocale de votre navigateur vers l'API STT.</p>
            </div>
          </div>
          
          <div className="admin-ollama-card">
             <div className="admin-field-group">
                <button 
                  type="button" 
                  className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`} 
                  onClick={isRecording ? handleStopRecording : handleStartRecording}
                >
                  {isRecording ? <Square size={16} /> : <Mic size={16} />}
                  {isRecording ? " Arrêter" : " Enregistrer"}
                </button>
             </div>
             
             {sttTesting && (
               <div className="admin-field-group">
                 <Loader2 className="animate-spin" size={24} /> <i>Traitement de l'audio en cours...</i>
               </div>
             )}
             
             {sttError && (
               <div className="admin-field-group stt-error" style={{ color: 'red' }}>
                 <strong>Erreur:</strong> {sttError}
               </div>
             )}
             
             {sttResult && (
               <div className="admin-field-group" style={{ marginTop: '20px' }}>
                 <p><strong>Résultat transcrit :</strong></p>
                 <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '4px', border: '1px solid #ddd', color: '#111' }}>
                    {sttResult}
                 </div>
               </div>
             )}
          </div>
        </section>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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
                  style={{ width: '100%', accentColor: 'var(--color-primary)', display: 'block' }}
                />
              </div>
              <div className="admin-ollama-field">
                <label className="admin-ollama-label" htmlFor="tts-search">
                  Rechercher une voix ({ttsVoices.length})
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="tts-search"
                    className="admin-ollama-select"
                    type="text"
                    value={ttsSearch}
                    onChange={(e) => setTtsSearch(e.target.value)}
                    placeholder="Ex: Ana, Damien..."
                    style={{ paddingRight: 30 }}
                  />
                  {ttsSearch && (
                    <X 
                      size={14} 
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.5 }} 
                      onClick={() => setTtsSearch('')}
                    />
                  )}
                </div>
              </div>
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
            <div className="admin-tts-voices" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {ttsVoices
                .filter(voice => {
                  const recommended = ["Ana Florence", "Damien Black", "Henriette Usha", "Craig Gutsy", "Alison Dietlinde", "Nova Hogarth"];
                  if (!recommended.includes(voice.name)) return false;
                  if (!ttsSearch.trim()) return true;
                  return voice.name.toLowerCase().includes(ttsSearch.toLowerCase());
                })
                .map((voice) => {
                const isDefault = voice.id === ttsDefaultVoice
                const isTesting = ttsTestingVoice === voice.id
                return (
                  <div
                    key={voice.id}
                    className={`admin-tts-voice-card ${isDefault ? 'admin-tts-voice-card--active' : ''}`}
                    style={{ margin: 0 }}
                  >
                    <div className="admin-tts-voice-info">
                      <span className="admin-tts-voice-name">{voice.name}</span>
                      <span className="admin-tts-voice-label">{voice.label}</span>
                    </div>
                    <div className="admin-tts-voice-actions">
                      {isDefault && (
                        <span className="admin-badge" style={{ fontSize: 10 }}>Défaut</span>
                      )}
                      {!isDefault && (
                        <button
                          type="button"
                          className="admin-btn-ghost"
                          onClick={() => setDefaultTtsVoice(voice.id)}
                          style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                        >
                          Définir
                        </button>
                      )}
                      {isTesting ? (
                        <button
                          type="button"
                          className="admin-btn-ghost"
                          onClick={stopTtsPlayback}
                          style={{ color: 'var(--color-danger)', padding: '2px 6px' }}
                        >
                          <Square size={12} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-btn-primary"
                          onClick={() => testTtsVoice(voice.id)}
                          disabled={ttsTestingVoice != null}
                          style={{ padding: '4px 8px' }}
                        >
                          <Play size={12} />
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

        {activeTab === TAB_EXPERIENCES && (
        <section id="admin-panel-experiences" role="tabpanel" aria-labelledby="admin-tab-experiences" className="admin-ollama-panel">
          <div className="admin-ollama-head">
            <div className="admin-ollama-icon"><BookOpen size={22} strokeWidth={2} /></div>
            <div>
              <h2>Base de connaissances</h2>
              <p className="admin-ollama-desc">Validez ou refusez les expériences soumises par les commerciaux. Les expériences approuvées sont indexées dans Qdrant et utilisées par l'IA pour contrôler la qualité des devis.</p>
            </div>
          </div>
          {expLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} className="spin" /></div>
          ) : allExperiences.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 40 }}>Aucune expérience soumise.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              {['pending', 'approved', 'rejected'].map((statusGroup) => {
                const group = allExperiences.filter(e => e.status === statusGroup)
                if (!group.length) return null
                const meta = { pending: { label: 'En attente', color: '#f59e0b' }, approved: { label: 'Approuvées', color: '#22c55e' }, rejected: { label: 'Refusées', color: '#ef4444' } }
                return (
                  <div key={statusGroup}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: meta[statusGroup].color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      {meta[statusGroup].label} ({group.length})
                    </div>
                    {group.map((exp) => (
                      <div key={exp.id} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{exp.title}</div>
                            {exp.category && <span style={{ fontSize: 11, background: 'var(--color-border)', padding: '1px 8px', borderRadius: 99, marginBottom: 6, display: 'inline-block' }}>{exp.category}</span>}
                            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0, whiteSpace: 'pre-wrap' }}>
                              {exp.content.length > 250 ? exp.content.slice(0, 250) + '…' : exp.content}
                            </p>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>Par <strong>{exp.author_name || '?'}</strong> · {new Date(exp.created_at).toLocaleDateString('fr-FR')}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            {exp.status !== 'approved' && (
                              <button className="btn btn--primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleExpApprove(exp)} title="Approuver">
                                <CheckCircle2 size={13} strokeWidth={2.5} style={{ marginRight: 4 }} />Approuver
                              </button>
                            )}
                            {exp.status !== 'rejected' && (
                              <button className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: 12, color: '#ef4444', borderColor: '#ef4444' }} onClick={() => handleExpReject(exp)} title="Refuser">
                                <XCircle size={13} strokeWidth={2.5} style={{ marginRight: 4 }} />Refuser
                              </button>
                            )}
                            <button className="chat-msg-toolbar-btn chat-msg-toolbar-btn--danger" onClick={() => handleExpDelete(exp)} title="Supprimer">
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
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
