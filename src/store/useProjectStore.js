import { create } from 'zustand'
import api from '../api/index.js'

const ACTIVE_PROJECT_KEY = 'iachat_active_project_id'

export const useProjectStore = create((set, get) => ({
  projects: [],
  activeProject: null,
  discussions: [],
  activeDiscussion: null,
  messages: [],
  projectMembers: [],
  loading: false,
  streaming: false,
  streamingContent: '',
  ollamaError: null,

  clearOllamaError: () => set({ ollamaError: null }),

  fetchProjects: async () => {
    set({ loading: true })
    try {
      const data = await api.get('/projects')
      const savedId = localStorage.getItem(ACTIVE_PROJECT_KEY)
      let activeProject = get().activeProject
      if (activeProject) {
        activeProject = data.find((p) => p.id === activeProject.id) || null
      }
      if (!activeProject && savedId) {
        const id = Number(savedId)
        activeProject = data.find((p) => p.id === id) || null
      }
      // Intentionally no auto-select of the first project (user chooses or creates)

      set({ projects: data, loading: false, activeProject })
      if (activeProject) {
        await get().fetchDiscussions(activeProject.id)
      } else {
        set({ discussions: [], activeDiscussion: null, messages: [] })
      }
    } catch (err) {
      console.error('Error fetching projects:', err)
      set({ loading: false })
    }
  },

  setActiveProject: async (project) => {
    if (project) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, String(project.id))
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_KEY)
    }
    set({ activeProject: project, activeDiscussion: null, discussions: [], messages: [] })
    if (project) {
      get().fetchDiscussions(project.id)
    }
  },

  fetchDiscussions: async (projectId) => {
    set({ loading: true })
    try {
      const data = await api.get(`/discussions?project_id=${projectId}`)
      set({ discussions: data, loading: false })
    } catch (err) {
      console.error('Error fetching discussions:', err)
      set({ loading: false })
    }
  },

  createProject: async (name, description) => {
    try {
      const data = await api.post('/projects', { name, description })
      set((state) => ({ projects: [data, ...state.projects] }))
      get().setActiveProject(data)
      return data
    } catch (err) {
      console.error('Error creating project:', err)
      throw err
    }
  },

  updateProject: async (id, payload) => {
    const data = await api.put(`/projects/${id}`, payload)
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...data } : p)),
      activeProject:
        state.activeProject?.id === id ? { ...state.activeProject, ...data } : state.activeProject,
    }))
    return data
  },

  deleteProject: async (id) => {
    await api.delete(`/projects/${id}`)
    const wasActive = get().activeProject?.id === id
    if (wasActive) localStorage.removeItem(ACTIVE_PROJECT_KEY)
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProject: wasActive ? null : state.activeProject,
      discussions: wasActive ? [] : state.discussions,
      activeDiscussion: wasActive ? null : state.activeDiscussion,
      messages: wasActive ? [] : state.messages,
    }))
  },

  createDiscussion: async (title) => {
    const { activeProject } = get()
    if (!activeProject) return
    const safeTitle = typeof title === 'string' && title.trim() ? title.trim() : 'Untitled'
    try {
      const data = await api.post('/discussions', {
        title: safeTitle,
        project_id: activeProject.id,
      })
      set((state) => ({
        discussions: [data, ...state.discussions],
        activeDiscussion: data,
      }))
      return data
    } catch (err) {
      console.error('Error creating discussion:', err)
      throw err
    }
  },

  updateDiscussion: async (id, title) => {
    const trimmed = typeof title === 'string' ? title.trim() : ''
    if (!trimmed) throw new Error('Title required')
    const data = await api.put(`/discussions/${id}`, { title: trimmed })
    set((state) => ({
      discussions: state.discussions.map((d) => (d.id === id ? { ...d, ...data } : d)),
      activeDiscussion:
        state.activeDiscussion?.id === id ? { ...state.activeDiscussion, ...data } : state.activeDiscussion,
    }))
    return data
  },

  deleteDiscussion: async (id) => {
    await api.delete(`/discussions/${id}`)
    const wasActive = get().activeDiscussion?.id === id
    set((state) => ({
      discussions: state.discussions.filter((d) => d.id !== id),
      activeDiscussion: wasActive ? null : state.activeDiscussion,
      messages: wasActive ? [] : state.messages,
    }))
  },

  setActiveDiscussion: async (discussion) => {
    set({ activeDiscussion: discussion, messages: [] })
    if (discussion) {
      get().fetchMessages(discussion.id)
    }
  },

  fetchMessages: async (discussionId) => {
    set({ loading: true })
    try {
      const data = await api.get(`/messages?discussion_id=${discussionId}`)
      set({ messages: data, loading: false })
    } catch (err) {
      console.error('Error fetching messages:', err)
      set({ loading: false })
    }
  },

  updateMessage: async (id, content) => {
    const trimmed = content?.trim()
    if (!trimmed) throw new Error('Content required')
    const data = await api.put(`/messages/${id}`, { content: trimmed })
    set((state) => ({
      messages: state.messages.map((m) => m.id === id ? { ...m, content: trimmed, edited_at: data.edited_at } : m),
    }))
    return data
  },

  deleteMessage: async (id) => {
    await api.delete(`/messages/${id}`)
    set((state) => ({ messages: state.messages.filter((m) => m.id !== id) }))
  },

  fetchProjectMembers: async (projectId) => {
    try {
      const data = await api.get(`/projects/${projectId}/members`)
      set({ projectMembers: data })
      return data
    } catch (err) {
      console.error('Error fetching project members:', err)
      set({ projectMembers: [] })
      throw err
    }
  },

  addProjectMember: async (projectId, email) => {
    const data = await api.post(`/projects/${projectId}/members`, { email })
    set((state) => ({ projectMembers: [...state.projectMembers, data] }))
    return data
  },

  removeProjectMember: async (projectId, userId) => {
    await api.delete(`/projects/${projectId}/members/${userId}`)
    set((state) => ({ projectMembers: state.projectMembers.filter((m) => m.user_id !== userId) }))
  },

  sendMessage: async (content, attachments = []) => {
    const { activeDiscussion } = get()
    if (!activeDiscussion || !content.trim()) return

    const tempId = `temp-${Date.now()}`
    const optimistic = {
      id: tempId,
      discussion_id: activeDiscussion.id,
      content,
      role: 'user',
      attachments,
      created_at: new Date().toISOString(),
    }

    set((state) => ({
      messages: [...state.messages, optimistic],
      loading: true,
      streaming: false,
      streamingContent: '',
      ollamaError: null,
    }))

    // If attachments present, fall back to non-streaming endpoint
    if (attachments.length > 0) {
      try {
        const data = await api.post(
          '/messages',
          { discussion_id: activeDiscussion.id, content, role: 'user', attachments },
          { timeout: 600000 }
        )
        const userMsg = data.message || data
        const assistantMsg = data.assistant
        set((state) => {
          const replaced = state.messages.map((m) =>
            m.id === tempId ? { ...userMsg, attachments: userMsg.attachments || [] } : m
          )
          return {
            messages: assistantMsg
              ? [...replaced, { ...assistantMsg, attachments: assistantMsg.attachments || [] }]
              : replaced,
            loading: false,
            ollamaError: data.ollama_error || null,
          }
        })
        return data
      } catch (err) {
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== tempId),
          loading: false,
        }))
        throw err
      }
    }

    // Streaming path (no attachments)
    try {
      const token = localStorage.getItem('token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${baseURL}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ discussion_id: activeDiscussion.id, content, attachments }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw errData
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'user') {
              set((state) => ({
                messages: state.messages.map((m) =>
                  m.id === tempId ? { ...evt.message, attachments: [] } : m
                ),
              }))
            } else if (evt.type === 'chunk') {
              set((state) => ({
                streaming: true,
                streamingContent: state.streamingContent + evt.delta,
              }))
            } else if (evt.type === 'done') {
              set((state) => ({
                messages: evt.assistant
                  ? [...state.messages, { ...evt.assistant, attachments: [] }]
                  : state.messages,
                loading: false,
                streaming: false,
                streamingContent: '',
                ollamaError: null,
              }))
            } else if (evt.type === 'error') {
              set({
                loading: false,
                streaming: false,
                streamingContent: '',
                ollamaError: evt.error,
              })
            }
          } catch { /* skip malformed SSE line */ }
        }
      }
    } catch (err) {
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== tempId),
        loading: false,
        streaming: false,
        streamingContent: '',
      }))
      console.error('Error sending message:', err)
      throw err
    }
  },
}))
