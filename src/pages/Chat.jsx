import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Moon, Sun, LogOut, FolderOpen,
  Plus, User, Trash2, Edit2,
  Send, Bot, Sparkles, Settings,
  MoreVertical, Archive, ArchiveRestore,
  Menu, X, Paperclip, Mic, MicOff, FileText, ZoomIn,
  Volume2, VolumeX, Copy, Check,
  Users, UserPlus,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore.js'
import { useThemeStore } from '../store/useThemeStore.js'
import { useProjectStore } from '../store/useProjectStore.js'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { MarkdownRenderer } from '../components/MarkdownRenderer.jsx'

export default function Chat() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { darkMode, toggleDarkMode } = useThemeStore()
  const {
    projects, activeProject, fetchProjects, setActiveProject,
    discussions, activeDiscussion, setActiveDiscussion,
    createProject, createDiscussion, updateDiscussion, deleteDiscussion,
    updateProject, deleteProject,
    messages, sendMessage, updateMessage, deleteMessage, loading,
    streaming, streamingContent,
    ollamaError, clearOllamaError,
    projectMembers, fetchProjectMembers, addProjectMember, removeProjectMember,
  } = useProjectStore()

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false)
  const [projectBeingEdited, setProjectBeingEdited] = useState(null)
  const [projectMenuId, setProjectMenuId] = useState(null)
  const [discussionMenuId, setDiscussionMenuId] = useState(null)
  const [discussionRenameTarget, setDiscussionRenameTarget] = useState(null)
  const [discussionRenameInput, setDiscussionRenameInput] = useState('')
  const [confirmDeleteDiscussion, setConfirmDeleteDiscussion] = useState(null)
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDesc, setNewProjectDesc] = useState('')
  const [inputMessage, setInputMessage] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('tts_enabled') !== 'false')
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingMessageContent, setEditingMessageContent] = useState('')
  const [confirmDeleteMessage, setConfirmDeleteMessage] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [layoutDesktop, setLayoutDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  )
  const [membersProjectTarget, setMembersProjectTarget] = useState(null)
  const [memberInviteEmail, setMemberInviteEmail] = useState('')
  const [memberInviteError, setMemberInviteError] = useState('')
  const [memberInviteLoading, setMemberInviteLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const speechRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const ttsAudioRef = useRef(null)
  const prevStreamingRef = useRef(false)

  const closeMobileSidebar = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setSidebarOpen(false)
    }
  }

  const selectProject = (p) => {
    setActiveProject(p)
    closeMobileSidebar()
  }

  const selectDiscussion = (d) => {
    setActiveDiscussion(d)
    closeMobileSidebar()
  }

  useEffect(() => { fetchProjects() }, [])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => {
      setLayoutDesktop(mq.matches)
      if (mq.matches) setSidebarOpen(false)
    }
    mq.addEventListener('change', onChange)
    onChange()
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [sidebarOpen])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => {
    if (streaming) messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [streamingContent, streaming])

  // Lecture TTS automatique quand le streaming se termine
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current
    prevStreamingRef.current = streaming
    if (!wasStreaming || streaming) return
    if (!ttsEnabled) return
    const lastMsg = [...messages].reverse().find((m) => m.role === 'assistant')
    if (lastMsg?.content) synthesizeAndPlay(lastMsg.content)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming])

  useEffect(() => {
    if (projectMenuId == null && discussionMenuId == null) return
    const onDoc = (e) => {
      if (projectMenuId != null && !e.target.closest?.('.chat-project-menu-wrap')) {
        setProjectMenuId(null)
      }
      if (discussionMenuId != null && !e.target.closest?.('.chat-discussion-menu-wrap')) {
        setDiscussionMenuId(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [projectMenuId, discussionMenuId])

  // Close any open modal on Escape key
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (membersProjectTarget) { closeMembersModal(); return }
      if (isProjectModalOpen) { closeProjectModal(); return }
      if (confirmDeleteProject) { setConfirmDeleteProject(null); return }
      if (discussionRenameTarget) { closeRenameDiscussionModal(); return }
      if (confirmDeleteDiscussion) { setConfirmDeleteDiscussion(null); return }
      if (confirmDeleteMessage) { setConfirmDeleteMessage(null); return }
      if (editingMessageId) { cancelEditMessage(); return }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isProjectModalOpen, confirmDeleteProject, discussionRenameTarget, confirmDeleteDiscussion, confirmDeleteMessage, editingMessageId, membersProjectTarget])

  const isProjectArchived = (p) => Number(p?.archived) === 1
  const activeProjects = projects.filter((p) => !isProjectArchived(p))
  const archivedProjects = projects.filter((p) => isProjectArchived(p))

  const closeProjectModal = () => {
    setIsProjectModalOpen(false)
    setProjectBeingEdited(null)
    setNewProjectName('')
    setNewProjectDesc('')
  }

  const openCreateProjectModal = () => {
    setProjectBeingEdited(null)
    setNewProjectName('')
    setNewProjectDesc('')
    setIsProjectModalOpen(true)
  }

  const openEditProjectModal = (p) => {
    setProjectBeingEdited(p)
    setNewProjectName(p.name || '')
    setNewProjectDesc(p.description || '')
    setProjectMenuId(null)
    setIsProjectModalOpen(true)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleSaveProject = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) return
    try {
      if (projectBeingEdited) {
        await updateProject(projectBeingEdited.id, {
          name: newProjectName.trim(),
          description: newProjectDesc,
        })
      } else {
        await createProject(newProjectName.trim(), newProjectDesc)
      }
      closeProjectModal()
    } catch {
      /* api interceptor */
    }
  }

  const handleArchiveToggle = async (p) => {
    setProjectMenuId(null)
    await updateProject(p.id, { archived: !isProjectArchived(p) })
  }

  const handleConfirmDeleteProject = async () => {
    if (!confirmDeleteProject) return
    await deleteProject(confirmDeleteProject.id)
    setConfirmDeleteProject(null)
  }

  const openMembersModal = async (p) => {
    setProjectMenuId(null)
    setMembersProjectTarget(p)
    setMemberInviteEmail('')
    setMemberInviteError('')
    try { await fetchProjectMembers(p.id) } catch { /* handled */ }
  }

  const closeMembersModal = () => {
    setMembersProjectTarget(null)
    setMemberInviteEmail('')
    setMemberInviteError('')
  }

  const handleInviteMember = async (e) => {
    e.preventDefault()
    if (!memberInviteEmail.trim() || memberInviteLoading) return
    setMemberInviteLoading(true)
    setMemberInviteError('')
    try {
      await addProjectMember(membersProjectTarget.id, memberInviteEmail.trim())
      setMemberInviteEmail('')
    } catch (err) {
      const msg = err?.error || ''
      if (msg.includes('Already')) setMemberInviteError(t('chat.memberAlreadyMember'))
      else if (msg.includes('not found')) setMemberInviteError(t('chat.memberNotFound'))
      else setMemberInviteError(msg || t('admin.error'))
    } finally {
      setMemberInviteLoading(false)
    }
  }

  const handleRemoveMember = async (memberId) => {
    try { await removeProjectMember(membersProjectTarget.id, memberId) } catch { /* api */ }
  }

  const openRenameDiscussionModal = (d) => {
    setDiscussionMenuId(null)
    setDiscussionRenameTarget(d)
    setDiscussionRenameInput(d.title || '')
  }

  const closeRenameDiscussionModal = () => {
    setDiscussionRenameTarget(null)
    setDiscussionRenameInput('')
  }

  const handleSaveDiscussionRename = async (e) => {
    e.preventDefault()
    if (!discussionRenameTarget || !discussionRenameInput.trim()) return
    try {
      await updateDiscussion(discussionRenameTarget.id, discussionRenameInput)
      closeRenameDiscussionModal()
    } catch {
      /* api */
    }
  }

  const handleConfirmDeleteDiscussion = async () => {
    if (!confirmDeleteDiscussion) return
    try {
      await deleteDiscussion(confirmDeleteDiscussion.id)
      setConfirmDeleteDiscussion(null)
    } catch {
      setConfirmDeleteDiscussion(null)
    }
  }

  // ── Message edit / delete ──────────────────────────────────────────────────

  const startEditMessage = (m) => {
    setEditingMessageId(m.id)
    setEditingMessageContent(m.content)
  }

  const cancelEditMessage = () => {
    setEditingMessageId(null)
    setEditingMessageContent('')
  }

  const saveEditMessage = async (id) => {
    if (!editingMessageContent.trim()) return
    try {
      await updateMessage(id, editingMessageContent)
      cancelEditMessage()
    } catch { /* api error */ }
  }

  const handleConfirmDeleteMessage = async () => {
    if (!confirmDeleteMessage) return
    try {
      await deleteMessage(confirmDeleteMessage.id)
    } finally {
      setConfirmDeleteMessage(null)
    }
  }

  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }

  // ── File attachment helpers ────────────────────────────────────────────────

  const MAX_ATTACH_BYTES = 5 * 1024 * 1024 // 5 MB

  const readFileAsDataURL = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const addFilesAsAttachments = useCallback(async (files) => {
    const toAdd = []
    for (const file of files) {
      if (file.size > MAX_ATTACH_BYTES) {
        alert(`${file.name} : fichier trop volumineux (max 5 Mo)`)
        continue
      }
      const data = await readFileAsDataURL(file)
      const isImage = file.type.startsWith('image/')
      toAdd.push({
        attach_type: isImage ? 'image' : 'document',
        name: file.name,
        mime_type: file.type,
        size: file.size,
        data,
      })
    }
    if (toAdd.length) setPendingAttachments((prev) => [...prev, ...toAdd])
  }, [])

  const removeAttachment = (idx) =>
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))

  const onFileInputChange = (e) => {
    if (e.target.files?.length) addFilesAsAttachments(Array.from(e.target.files))
    e.target.value = ''
  }

  // Intercept paste on the whole composer area to capture pasted images
  const onComposerPaste = useCallback((e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageItems = Array.from(items).filter((it) => it.type.startsWith('image/'))
    if (!imageItems.length) return
    e.preventDefault()
    addFilesAsAttachments(imageItems.map((it) => it.getAsFile()))
  }, [addFilesAsAttachments])

  // ── Microphone / STT (faster-whisper) ─────────────────────────────────────

  const toggleMic = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      return
    }

    // Arrêter la lecture TTS en cours avant d'enregistrer
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause()
      ttsAudioRef.current = null
      setTtsPlaying(false)
    }

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      alert(t('chat.ttsMicNoAccess'))
      return
    }

    audioChunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : ''
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {})

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data)
    }

    mr.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop())
      setIsRecording(false)
      const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' })
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      try {
        const token = localStorage.getItem('token') || ''
        const resp = await fetch('/api/tts/stt', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
        const data = await resp.json()
        if (data.text) {
          setInputMessage((prev) => (prev ? `${prev} ${data.text}` : data.text))
          setTimeout(autoResizeTextarea, 0)
        }
      } catch { /* ignore */ }
    }

    mr.start()
    mediaRecorderRef.current = mr
    setIsRecording(true)
  }, [isRecording, t])

  // ── TTS (Kokoro) ───────────────────────────────────────────────────────────

  const synthesizeAndPlay = useCallback(async (text) => {
    if (!text?.trim()) return
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause()
      ttsAudioRef.current = null
    }
    setTtsPlaying(true)
    try {
      const token = localStorage.getItem('token') || ''
      const voice = localStorage.getItem('tts_voice') || 'ff_siwis'
      const resp = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: text.slice(0, 3000), voice }),
      })
      if (!resp.ok) { setTtsPlaying(false); return }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      ttsAudioRef.current = audio
      const cleanup = () => {
        setTtsPlaying(false)
        URL.revokeObjectURL(url)
        ttsAudioRef.current = null
      }
      audio.onended = cleanup
      audio.onerror = cleanup
      audio.play()
    } catch {
      setTtsPlaying(false)
    }
  }, [])

  const toggleTts = useCallback(() => {
    if (ttsEnabled && ttsAudioRef.current) {
      ttsAudioRef.current.pause()
      ttsAudioRef.current = null
      setTtsPlaying(false)
    }
    setTtsEnabled((prev) => {
      const next = !prev
      localStorage.setItem('tts_enabled', String(next))
      return next
    })
  }, [ttsEnabled])

  // ── Message submit ─────────────────────────────────────────────────────────

  const submitMessage = async () => {
    const content = inputMessage.trim()
    if (!content || loading) return

    const attachments = [...pendingAttachments]
    setPendingAttachments([])
    setInputMessage('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // No discussion: create one then send
    if (!activeDiscussion) {
      if (!activeProject) return
      await createDiscussion(t('chat.defaultDiscussionTitle'))
      await sendMessage(content, attachments)
      return
    }

    await sendMessage(content, attachments)
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    await submitMessage()
  }

  const onComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitMessage()
    }
  }

  // Composer placeholder varies by UI state
  const composerPlaceholder = (() => {
    if (!activeProject) return t('chat.landingProjectHint')
    if (!activeDiscussion) return t('chat.startFirstMessage')
    return t('chat.messagePlaceholder')
  })()

  // Can send: project required; text or at least one attachment needed
  const canSend = !!activeProject && !loading && (!!inputMessage.trim() || pendingAttachments.length > 0)

  const discussionHeaderActions =
    activeDiscussion && user?.id != null && Number(user.id) === Number(activeDiscussion.created_by) ? (
      <>
        <button
          type="button"
          className="chat-top-navbar-icon-btn"
          aria-label={t('common.edit')}
          onClick={() => openRenameDiscussionModal(activeDiscussion)}
        >
          <Edit2 size={17} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="chat-top-navbar-icon-btn chat-top-navbar-icon-btn--danger"
          aria-label={t('common.delete')}
          onClick={() => setConfirmDeleteDiscussion(activeDiscussion)}
        >
          <Trash2 size={17} strokeWidth={2} />
        </button>
      </>
    ) : null

  return (
    <div className="chat-shell">
      <div
        className={`chat-sidebar-backdrop ${sidebarOpen ? 'chat-sidebar-backdrop--visible' : ''}`}
        aria-hidden={!sidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ── Sidebar: drawer on mobile/tablet, column on desktop ── */}
      <aside
        className={`chat-sidebar ${sidebarOpen ? 'chat-sidebar--open' : ''}`}
        aria-hidden={!layoutDesktop && !sidebarOpen}
      >
        <div className="chat-sidebar-header">
          <button
            type="button"
            className="chat-sidebar-mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label={t('chat.closeMenu')}
          >
            <X size={18} strokeWidth={2} />
          </button>
          <div className="chat-sidebar-brand">
            <div className="chat-sidebar-brand-mark">
              <Sparkles size={16} strokeWidth={2} />
            </div>
            <p className="chat-sidebar-brand-text">{t('common.appName')}</p>
          </div>

        </div>

        <div className="chat-sidebar-primary">
          <button
            type="button"
            className="chat-primary-action"
            disabled={!activeProject}
            onClick={async () => {
              await createDiscussion(t('chat.defaultDiscussionTitle'))
              closeMobileSidebar()
            }}
          >
            <Plus size={17} strokeWidth={2} />
            {t('chat.newDiscussion')}
          </button>
        </div>

        <nav className="chat-sidebar-scroll custom-scrollbar">
          <h3 className="chat-sidebar-heading">{t('chat.projects')}</h3>
          <div className="chat-sidebar-list">
            {activeProjects.map((p) => {
              const isOwner = user?.id != null && Number(user.id) === Number(p.owner_id)
              return (
                <div key={p.id} className="chat-project-row">
                  <button
                    type="button"
                    className={`chat-project-chip ${activeProject?.id === p.id ? 'chat-project-chip--active' : ''}`}
                    onClick={() => selectProject(p)}
                  >
                    <FolderOpen size={15} style={{ flexShrink: 0, opacity: 0.65 }} />
                    <span className="truncate">{p.name}</span>
                  </button>
                  {isOwner && (
                    <div className="chat-project-menu-wrap">
                      <button
                        type="button"
                        className="chat-project-menu-btn"
                        aria-label={t('chat.projectActions')}
                        aria-expanded={projectMenuId === p.id}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setProjectMenuId((id) => (id === p.id ? null : p.id))
                        }}
                      >
                        <MoreVertical size={16} strokeWidth={2} />
                      </button>
                      {projectMenuId === p.id && (
                        <div className="chat-project-popover" role="menu">
                          <button type="button" role="menuitem" onClick={() => openEditProjectModal(p)}>
                            <Edit2 size={14} strokeWidth={2} />
                            {t('chat.renameProject')}
                          </button>
                          <button type="button" role="menuitem" onClick={() => openMembersModal(p)}>
                            <Users size={14} strokeWidth={2} />
                            {t('chat.manageMembers')}
                          </button>
                          <button type="button" role="menuitem" onClick={() => handleArchiveToggle(p)}>
                            <Archive size={14} strokeWidth={2} />
                            {t('chat.archiveProject')}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="chat-project-popover--danger"
                            onClick={() => {
                              setProjectMenuId(null)
                              setConfirmDeleteProject(p)
                            }}
                          >
                            <Trash2 size={14} strokeWidth={2} />
                            {t('common.delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            <button type="button" className="chat-project-chip" onClick={openCreateProjectModal}>
              <Plus size={15} style={{ flexShrink: 0, opacity: 0.65 }} />
              <span>{t('chat.newProject')}</span>
            </button>
            {archivedProjects.length > 0 && (
              <>
                <h3 className="chat-sidebar-heading chat-sidebar-heading--muted">{t('chat.archivedProjects')}</h3>
                {archivedProjects.map((p) => {
                  const isOwner = user?.id != null && Number(user.id) === Number(p.owner_id)
                  return (
                    <div key={p.id} className="chat-project-row">
                      <button
                        type="button"
                        className={`chat-project-chip ${activeProject?.id === p.id ? 'chat-project-chip--active' : ''}`}
                        onClick={() => selectProject(p)}
                      >
                        <Archive size={15} style={{ flexShrink: 0, opacity: 0.5 }} />
                        <span className="truncate">{p.name}</span>
                      </button>
                      {isOwner && (
                        <div className="chat-project-menu-wrap">
                          <button
                            type="button"
                            className="chat-project-menu-btn"
                            aria-label={t('chat.projectActions')}
                            aria-expanded={projectMenuId === p.id}
                            onClick={(ev) => {
                              ev.stopPropagation()
                              setProjectMenuId((id) => (id === p.id ? null : p.id))
                            }}
                          >
                            <MoreVertical size={16} strokeWidth={2} />
                          </button>
                          {projectMenuId === p.id && (
                            <div className="chat-project-popover" role="menu">
                              <button type="button" role="menuitem" onClick={() => openEditProjectModal(p)}>
                                <Edit2 size={14} strokeWidth={2} />
                                {t('chat.renameProject')}
                              </button>
                              <button type="button" role="menuitem" onClick={() => openMembersModal(p)}>
                                <Users size={14} strokeWidth={2} />
                                {t('chat.manageMembers')}
                              </button>
                              <button type="button" role="menuitem" onClick={() => handleArchiveToggle(p)}>
                                <ArchiveRestore size={14} strokeWidth={2} />
                                {t('chat.unarchiveProject')}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="chat-project-popover--danger"
                                onClick={() => {
                                  setProjectMenuId(null)
                                  setConfirmDeleteProject(p)
                                }}
                              >
                                <Trash2 size={14} strokeWidth={2} />
                                {t('common.delete')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {activeProject && (
            <>
              <h3 className="chat-sidebar-heading">{t('chat.discussions')}</h3>
              <div className="chat-sidebar-list">
                {discussions.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs leading-snug" style={{ color: 'var(--color-text-3)' }}>
                    {t('chat.pickDiscussion')}
                  </p>
                ) : (
                  discussions.map((d) => {
                    const isCreator = user?.id != null && Number(user.id) === Number(d.created_by)
                    return (
                      <div key={d.id} className="chat-thread-row">
                        <button
                          type="button"
                          className={`chat-thread-item ${activeDiscussion?.id === d.id ? 'chat-thread-item--active' : ''}`}
                          onClick={() => selectDiscussion(d)}
                        >
                          {d.title}
                        </button>
                        {isCreator && (
                          <div className="chat-discussion-menu-wrap chat-project-menu-wrap">
                            <button
                              type="button"
                              className="chat-project-menu-btn"
                              aria-label={t('chat.discussionActions')}
                              aria-expanded={discussionMenuId === d.id}
                              onClick={(ev) => {
                                ev.stopPropagation()
                                setDiscussionMenuId((id) => (id === d.id ? null : d.id))
                              }}
                            >
                              <MoreVertical size={16} strokeWidth={2} />
                            </button>
                            {discussionMenuId === d.id && (
                              <div className="chat-project-popover" role="menu">
                                <button type="button" role="menuitem" onClick={() => openRenameDiscussionModal(d)}>
                                  <Edit2 size={14} strokeWidth={2} />
                                  {t('chat.renameDiscussion')}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="chat-project-popover--danger"
                                  onClick={() => {
                                    setDiscussionMenuId(null)
                                    setConfirmDeleteDiscussion(d)
                                  }}
                                >
                                  <Trash2 size={14} strokeWidth={2} />
                                  {t('common.delete')}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )}
        </nav>

        <div className="chat-sidebar-footer">
          {user?.role === 'admin' && (
            <Link to="/admin" className="chat-footer-link">
              <Settings size={16} strokeWidth={2} />
              {t('chat.admin')}
            </Link>
          )}
          <div className="chat-footer-user">
            <div
              className="chat-footer-user-avatar"
              style={{
                background: user?.role === 'admin' ? 'var(--color-primary)' : 'var(--color-text-3)',
              }}
            >
              {(user?.name || user?.email || 'U')[0].toUpperCase()}
            </div>
            <div className="chat-footer-user-meta">
              <p className="chat-footer-user-name">{user?.name || user?.email}</p>
              <p className="chat-footer-user-role">{user?.role}</p>
            </div>
          </div>
          <div className="chat-footer-toolbar">
            <button
              type="button"
              className="chat-footer-icon-btn"
              onClick={toggleDarkMode}
              aria-label={darkMode ? t('login.themeLight') : t('login.themeDark')}
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              className="chat-footer-icon-btn chat-footer-icon-btn--danger"
              onClick={handleLogout}
              aria-label={t('chat.logout')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="chat-main-column">
        {ollamaError && (
          <div className="chat-ollama-error" role="alert">
            <span className="chat-ollama-error-text">{ollamaError}</span>
            <button type="button" className="chat-ollama-error-dismiss" onClick={clearOllamaError}>
              {t('chat.ollamaErrorDismiss')}
            </button>
          </div>
        )}
        <header className="chat-top-navbar">
          <button
            type="button"
            className="chat-top-navbar-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label={t('chat.openMenu')}
          >
            <Menu size={20} strokeWidth={2} />
          </button>
          <div className="chat-top-navbar-center">
            {activeDiscussion ? (
              <>
                <p className="chat-top-navbar-title">{activeDiscussion.title}</p>
                {activeProject?.name && <p className="chat-top-navbar-sub">{activeProject.name}</p>}
              </>
            ) : activeProject ? (
              <>
                <p className="chat-top-navbar-title">{activeProject.name}</p>
                <p className="chat-top-navbar-sub">{t('chat.pickDiscussion')}</p>
              </>
            ) : (
              <p className="chat-top-navbar-title">{t('common.appName')}</p>
            )}
          </div>
          <div className="chat-top-navbar-end">
            {discussionHeaderActions}
          </div>
        </header>

        {/* ── Main: conversation area ── */}
        <main className="chat-main">

          {/* ── State 1 & 2: no active discussion → landing / project-selected landing ── */}
          {!activeDiscussion && (
            <div className="chat-landing">
              <div className="chat-landing-hero">
                <div className="chat-landing-logo">
                  <Sparkles size={28} strokeWidth={1.75} />
                </div>
                <h2 className="chat-landing-title">
                  {activeProject ? t('chat.landingGreeting') : t('chat.landingGreeting')}
                </h2>
                <p className="chat-landing-sub">
                  {activeProject
                    ? t('chat.landingWithProject')
                    : t('chat.landingNoProject')}
                </p>
              </div>

              <div className="chat-landing-composer">
                <ComposerField
                  textareaRef={textareaRef}
                  fileInputRef={fileInputRef}
                  inputMessage={inputMessage}
                  setInputMessage={setInputMessage}
                  pendingAttachments={pendingAttachments}
                  removeAttachment={removeAttachment}
                  onComposerPaste={onComposerPaste}
                  onFileInputChange={onFileInputChange}
                  onComposerKeyDown={onComposerKeyDown}
                  handleSendMessage={handleSendMessage}
                  autoResizeTextarea={autoResizeTextarea}
                  canSend={canSend}
                  loading={loading}
                  disabled={!activeProject}
                  placeholder={composerPlaceholder}
                  isRecording={isRecording}
                  toggleMic={toggleMic}
                  ttsEnabled={ttsEnabled}
                  ttsPlaying={ttsPlaying}
                  toggleTts={toggleTts}
                  t={t}
                  setLightboxSrc={setLightboxSrc}
                />
              </div>
            </div>
          )}

          {/* ── States 3 & 4: active discussion ── */}
          {activeDiscussion && (
            <>
              <header className="chat-main-header chat-main-header--desktop">
                <div className="min-w-0">
                  <h1>{activeDiscussion.title}</h1>
                  <p className="chat-main-header-sub">{activeProject?.name}</p>
                </div>
                {user?.id != null && Number(user.id) === Number(activeDiscussion.created_by) && (
                  <div className="chat-header-actions">
                    <button
                      type="button"
                      className="chat-header-icon-btn"
                      aria-label={t('common.edit')}
                      onClick={() => openRenameDiscussionModal(activeDiscussion)}
                    >
                      <Edit2 size={17} />
                    </button>
                    <button
                      type="button"
                      className="chat-header-icon-btn chat-header-icon-btn--danger"
                      aria-label={t('common.delete')}
                      onClick={() => setConfirmDeleteDiscussion(activeDiscussion)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                )}
              </header>

              <div className="chat-msg-stream custom-scrollbar">
                <div className="chat-msg-col space-y-6">
                  {messages.length === 0 ? (
                    <div className="chat-empty-discussion">
                      <div className="chat-empty-discussion-icon">
                        <Bot size={22} strokeWidth={1.75} />
                      </div>
                      <p className="chat-empty-discussion-title">{t('chat.emptyDiscussionGreeting')}</p>
                      <p className="chat-empty-discussion-sub">{t('chat.emptyDiscussionSub')}</p>
                    </div>
                  ) : (
                    messages.map((m, idx) => {
                      const isOwner = m.role === 'user' && user?.id != null && Number(user.id) === Number(m.user_id)
                      const isEditing = editingMessageId === m.id
                      return (
                        <motion.div
                          key={m.id || idx}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`chat-msg-row ${m.role === 'user' ? 'chat-msg-row--user' : 'chat-msg-row--ai'}`}
                        >
                          {/* Avatar */}
                          <div
                            className="chat-msg-avatar"
                            style={
                              m.role === 'user'
                                ? { background: 'var(--color-primary)', color: '#fff' }
                                : { background: 'var(--color-avatar-ai-bg)', border: '1px solid var(--color-border)', color: 'var(--color-avatar-ai-text)' }
                            }
                          >
                            {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                          </div>

                          {/* Content + toolbar */}
                          <div className="chat-msg-body">
                            {isEditing ? (
                              <div className="chat-msg-edit">
                                <textarea
                                  className="chat-msg-edit-textarea"
                                  value={editingMessageContent}
                                  onChange={(e) => setEditingMessageContent(e.target.value)}
                                  autoFocus
                                  rows={3}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditMessage(m.id) }
                                    if (e.key === 'Escape') cancelEditMessage()
                                  }}
                                />
                                <div className="chat-msg-edit-actions">
                                  <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={cancelEditMessage}>
                                    {t('common.cancel')}
                                  </button>
                                  <button type="button" className="chat-modal-btn chat-modal-btn--primary" onClick={() => saveEditMessage(m.id)}>
                                    {t('common.save')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className={m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}>
                                {m.role === 'assistant'
                                  ? <MarkdownRenderer content={m.content} />
                                  : m.content
                                }
                                {m.attachments?.length > 0 && (
                                  <div className="chat-msg-attachments">
                                    {m.attachments.map((att, ai) =>
                                      att.attach_type === 'image' ? (
                                        <button
                                          key={ai}
                                          type="button"
                                          className="chat-msg-attachment-img-wrap"
                                          onClick={() => setLightboxSrc(att.data)}
                                          aria-label={att.name}
                                        >
                                          <img src={att.data} alt={att.name} className="chat-msg-attachment-img" />
                                          <span className="chat-msg-attachment-zoom"><ZoomIn size={14} /></span>
                                        </button>
                                      ) : (
                                        <a
                                          key={ai}
                                          href={att.data}
                                          download={att.name}
                                          className="chat-msg-attachment-file"
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <FileText size={14} />
                                          <span>{att.name}</span>
                                        </a>
                                      )
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className={`chat-msg-meta ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                              {m.role === 'user' ? t('chat.you') : m.agent_slug || t('chat.assistant')}
                              {' · '}
                              {new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {m.edited_at && <span className="chat-msg-edited"> · {t('chat.edited')}</span>}
                            </div>
                          </div>

                          {/* Action toolbar — visible on hover */}
                          {!isEditing && (isOwner || m.role === 'assistant') && (
                            <div className="chat-msg-toolbar">
                              {m.role === 'assistant' && (
                                <button
                                  type="button"
                                  className={`chat-msg-toolbar-btn ${copiedId === m.id ? 'chat-msg-toolbar-btn--success' : ''}`}
                                  aria-label={copiedId === m.id ? t('chat.copied') : t('chat.copy')}
                                  title={copiedId === m.id ? t('chat.copied') : t('chat.copy')}
                                  onClick={() => {
                                    navigator.clipboard.writeText(m.content || '')
                                    setCopiedId(m.id)
                                    setTimeout(() => setCopiedId(null), 1500)
                                  }}
                                >
                                  {copiedId === m.id ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={2} />}
                                </button>
                              )}
                              {isOwner && (
                                <>
                                  <button
                                    type="button"
                                    className="chat-msg-toolbar-btn"
                                    aria-label={t('common.edit')}
                                    onClick={() => startEditMessage(m)}
                                  >
                                    <Edit2 size={14} strokeWidth={2} />
                                  </button>
                                  <button
                                    type="button"
                                    className="chat-msg-toolbar-btn chat-msg-toolbar-btn--danger"
                                    aria-label={t('common.delete')}
                                    onClick={() => setConfirmDeleteMessage(m)}
                                  >
                                    <Trash2 size={14} strokeWidth={2} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </motion.div>
                      )
                    })
                  )}
                  {streaming && (
                    <motion.div
                      className="chat-msg-row chat-msg-row--ai"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div
                        className="chat-msg-avatar"
                        style={{ background: 'var(--color-avatar-ai-bg)', border: '1px solid var(--color-border)', color: 'var(--color-avatar-ai-text)' }}
                      >
                        <Bot size={16} />
                      </div>
                      <div className="chat-msg-body">
                        <div className="chat-bubble-ai">
                          <MarkdownRenderer content={streamingContent} streaming={true} />
                        </div>
                        <div className="chat-msg-meta text-left">
                          {t('chat.assistant')}
                        </div>
                      </div>
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="chat-composer-wrap">
                <ComposerField
                  textareaRef={textareaRef}
                  fileInputRef={fileInputRef}
                  inputMessage={inputMessage}
                  setInputMessage={setInputMessage}
                  pendingAttachments={pendingAttachments}
                  removeAttachment={removeAttachment}
                  onComposerPaste={onComposerPaste}
                  onFileInputChange={onFileInputChange}
                  onComposerKeyDown={onComposerKeyDown}
                  handleSendMessage={handleSendMessage}
                  autoResizeTextarea={autoResizeTextarea}
                  canSend={canSend}
                  loading={loading}
                  disabled={false}
                  placeholder={t('chat.messagePlaceholder')}
                  isRecording={isRecording}
                  toggleMic={toggleMic}
                  ttsEnabled={ttsEnabled}
                  ttsPlaying={ttsPlaying}
                  toggleTts={toggleTts}
                  t={t}
                  setLightboxSrc={setLightboxSrc}
                />
              </div>
            </>
          )}
        </main>
      </div>

      <AnimatePresence>
        {isProjectModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="chat-modal-backdrop"
            onClick={closeProjectModal}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="chat-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="chat-modal-header">
                <h2 className="chat-modal-title">
                  {projectBeingEdited ? t('chat.editProject') : t('chat.newProject')}
                </h2>
                <button type="button" className="chat-modal-close" onClick={closeProjectModal} aria-label={t('common.close')}>
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <form onSubmit={handleSaveProject}>
                <div className="chat-modal-field">
                  <label className="chat-modal-label" htmlFor="new-project-name">{t('chat.projectNameLabel')}</label>
                  <input
                    id="new-project-name"
                    required
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="chat-modal-input"
                  />
                </div>
                <div className="chat-modal-field">
                  <label className="chat-modal-label" htmlFor="new-project-desc">{t('chat.projectDescLabel')}</label>
                  <textarea
                    id="new-project-desc"
                    value={newProjectDesc}
                    onChange={(e) => setNewProjectDesc(e.target.value)}
                    className="chat-modal-textarea"
                    rows={3}
                  />
                </div>
                <div className="chat-modal-actions">
                  <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={closeProjectModal}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" className="chat-modal-btn chat-modal-btn--primary">
                    {projectBeingEdited ? t('common.save') : t('chat.createProjectSubmit')}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
        {confirmDeleteProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="chat-modal-backdrop"
            onClick={() => setConfirmDeleteProject(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="chat-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="chat-modal-header">
                <h2 className="chat-modal-title">{t('chat.deleteProjectTitle')}</h2>
                <button type="button" className="chat-modal-close" onClick={() => setConfirmDeleteProject(null)} aria-label={t('common.close')}>
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <p className="chat-modal-message">
                {t('chat.deleteProjectMessage', { name: confirmDeleteProject.name })}
              </p>
              <div className="chat-modal-actions">
                <button
                  type="button"
                  className="chat-modal-btn chat-modal-btn--secondary"
                  onClick={() => setConfirmDeleteProject(null)}
                >
                  {t('common.cancel')}
                </button>
                <button type="button" className="chat-modal-btn chat-modal-btn--danger" onClick={handleConfirmDeleteProject}>
                  {t('common.delete')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {discussionRenameTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="chat-modal-backdrop"
            onClick={closeRenameDiscussionModal}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="chat-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="chat-modal-header">
                <h2 className="chat-modal-title">{t('chat.renameDiscussionTitle')}</h2>
                <button type="button" className="chat-modal-close" onClick={closeRenameDiscussionModal} aria-label={t('common.close')}>
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <form onSubmit={handleSaveDiscussionRename}>
                <div className="chat-modal-field">
                  <label className="chat-modal-label" htmlFor="discussion-rename-title">
                    {t('chat.discussionTitleLabel')}
                  </label>
                  <input
                    id="discussion-rename-title"
                    required
                    value={discussionRenameInput}
                    onChange={(e) => setDiscussionRenameInput(e.target.value)}
                    className="chat-modal-input"
                    autoFocus
                  />
                </div>
                <div className="chat-modal-actions">
                  <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={closeRenameDiscussionModal}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" className="chat-modal-btn chat-modal-btn--primary">
                    {t('common.save')}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
        {confirmDeleteDiscussion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="chat-modal-backdrop"
            onClick={() => setConfirmDeleteDiscussion(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="chat-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="chat-modal-header">
                <h2 className="chat-modal-title">{t('chat.deleteDiscussionTitle')}</h2>
                <button type="button" className="chat-modal-close" onClick={() => setConfirmDeleteDiscussion(null)} aria-label={t('common.close')}>
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <p className="chat-modal-message">
                {t('chat.deleteDiscussionMessage', { title: confirmDeleteDiscussion.title })}
              </p>
              <div className="chat-modal-actions">
                <button
                  type="button"
                  className="chat-modal-btn chat-modal-btn--secondary"
                  onClick={() => setConfirmDeleteDiscussion(null)}
                >
                  {t('common.cancel')}
                </button>
                <button type="button" className="chat-modal-btn chat-modal-btn--danger" onClick={handleConfirmDeleteDiscussion}>
                  {t('common.delete')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {confirmDeleteMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="chat-modal-backdrop"
            onClick={() => setConfirmDeleteMessage(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="chat-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="chat-modal-header">
                <h2 className="chat-modal-title">{t('chat.deleteMessageTitle')}</h2>
                <button type="button" className="chat-modal-close" onClick={() => setConfirmDeleteMessage(null)} aria-label={t('common.close')}>
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <p className="chat-modal-message">{t('chat.deleteMessageConfirm')}</p>
              <div className="chat-modal-actions">
                <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={() => setConfirmDeleteMessage(null)}>
                  {t('common.cancel')}
                </button>
                <button type="button" className="chat-modal-btn chat-modal-btn--danger" onClick={handleConfirmDeleteMessage}>
                  {t('common.delete')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {membersProjectTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="chat-modal-backdrop"
            onClick={closeMembersModal}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="chat-modal"
              style={{ maxWidth: 440 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="chat-modal-header">
                <h2 className="chat-modal-title">
                  <Users size={17} strokeWidth={2} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  {t('chat.membersModalTitle')} — {membersProjectTarget.name}
                </h2>
                <button type="button" className="chat-modal-close" onClick={closeMembersModal} aria-label={t('common.close')}>
                  <X size={18} strokeWidth={2} />
                </button>
              </div>

              {/* Member list */}
              <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
                {projectMembers.length === 0 ? (
                  <p style={{ color: 'var(--color-text-3)', fontSize: 13, padding: '8px 0' }}>{t('chat.membersEmpty')}</p>
                ) : (
                  projectMembers.map((m) => {
                    const isOwner = Number(m.user_id) === Number(membersProjectTarget.owner_id)
                    return (
                      <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--color-border)' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: isOwner ? 'var(--color-primary)' : 'var(--color-text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                          {(m.name || m.email || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || m.email}</p>
                          <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-3)' }}>{m.email}</p>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>
                          {isOwner ? t('chat.memberOwner') : t('chat.memberMember')}
                        </span>
                        {!isOwner && Number(membersProjectTarget.owner_id) === Number(user?.id) && (
                          <button
                            type="button"
                            title={t('chat.memberRemove')}
                            onClick={() => handleRemoveMember(m.user_id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger, #e53e3e)', padding: 4, flexShrink: 0 }}
                          >
                            <Trash2 size={14} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Invite form (owner only) */}
              {Number(membersProjectTarget.owner_id) === Number(user?.id) && (
                <form onSubmit={handleInviteMember}>
                  <div className="chat-modal-field">
                    <label className="chat-modal-label" htmlFor="member-invite-email">
                      <UserPlus size={13} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      {t('chat.memberInviteLabel')}
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        id="member-invite-email"
                        type="email"
                        value={memberInviteEmail}
                        onChange={(e) => { setMemberInviteEmail(e.target.value); setMemberInviteError('') }}
                        className="chat-modal-input"
                        placeholder="email@exemple.com"
                        autoComplete="off"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="submit"
                        className="chat-modal-btn chat-modal-btn--primary"
                        disabled={memberInviteLoading || !memberInviteEmail.trim()}
                        style={{ flexShrink: 0 }}
                      >
                        {t('chat.memberInviteSubmit')}
                      </button>
                    </div>
                    {memberInviteError && (
                      <p style={{ color: 'var(--color-danger, #e53e3e)', fontSize: 12, marginTop: 4 }}>{memberInviteError}</p>
                    )}
                  </div>
                </form>
              )}

              <div className="chat-modal-actions">
                <button type="button" className="chat-modal-btn chat-modal-btn--secondary" onClick={closeMembersModal}>
                  {t('common.close')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="chat-lightbox"
            onClick={() => setLightboxSrc(null)}
          >
            <button
              type="button"
              className="chat-lightbox-close"
              onClick={() => setLightboxSrc(null)}
              aria-label={t('common.close')}
            >
              <X size={20} strokeWidth={2} />
            </button>
            <img
              src={lightboxSrc}
              alt=""
              className="chat-lightbox-img"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--color-border-strong); border-radius: 4px; }
      `}</style>
    </div>
  )
}

// ── ComposerField (extracted to avoid duplication) ─────────────────────────

function ComposerField({
  textareaRef, fileInputRef, inputMessage, setInputMessage,
  pendingAttachments, removeAttachment,
  onComposerPaste, onFileInputChange, onComposerKeyDown,
  handleSendMessage, autoResizeTextarea,
  canSend, loading, disabled, placeholder,
  isRecording, toggleMic,
  ttsEnabled, ttsPlaying, toggleTts,
  t, setLightboxSrc,
}) {
  return (
    <form className="chat-composer-inner" onSubmit={handleSendMessage}>
      {/* Attachment preview chips */}
      {pendingAttachments.length > 0 && (
        <div className="chat-composer-chips">
          {pendingAttachments.map((att, i) => (
            <div key={i} className="chat-composer-chip">
              {att.attach_type === 'image' ? (
                <button
                  type="button"
                  className="chat-composer-chip-img-wrap"
                  onClick={() => setLightboxSrc(att.data)}
                  aria-label={att.name}
                >
                  <img src={att.data} alt={att.name} className="chat-composer-chip-img" />
                </button>
              ) : (
                <span className="chat-composer-chip-file">
                  <FileText size={13} />
                  <span className="chat-composer-chip-name">{att.name}</span>
                </span>
              )}
              <button
                type="button"
                className="chat-composer-chip-remove"
                onClick={() => removeAttachment(i)}
                aria-label={t('chat.removeAttachment')}
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`chat-composer-field ${disabled ? 'chat-composer-field--disabled' : ''}`}
        onPaste={onComposerPaste}
      >
        {/* Left tools: paperclip + mic + TTS toggle */}
        <div className="chat-composer-tools">
          <button
            type="button"
            className="chat-composer-tool-btn"
            disabled={disabled}
            aria-label={t('chat.attachFile')}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={17} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={`chat-composer-tool-btn ${isRecording ? 'chat-composer-tool-btn--recording' : ''}`}
            disabled={disabled}
            aria-label={isRecording ? t('chat.stopRecording') : t('chat.startRecording')}
            onClick={toggleMic}
          >
            {isRecording ? <MicOff size={17} strokeWidth={2} /> : <Mic size={17} strokeWidth={2} />}
          </button>
          <button
            type="button"
            className={`chat-composer-tool-btn ${ttsEnabled ? 'chat-composer-tool-btn--tts-on' : ''} ${ttsPlaying ? 'chat-composer-tool-btn--recording' : ''}`}
            aria-label={ttsEnabled ? t('chat.ttsToggleOff') : t('chat.ttsToggleOn')}
            onClick={toggleTts}
            title={ttsEnabled ? t('chat.ttsToggleOff') : t('chat.ttsToggleOn')}
          >
            {ttsEnabled ? <Volume2 size={17} strokeWidth={2} /> : <VolumeX size={17} strokeWidth={2} />}
          </button>
        </div>

        <textarea
          ref={textareaRef}
          rows={1}
          value={inputMessage}
          onChange={(e) => { setInputMessage(e.target.value); autoResizeTextarea() }}
          onKeyDown={onComposerKeyDown}
          placeholder={placeholder}
          disabled={disabled || loading}
          className="chat-composer-input"
        />

        <button
          type="submit"
          disabled={!canSend}
          className="chat-composer-send"
          style={{
            background: canSend ? 'var(--color-primary)' : 'var(--color-input-bg)',
            color: canSend ? '#fff' : 'var(--color-text-3)',
            opacity: loading ? 0.6 : 1,
          }}
          aria-label={t('chat.sendMessage')}
        >
          <Send size={17} />
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
        style={{ display: 'none' }}
        onChange={onFileInputChange}
      />
    </form>
  )
}
