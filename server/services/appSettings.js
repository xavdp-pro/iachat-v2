import db from '../db/index.js'
import { defaultModel as envDefaultModel, isOllamaEnabled } from './ollama.js'

export const KEY_MODEL = 'ollama_default_model'
export const KEY_ENABLED = 'ollama_enabled'

export async function getSetting(key) {
  const [rows] = await db.query(
    'SELECT setting_value FROM app_settings WHERE setting_key = ?',
    [key]
  )
  return rows[0]?.setting_value ?? null
}

export async function setSetting(key, value) {
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
    [key, value]
  )
}

export async function deleteSetting(key) {
  await db.query('DELETE FROM app_settings WHERE setting_key = ?', [key])
}

/** Model used for all users: DB override or OLLAMA_MODEL from env */
export async function getGlobalOllamaModel() {
  const v = await getSetting(KEY_MODEL)
  const t = typeof v === 'string' ? v.trim() : ''
  return t || envDefaultModel()
}

/** Effective chat toggle: DB override or env OLLAMA_ENABLED */
export async function resolvedIsOllamaEnabled() {
  const v = await getSetting(KEY_ENABLED)
  if (v === null || v === '') return isOllamaEnabled()
  return v === '1' || v === 'true'
}

/** 'inherit' | 'on' | 'off' */
export async function getOllamaEnabledMode() {
  const v = await getSetting(KEY_ENABLED)
  if (v === null || v === '') return 'inherit'
  if (v === '1' || v === 'true') return 'on'
  return 'off'
}

export async function persistOllamaAdminSettings({ defaultModel: model, enabledMode }) {
  if (enabledMode === 'inherit') {
    await deleteSetting(KEY_ENABLED)
  } else if (enabledMode === 'on') {
    await setSetting(KEY_ENABLED, '1')
  } else if (enabledMode === 'off') {
    await setSetting(KEY_ENABLED, '0')
  }

  const m = typeof model === 'string' ? model.trim() : ''
  if (!m) {
    await deleteSetting(KEY_MODEL)
  } else {
    await setSetting(KEY_MODEL, m.slice(0, 200))
  }
}

/** null = use env OLLAMA_MODEL only */
export async function getDbModelOverride() {
  const v = await getSetting(KEY_MODEL)
  const t = typeof v === 'string' ? v.trim() : ''
  return t || null
}

/**
 * Read cached model names maintained by admin refresh action.
 * @returns {Promise<Array<{name: string}>>}
 */
export async function getCachedOllamaModels() {
  const [rows] = await db.query(
    'SELECT name FROM ollama_models_cache ORDER BY name ASC'
  )
  return rows.map((r) => ({ name: String(r.name || '') })).filter((m) => m.name)
}

/**
 * Replace entire cache with a fresh list (clear then recreate).
 * @param {Array<{name: string}>} models
 */
export async function replaceCachedOllamaModels(models) {
  const seen = new Set()
  const cleaned = []
  for (const m of models || []) {
    const name = String(m?.name || '').trim().slice(0, 200)
    if (!name || seen.has(name)) continue
    seen.add(name)
    cleaned.push(name)
  }

  await db.query('DELETE FROM ollama_models_cache')
  if (!cleaned.length) return

  const values = cleaned.map((name) => [name])
  await db.query('INSERT INTO ollama_models_cache (name) VALUES ?', [values])
}

/**
 * @returns {Promise<string|null>} ISO-like timestamp from DB
 */
export async function getOllamaModelsCacheUpdatedAt() {
  const [rows] = await db.query(
    'SELECT MAX(updated_at) AS updated_at FROM ollama_models_cache'
  )
  return rows[0]?.updated_at ?? null
}
