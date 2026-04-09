/**
 * Run on the same host as the API: verifies DNS + HTTPS + /api/tags like server/services/ollama.js
 * Usage: cd iachat-v2 && node scripts/check-ollama.mjs
 */
import 'dotenv/config'

const base = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '')
const url = `${base}/api/tags`

const ac = new AbortController()
const t = setTimeout(() => ac.abort(), 25000)

try {
  const res = await fetch(url, { signal: ac.signal })
  const text = await res.text()
  console.log(`URL: ${url}`)
  console.log(`HTTP: ${res.status} ${res.statusText}`)
  if (!res.ok) {
    console.error('Body:', text.slice(0, 500))
    process.exit(1)
  }
  try {
    const j = JSON.parse(text)
    const n = j.models?.length ?? 0
    console.log(`Models in JSON: ${n}`)
    if (n > 0) console.log('First:', j.models[0]?.name || j.models[0])
  } catch {
    console.log('Body (not JSON):', text.slice(0, 300))
  }
} catch (err) {
  console.error('FETCH FAILED:', err.message)
  if (err.cause) console.error('Cause:', err.cause)
  process.exit(1)
} finally {
  clearTimeout(t)
}
