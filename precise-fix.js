const fs = require('fs');
const lines = fs.readFileSync('/apps/zeruxcom-v1/app/iachat-v2/src/pages/Admin.jsx.bak', 'utf8').split('\n');

// 1. imports (line 5 -> index 4)
lines[4] = "  Plus, Pencil, Trash2, ShieldCheck, User, Loader2, Moon, Sun, MessageSquare, LogOut, Mic, Square, Bot, RefreshCw, X,";

// 2. tabs constants (lines 14, 17 -> idx 13, 16)
lines[13] = "const TAB_STT = 'stt'";
lines[16] = "const VALID_TABS = new Set([TAB_USERS, TAB_STT, TAB_TTS, TAB_EXPERIENCES])";

// 3. remove modelHintsFromVite (lines 19-22 -> idx 18-21)
for(let i = 18; i <= 21; i++) lines[i] = null;

// 4. states (lines 48-56 -> idx 47-55)
lines[47] = `  const [sttTesting, setSttTesting] = useState(false)
  const [sttResult, setSttResult] = useState('')
  const [sttError, setSttError] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef(null)
  const sttChunksRef = useRef([])`;
for(let i = 48; i <= 55; i++) lines[i] = null;

// 5. loadOllamaSettings (lines 134-168 -> idx 133-167)
for(let i = 133; i <= 167; i++) lines[i] = null;

// 6. saveOllamaSettings, etc (lines 245-290 -> idx 244-289)
lines[244] = `  const handleStartRecording = async () => {
    try {
      setSttError('')
      setSttResult('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      sttChunksRef.current = []

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) sttChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        setSttTesting(true)
        const audioBlob = new Blob(sttChunksRef.current, { type: 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', audioBlob)

        try {
          const resp = await api.post('/tts/stt', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
          if (resp.text) {
            setSttResult(resp.text)
          }
        } catch (err) {
          setSttError(err?.error || err?.message || 'Erreur STT')
        } finally {
          setSttTesting(false)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      setSttError(err?.message || 'Impossible d\\'accéder au micro')
    }
  }

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
      setIsRecording(false)
    }
  }`;
for(let i = 245; i <= 289; i++) lines[i] = null;

// 7. filteredModels (lines 299-302 -> idx 298-301)
for(let i = 298; i<= 301; i++) lines[i] = null;

// 8. tab button (lines 338-349 -> idx 337-348)
lines[337] = `            <button
              type="button"
              role="tab"
              id="admin-tab-stt"
              aria-selected={activeTab === TAB_STT}
              aria-controls="admin-panel-stt"
              className={\`admin-tab \${activeTab === TAB_STT ? 'admin-tab--active' : ''}\`}
              onClick={() => setActiveTab(TAB_STT)}
            >
              <Mic size={17} strokeWidth={2} aria-hidden />
              Entrée STT
            </button>`;
for(let i = 338; i <= 348; i++) lines[i] = null;

// 9. panel component (lines 381 - 542 -> idx 380 - 541)
lines[380] = `        {activeTab === TAB_STT && (
          <section
            id="admin-panel-stt"
            role="tabpanel"
            aria-labelledby="admin-tab-stt"
            className="admin-stt-panel"
          >
            <div className="admin-toolbar">
              <div className="admin-stt-icon" aria-hidden>
                <Mic size={22} strokeWidth={2} />
              </div>
              <div>
                <h2 id="admin-stt-heading">Test STT (Speech-to-Text)</h2>
                <p className="admin-stt-desc">Vérifiez le fonctionnement de la transcription via Gemma 4 / vLLM.</p>
              </div>
            </div>
            <div className="admin-stt-content" style={{ marginTop: '20px', padding: '20px', background: 'var(--bg-layer-2)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {!isRecording ? (
                  <button type="button" className="admin-btn-primary" onClick={handleStartRecording} disabled={sttTesting}>
                    <Mic size={16} /> Démarrer l'enregistrement
                  </button>
                ) : (
                  <button type="button" className="admin-btn-danger" onClick={handleStopRecording} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Square size={16} /> Arrêter l'enregistrement
                  </button>
                )}
                {isRecording && <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Enregistrement en cours...</span>}
                {sttTesting && <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Loader2 className="animate-spin" size={16} /> Transcription...</span>}
              </div>

              {sttError && (
                <div style={{ marginTop: '20px', padding: '12px', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px' }}>
                  <strong>Erreur : </strong> {sttError}
                </div>
              )}

              {sttResult && (
                <div style={{ marginTop: '20px', padding: '16px', background: 'var(--bg-layer-1)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                  <h3 style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>Résultat de la transcription :</h3>
                  <p style={{ fontSize: '16px', lineHeight: '1.5' }}>{sttResult}</p>
                </div>
              )}
            </div>
          </section>
        )}`;
for(let i = 381; i <= 541; i++) lines[i] = null;

const newCode = lines.filter(l => l !== null).join('\n');
fs.writeFileSync('/apps/zeruxcom-v1/app/iachat-v2/src/pages/Admin.jsx', newCode);
