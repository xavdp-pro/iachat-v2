import fs from 'fs'
let text = fs.readFileSync('src/pages/Admin.jsx', 'utf8')

const lines = text.split('\n')
const startIndex = lines.findIndex(l => l.includes('{activeTab === TAB_OLLAMA && ('))
const endIndex = lines.findIndex(l => l.includes('{activeTab === TAB_TTS && ('))

if (startIndex !== -1 && endIndex !== -1) {
  lines.splice(startIndex, endIndex - startIndex,
`        {activeTab === TAB_STT && (
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
                  className={\`btn \${isRecording ? 'btn-danger' : 'btn-primary'}\`} 
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
`)
  fs.writeFileSync('src/pages/Admin.jsx', lines.join('\n'))
  console.log('REPLACED JSX successfully')
} else {
  console.error('Could not find boundaries')
}
