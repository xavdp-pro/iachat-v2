import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Plus, Pencil, Trash2, ShieldCheck, User, Loader2, Moon, Sun, MessageSquare, LogOut, Mic, Bot, RefreshCw, X,
  Headphones, Play, Square, Volume2, Menu, Undo2, CornerUpLeft, MessageCircleReply, BookOpen, CheckCircle2, XCircle, Clock,
  Building2, Database, FileSpreadsheet, LayoutGrid, Shield, Truck, AlertTriangle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/useAuthStore.js'
import { useThemeStore } from '../store/useThemeStore.js'
import api from '../api/index.js'

const TAB_USERS = 'users'
const TAB_STT = 'stt'
const TAB_TTS = 'tts'
const TAB_EXPERIENCES = 'experiences'
const TAB_MODULES = 'modules'
const TAB_MAINTENANCE = 'maintenance'
const VALID_TABS = new Set([TAB_USERS, TAB_STT, TAB_TTS, TAB_EXPERIENCES, TAB_MODULES, TAB_MAINTENANCE])

const ADMIN_MODULE_LINKS = [
  { label: 'Connaissance IA', description: 'Documentation et base consultable par Zerux IA.', to: '/knowledge', icon: Database },
  { label: 'Expériences', description: 'Expériences terrain et validations commerciales.', to: '/experiences', icon: BookOpen },
  { label: 'Devis NEXUS', description: 'Workflow complet de devis versionné.', to: '/devis', icon: FileSpreadsheet },
  { label: 'Grid devis', description: 'Chiffrage rapide en grille.', to: '/devis/grid', icon: LayoutGrid },
  { label: 'Tarifs transport', description: 'Gestion et vérification des frais de port.', to: '/devis/transport', icon: Truck },
  { label: 'Prospects', description: 'Recherche client et affaires HubSpot.', to: '/prospects', icon: Building2 },
  { label: 'Règles', description: 'Règles opérationnelles R001, R002, etc.', to: '/rules', icon: Shield },
]

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
  const [hubspotUsers, setHubspotUsers] = useState([])
  const [hubspotUsersLoading, setHubspotUsersLoading] = useState(false)
  const [hubspotUsersError, setHubspotUsersError] = useState('')
  const [maintenanceLoading, setMaintenanceLoading] = useState(false)
  const [maintenanceSaving, setMaintenanceSaving] = useState(false)
  const [maintenanceFeedback, setMaintenanceFeedback] = useState('')
  const [maintenanceError, setMaintenanceError] = useState('')
  const [maintenanceCfg, setMaintenanceCfg] = useState(null)
  const [maintenanceForm, setMaintenanceForm] = useState({ enabled: false, message: '', bypassIps: '' })

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

  const loadMaintenanceSettings = useCallback(async () => {
    setMaintenanceLoading(true)
    setMaintenanceError('')
    setMaintenanceFeedback('')
    try {
      const data = await api.get('/admin/maintenance-settings')
      setMaintenanceCfg(data)
      setMaintenanceForm({
        enabled: Boolean(data.enabled),
        message: data.message || '',
        bypassIps: data.bypassIps || '',
      })
    } catch (err) {
      setMaintenanceError(err?.error || err?.message || 'Impossible de charger le mode maintenance')
    } finally {
      setMaintenanceLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === TAB_MAINTENANCE) loadMaintenanceSettings()
  }, [activeTab, loadMaintenanceSettings])

  const addCurrentIpToMaintenanceBypass = () => {
    const ip = String(maintenanceCfg?.clientIp || '').trim()
    if (!ip) return
    setMaintenanceForm((form) => {
      const items = String(form.bypassIps || '').split(/[\s,;]+/u).map(item => item.trim()).filter(Boolean)
      if (!items.includes(ip)) items.push(ip)
      return { ...form, bypassIps: items.join('\n') }
    })
  }

  const saveMaintenanceSettings = async (event) => {
    event.preventDefault()
    setMaintenanceSaving(true)
    setMaintenanceError('')
    setMaintenanceFeedback('')
    try {
      const data = await api.put('/admin/maintenance-settings', maintenanceForm)
      setMaintenanceCfg(data)
      setMaintenanceForm({
        enabled: Boolean(data.enabled),
        message: data.message || '',
        bypassIps: data.bypassIps || '',
      })
      setMaintenanceFeedback(data.enabled ? 'Mode maintenance activé pour les IP non autorisées.' : 'Mode maintenance désactivé.')
    } catch (err) {
      setMaintenanceError(err?.error || err?.message || 'Impossible de sauvegarder le mode maintenance')
    } finally {
      setMaintenanceSaving(false)
    }
  }

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

  const fetchHubspotUsers = async () => {
    setHubspotUsersLoading(true)
    setHubspotUsersError('')
    try {
      const data = await api.get('/prospects/owners?limit=100')
      setHubspotUsers(Array.isArray(data?.results) ? data.results : [])
    } catch (err) {
      setHubspotUsersError(err?.error || err?.message || 'Impossible de charger les utilisateurs HubSpot')
      setHubspotUsers([])
    } finally {
      setHubspotUsersLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  useEffect(() => {
    if (modalUser !== undefined && !hubspotUsers.length && !hubspotUsersLoading && !hubspotUsersError) {
      fetchHubspotUsers()
    }
  }, [modalUser, hubspotUsers.length, hubspotUsersLoading, hubspotUsersError])

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

  const maintenanceBypassList = String(maintenanceForm.bypassIps || '')
    .split(/[\s,;]+/u)
    .map(item => item.trim())
    .filter(Boolean)

  

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
          <button
            type="button"
            role="tab"
            id="admin-tab-modules"
            aria-selected={activeTab === TAB_MODULES}
            aria-controls="admin-panel-modules"
            className={`admin-tab ${activeTab === TAB_MODULES ? 'admin-tab--active' : ''}`}
            onClick={() => setActiveTab(TAB_MODULES)}
          >
            <LayoutGrid size={17} strokeWidth={2} aria-hidden />
            Modules
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-maintenance"
            aria-selected={activeTab === TAB_MAINTENANCE}
            aria-controls="admin-panel-maintenance"
            className={`admin-tab ${activeTab === TAB_MAINTENANCE ? 'admin-tab--active' : ''}`}
            onClick={() => setActiveTab(TAB_MAINTENANCE)}
          >
            <AlertTriangle size={17} strokeWidth={2} aria-hidden />
            Maintenance
          </button>
        </div>

        {activeTab === TAB_MAINTENANCE && (
          <section id="admin-panel-maintenance" role="tabpanel" aria-labelledby="admin-tab-maintenance" className="admin-ollama-panel">
            <div className="admin-ollama-head">
              <div className="admin-ollama-icon"><AlertTriangle size={22} strokeWidth={2} /></div>
              <div>
                <h2>Mode maintenance</h2>
                <p className="admin-ollama-desc">Bloque l'application pour les visiteurs, sauf les IP de bypass autorisées.</p>
              </div>
              <button type="button" className="admin-btn-ghost" onClick={loadMaintenanceSettings} disabled={maintenanceLoading || maintenanceSaving} style={{ marginLeft: 'auto' }}>
                <RefreshCw size={15} className={maintenanceLoading ? 'animate-spin' : ''} /> Recharger
              </button>
            </div>

            <form onSubmit={saveMaintenanceSettings} style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
              <div style={{ display: 'grid', gap: 8, padding: 14, borderRadius: 8, border: '1px solid var(--color-border)', background: maintenanceForm.enabled ? 'rgba(245,158,11,0.10)' : 'var(--color-input-bg)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, color: 'var(--color-text)' }}>
                  <input
                    type="checkbox"
                    checked={maintenanceForm.enabled}
                    onChange={(event) => setMaintenanceForm((form) => ({ ...form, enabled: event.target.checked }))}
                    style={{ width: 18, height: 18 }}
                  />
                  Activer le mode maintenance
                </label>
                <div style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.45 }}>
                  Quand il est actif, les requêtes API retournent une page de maintenance. Les IP listées ci-dessous continuent à utiliser l'app et l'admin.
                </div>
              </div>

              <div className="chat-modal-field">
                <label className="chat-modal-label" htmlFor="maintenance-message">Message affiché</label>
                <textarea
                  id="maintenance-message"
                  className="chat-modal-input"
                  rows={3}
                  value={maintenanceForm.message}
                  onChange={(event) => setMaintenanceForm((form) => ({ ...form, message: event.target.value }))}
                  placeholder="Maintenance en cours. Le service revient rapidement."
                  style={{ resize: 'vertical', minHeight: 84 }}
                />
              </div>

              <div className="chat-modal-field">
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'stretch', marginBottom: 12 }}>
                  <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--color-text-3)', textTransform: 'uppercase', marginBottom: 5 }}>IP actuelle détectée</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <code style={{ fontSize: 15, color: 'var(--color-text)', fontWeight: 900, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 8px' }}>
                        {maintenanceCfg?.clientIp || 'chargement…'}
                      </code>
                    </div>
                    <div style={{ marginTop: 7, fontSize: 11, color: 'var(--color-text-3)' }}>
                      Source : {maintenanceCfg?.ipSource || 'inconnue'}{maintenanceCfg?.ipRaw ? ` · ${maintenanceCfg.ipRaw}` : ''}
                    </div>
                    {Array.isArray(maintenanceCfg?.ipChain) && maintenanceCfg.ipChain.length > 0 && (
                      <div style={{ marginTop: 10, display: 'grid', gap: 5 }}>
                        <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>Chaîne proxy</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {maintenanceCfg.ipChain.map((ip, index) => (
                            <span key={`${ip}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 7px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: index === 0 ? 'var(--color-primary)' : 'var(--color-text-2)', fontSize: 11, fontWeight: 800 }}>
                              {index === 0 ? 'client' : `proxy ${index}`} · {ip}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button type="button" className="admin-btn-primary" onClick={addCurrentIpToMaintenanceBypass} disabled={!maintenanceCfg?.clientIp || maintenanceSaving} style={{ alignSelf: 'stretch', justifyContent: 'center', minWidth: 178 }}>
                    <Plus size={15} /> Autoriser cette IP
                  </button>
                </div>

                <label className="chat-modal-label" htmlFor="maintenance-bypass-ips">IP autorisées</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 36, padding: 10, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', marginBottom: 8 }}>
                  {maintenanceBypassList.length ? maintenanceBypassList.map((ip) => (
                    <span key={ip} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 12, fontWeight: 800 }}>
                      <ShieldCheck size={12} /> {ip}
                    </span>
                  )) : (
                    <span style={{ color: 'var(--color-text-3)', fontSize: 12 }}>Aucune IP autorisée pour le moment.</span>
                  )}
                </div>
                <textarea
                  id="maintenance-bypass-ips"
                  className="chat-modal-input"
                  rows={6}
                  value={maintenanceForm.bypassIps}
                  onChange={(event) => setMaintenanceForm((form) => ({ ...form, bypassIps: event.target.value }))}
                  placeholder="Une IP par ligne, ex. 82.65.12.34"
                  style={{ resize: 'vertical', minHeight: 132, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                />
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-3)' }}>
                  Une IP ou plage CIDR par ligne. Sauvegarde obligatoire après ajout.
                </p>
              </div>

              {maintenanceError && <p className="admin-ollama-warn" role="alert">{maintenanceError}</p>}
              {maintenanceFeedback && <p style={{ margin: 0, color: 'var(--color-primary)', fontSize: 12, fontWeight: 800 }}>{maintenanceFeedback}</p>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={loadMaintenanceSettings} disabled={maintenanceLoading || maintenanceSaving}>Annuler</button>
                <button type="submit" className="admin-btn-primary" disabled={maintenanceLoading || maintenanceSaving}>
                  {maintenanceSaving ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Sauvegarder
                </button>
              </div>
            </form>
          </section>
        )}

        {activeTab === TAB_MODULES && (
          <section id="admin-panel-modules" role="tabpanel" aria-labelledby="admin-tab-modules" className="admin-ollama-panel">
            <div className="admin-ollama-head">
              <div className="admin-ollama-icon"><LayoutGrid size={22} strokeWidth={2} /></div>
              <div>
                <h2>Modules internes</h2>
                <p className="admin-ollama-desc">Les accès techniques qui étaient dans la barre latérale sont regroupés ici en onglets d'administration.</p>
              </div>
            </div>
            <div className="admin-module-grid">
              {ADMIN_MODULE_LINKS.map((item) => {
                const Icon = item.icon
                return (
                  <button key={item.to} type="button" className="admin-module-card" onClick={() => navigate(item.to)}>
                    <Icon size={18} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {activeTab === TAB_USERS && (
          <section id="admin-panel-users" role="tabpanel" aria-labelledby="admin-tab-users" className="admin-ollama-panel">
            <div className="admin-ollama-head">
              <div className="admin-ollama-icon"><User size={22} strokeWidth={2} /></div>
              <div>
                <h2>Gestion des utilisateurs</h2>
                <p className="admin-ollama-desc">Ajoutez, modifiez, désactivez ou supprimez les comptes, et associez-les aux utilisateurs HubSpot.</p>
              </div>
              <button type="button" className="admin-btn-primary" onClick={() => setModalUser(null)} style={{ marginLeft: 'auto' }}>
                <Plus size={15} /> Ajouter
              </button>
            </div>

            {hubspotUsersError && (
              <p className="admin-ollama-warn" role="alert">HubSpot : {hubspotUsersError}</p>
            )}

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>E-mail</th>
                    <th>Rôle</th>
                    <th>Statut</th>
                    <th>HubSpot</th>
                    <th>Créé le</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7}><Loader2 size={16} className="animate-spin" /> Chargement…</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan={7}>Aucun utilisateur.</td></tr>
                  ) : users.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name || '—'}</td>
                      <td>{item.email}</td>
                      <td><span className="admin-badge">{item.role === 'admin' ? 'Admin' : 'Utilisateur'}</span></td>
                      <td>{item.active ? <span className="admin-badge">Actif</span> : <span className="admin-badge admin-badge--muted">Inactif</span>}</td>
                      <td>{item.hubspot_user_id ? `${item.hubspot_user_name || item.hubspot_user_email || item.hubspot_user_id}` : <span style={{ color: 'var(--color-text-3)' }}>Non associé</span>}</td>
                      <td>{item.created_at ? new Date(item.created_at).toLocaleDateString('fr-FR') : '—'}</td>
                      <td>
                        <div className="admin-table-actions">
                          <button type="button" className="admin-table-icon-btn" onClick={() => setModalUser(item)} title="Modifier"><Pencil size={14} /></button>
                          <button type="button" className="admin-table-icon-btn admin-table-icon-btn--danger" onClick={() => setConfirmDelete(item)} title="Supprimer"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

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
            hubspotUsers={hubspotUsers}
            hubspotUsersLoading={hubspotUsersLoading}
            onRefreshHubspotUsers={fetchHubspotUsers}
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

function hubspotUserLabel(hubspotUser) {
  const props = hubspotUser?.properties || {}
  const fullName = [hubspotUser?.firstName || props.hs_given_name, hubspotUser?.lastName || props.hs_family_name].filter(Boolean).join(' ').trim()
  const email = hubspotUser?.email || props.hs_email || ''
  return fullName && email ? `${fullName} · ${email}` : fullName || email || hubspotUser?.id || 'Utilisateur HubSpot'
}

function UserModal({ user, hubspotUsers = [], hubspotUsersLoading = false, onRefreshHubspotUsers, onSave, onClose }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    email: user?.email || '',
    name: user?.name || '',
    role: user?.role || 'user',
    password: '',
    active: user?.active !== undefined ? user.active : true,
    hubspot_user_id: user?.hubspot_user_id || '',
    hubspot_user_email: user?.hubspot_user_email || '',
    hubspot_user_name: user?.hubspot_user_name || '',
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

  const handleHubspotSelect = (hubspotId) => {
    if (!hubspotId) {
      setForm((f) => ({ ...f, hubspot_user_id: '', hubspot_user_email: '', hubspot_user_name: '' }))
      return
    }
    const selected = hubspotUsers.find((item) => String(item.id) === String(hubspotId))
    const props = selected?.properties || {}
    const fullName = [selected?.firstName || props.hs_given_name, selected?.lastName || props.hs_family_name].filter(Boolean).join(' ').trim()
    setForm((f) => ({
      ...f,
      hubspot_user_id: selected?.id || hubspotId,
      hubspot_user_email: selected?.email || props.hs_email || '',
      hubspot_user_name: fullName,
      name: f.name || fullName,
    }))
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
          <div className="chat-modal-field">
            <label className="chat-modal-label" htmlFor="adm-hubspot-user">Utilisateur HubSpot associé</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                id="adm-hubspot-user"
                className="chat-modal-select"
                value={form.hubspot_user_id || ''}
                onChange={(e) => handleHubspotSelect(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Aucun utilisateur HubSpot</option>
                {hubspotUsers.map((hubspotUser) => (
                  <option key={hubspotUser.id} value={hubspotUser.id}>{hubspotUserLabel(hubspotUser)}</option>
                ))}
              </select>
              <button
                type="button"
                className="chat-modal-btn chat-modal-btn--secondary"
                onClick={onRefreshHubspotUsers}
                disabled={hubspotUsersLoading}
                title="Recharger les utilisateurs HubSpot"
                style={{ flexShrink: 0 }}
              >
                {hubspotUsersLoading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
              </button>
            </div>
            {form.hubspot_user_id && (
              <p style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-3)' }}>
                ID HubSpot {form.hubspot_user_id}{form.hubspot_user_email ? ` · ${form.hubspot_user_email}` : ''}
              </p>
            )}
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
