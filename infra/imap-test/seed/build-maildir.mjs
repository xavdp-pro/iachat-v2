#!/usr/bin/env node
/**
 * Build Maildir fixtures for the Zerux Dovecot test server.
 */
import { mkdirSync, writeFileSync, chmodSync, readdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { FIXTURE_THREADS } from './fixtures.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MAILDIR_CUR = join(__dirname, '../maildir/zerux.test/commercial/Maildir/cur')

const TO = 'commercial@zerux.test'
const COMMERCIAL_NAME = 'Armand Guilhot'

function parseMailDate(dateStr) {
  const t = Date.parse(dateStr)
  return Number.isFinite(t) ? Math.floor(t / 1000) : Math.floor(Date.now() / 1000)
}

function buildRawMail({ from, fromName, subject, date, body, messageId, inReplyTo }) {
  const mid = messageId || `<${randomBytes(8).toString('hex')}@zerux.test>`
  const headers = [
    `From: ${fromName} <${from}>`,
    `To: ${COMMERCIAL_NAME} <${TO}>`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    `Message-ID: ${mid}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    inReplyTo ? `References: ${inReplyTo}` : null,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body.replace(/\r?\n/g, '\r\n'),
  ].filter(Boolean)
  return { raw: headers.join('\r\n') + '\r\n', mid, date }
}

function maildirName(size, epochSec) {
  const host = 'zerux-imap-test'
  const rand = randomBytes(6).toString('hex')
  return `${epochSec}.M${rand}${host},S=${size}:2,`
}

mkdirSync(MAILDIR_CUR, { recursive: true })
mkdirSync(join(MAILDIR_CUR, '..', 'new'), { recursive: true })
mkdirSync(join(MAILDIR_CUR, '..', 'tmp'), { recursive: true })

// Clear previous seed files
for (const f of readdirSync(MAILDIR_CUR)) {
  if (!f.startsWith('.')) unlinkSync(join(MAILDIR_CUR, f))
}

let count = 0
for (const mail of FIXTURE_THREADS) {
  const { raw, date } = buildRawMail(mail)
  const buf = Buffer.from(raw, 'utf8')
  const epoch = parseMailDate(date)
  writeFileSync(join(MAILDIR_CUR, maildirName(buf.length, epoch)), buf)
  count += 1
}

try {
  chmodSync(join(__dirname, '../maildir'), 0o755)
} catch { /* noop */ }

console.log(`✅ ${count} messages (${FIXTURE_THREADS.length} fixtures) → ${MAILDIR_CUR}`)
