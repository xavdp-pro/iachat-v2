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
