/**
 * odoo.js — client XML-RPC Odoo pour iachat-v2
 *
 * Credentials lus depuis .env :
 *   ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_PASSWORD, ODOO_SSL_VERIFY
 *
 * Usage :
 *   import { callOdoo, odooConfig } from './services/odoo.js'
 *   const records = await callOdoo('res.partner', 'search_read', [[['active','=',true]], ['id','name'], 0, 10])
 */

import xmlrpc from 'xmlrpc'
import https from 'https'

export const odooConfig = {
  url: (process.env.ODOO_URL || '').replace(/\/+$/, ''),
  db: process.env.ODOO_DB || '',
  login: process.env.ODOO_LOGIN || '',
  password: process.env.ODOO_PASSWORD || '',
  sslVerify: !['0', 'false', 'no'].includes(
    String(process.env.ODOO_SSL_VERIFY || '1').toLowerCase()
  ),
}

function isConfigured() {
  return !!(odooConfig.url && odooConfig.db && odooConfig.login && odooConfig.password)
}

function createClient(path) {
  const isSecure = odooConfig.url.startsWith('https://')
  const factory = isSecure ? xmlrpc.createSecureClient : xmlrpc.createClient
  const options = { url: `${odooConfig.url}${path}` }
  if (isSecure && !odooConfig.sslVerify) {
    options.agent = new https.Agent({ rejectUnauthorized: false })
  }
  return factory(options)
}

function rpcCall(client, method, params) {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (err, val) => (err ? reject(err) : resolve(val)))
  })
}

/** Authenticate once and return uid. Throws if credentials are wrong or ERP unreachable. */
async function authenticate() {
  if (!isConfigured()) throw new Error('Odoo: variables ODOO_* manquantes dans .env')
  const common = createClient('/xmlrpc/2/common')
  const uid = await rpcCall(common, 'authenticate', [
    odooConfig.db,
    odooConfig.login,
    odooConfig.password,
    {},
  ])
  if (!uid) throw new Error(`Odoo: authentification échouée pour ${odooConfig.login}`)
  return uid
}

/**
 * Appel générique execute_kw.
 *
 * @param {string} model   ex: 'res.partner'
 * @param {string} method  ex: 'search_read'
 * @param {Array}  args    arguments positionnels (domain, fields, offset, limit, …)
 * @param {object} kwargs  arguments nommés optionnels
 * @returns {*} résultat brut Odoo
 */
export async function callOdoo(model, method, args = [], kwargs = {}) {
  const uid = await authenticate()
  const object = createClient('/xmlrpc/2/object')
  return rpcCall(object, 'execute_kw', [
    odooConfig.db,
    uid,
    odooConfig.password,
    model,
    method,
    args,
    kwargs,
  ])
}

/** Vérifie que la connexion Odoo fonctionne. Retourne { ok, version } ou { ok: false, error }. */
export async function checkOdooConnection() {
  try {
    if (!isConfigured()) return { ok: false, error: 'Variables ODOO_* manquantes' }
    const common = createClient('/xmlrpc/2/common')
    const version = await rpcCall(common, 'version', [])
    const uid = await authenticate()
    return { ok: true, uid, version }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}
