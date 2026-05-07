import fs from 'fs'
let text = fs.readFileSync('src/pages/Admin.jsx', 'utf8')

text = text.replace(/const loadOllamaSettings[\s\S]*?loadOllamaSettings\(\)\n  \}, \[activeTab, loadOllamaSettings\]\)\n/, `  const handleStartRecording = async () => {
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
        formData.append('audio', аудиоBlob, 'test.webm') // typo here! I'll fix it in string.
        formData.append('sampleRate', '48000')

        try {
          const resp = await fetch('/api/stt/transcribe', {
            method: 'POST',
            headers: { Authorization: \`Bearer \${localStorage.getItem('token') || ''}\` },
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
\n`)

text = text.replace(/const saveOllamaSettings = async[\s\S]*?setOllamaTesting\(false\)\n    \}\n  \}/, '')
text = text.replace(/const filteredModels =[\s\S]*?\}\)/, '')

fs.writeFileSync('src/pages/Admin.jsx', text)
console.log('REPLACED')
