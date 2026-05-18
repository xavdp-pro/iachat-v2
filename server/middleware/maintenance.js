import { getMaintenanceSettings } from '../services/appSettings.js'

function normalizeIp(value) {
  let ip = String(value || '').trim()
  if (!ip) return ''
  if (ip.includes(',')) ip = ip.split(',')[0].trim()
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  if (ip === '::1') return '127.0.0.1'
  const portMatch = ip.match(/^([0-9.]+):\d+$/)
  if (portMatch) return portMatch[1]
  return ip
}

export function getClientIp(req) {
  return getClientIpInfo(req).ip
}

export function getClientIpInfo(req) {
  const forwardedForChain = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map(item => normalizeIp(item))
    .filter(Boolean)
  const candidates = [
    ['X-Forwarded-For', req.headers['x-forwarded-for']],
    ['X-Real-IP', req.headers['x-real-ip']],
    ['CF-Connecting-IP', req.headers['cf-connecting-ip']],
    ['True-Client-IP', req.headers['true-client-ip']],
    ['req.ip', req.ip],
    ['socket.remoteAddress', req.socket?.remoteAddress],
  ]
  for (const [source, raw] of candidates) {
    const ip = normalizeIp(raw)
    if (ip) return { ip, source, raw: String(raw || ''), forwardedForChain }
  }
  return { ip: '', source: 'none', raw: '', forwardedForChain }
}

function splitBypassIps(value) {
  return String(value || '')
    .split(/[\s,;]+/u)
    .map(item => item.trim())
    .filter(Boolean)
}

export function normalizeMaintenanceBypassIps(value) {
  return [...new Set(splitBypassIps(value).map(normalizeIp).filter(Boolean))].join('\n')
}

function ipv4ToNumber(ip) {
  const parts = String(ip || '').split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return parts.reduce((acc, part) => ((acc << 8) + part) >>> 0, 0)
}

function matchesCidr(ip, entry) {
  const [range, bitsText] = String(entry || '').split('/')
  const bits = Number(bitsText)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const ipNumber = ipv4ToNumber(ip)
  const rangeNumber = ipv4ToNumber(range)
  if (ipNumber == null || rangeNumber == null) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (ipNumber & mask) === (rangeNumber & mask)
}

export function isIpAllowedByMaintenanceBypass(ip, bypassIps) {
  const clientIp = normalizeIp(ip)
  if (!clientIp) return false
  return splitBypassIps(bypassIps).some((rawEntry) => {
    const entry = normalizeIp(rawEntry)
    if (!entry) return false
    if (entry === '*') return true
    if (entry.includes('/')) return matchesCidr(clientIp, entry)
    return normalizeIp(entry) === clientIp
  })
}

function isAlwaysOpenPath(req) {
  if (req.method === 'OPTIONS') return true
  return req.path === '/api/health' || req.path === '/api/maintenance-status'
}

export async function maintenanceMode(req, res, next) {
  if (isAlwaysOpenPath(req)) return next()
  try {
    const settings = await getMaintenanceSettings()
    if (!settings.enabled) return next()
    const clientIp = getClientIp(req)
    if (isIpAllowedByMaintenanceBypass(clientIp, settings.bypassIps)) return next()
    return res.status(503).json({
      error: 'Maintenance en cours',
      code: 'MAINTENANCE_MODE',
      maintenance: true,
      message: settings.message,
      clientIp,
    })
  } catch (err) {
    console.error('[maintenance] fail-open:', err?.message || err)
    return next()
  }
}