#!/usr/bin/env node
/**
 * Scan NEXUS markdown sources and propose/import business rules into devis_rules + Qdrant.
 * Usage:
 *   node scripts/extract-rules-from-markdown.mjs           # dry-run JSON to stdout
 *   node scripts/extract-rules-from-markdown.mjs --apply   # insert new rules only
 */
import '../server/env.js'
import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import db from '../server/db/index.js'
import { storeDevisRule } from '../server/services/memory.js'

const XLSX_DIR = '/apps/zeruxcom-v1/app/ressources/XLSX'
const IMPORT_TAG = 'markdown-extract-auto'
const APPLY = process.argv.includes('--apply')
const RULE_PATTERN = /\b(doit|doivent|ne pas|jamais|toujours|obligatoire|interdit|uniquement|hors catalogue|nous consulter|validation r&d)\b/i

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function titleFromLine(line, fallback) {
  const cleaned = normalizeText(line.replace(/^[-*>\d.]+\s*/, '').replace(/\*\*/g, ''))
  if (!cleaned) return fallback
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}…` : cleaned
}

function extractCandidates(markdown, fileName) {
  const candidates = []
  const sections = markdown.split(/^##\s+/m)
  for (const section of sections) {
    const [headingLine, ...bodyLines] = section.split('\n')
    const heading = normalizeText(headingLine)
    const body = bodyLines.join('\n')
    const lines = body.split('\n').map(line => line.trim()).filter(Boolean)
    for (const line of lines) {
      if (!/^[-*]/.test(line) && !/^\d+\./.test(line)) continue
      const content = normalizeText(line.replace(/^[-*>\d.]+\s*/, '').replace(/\*\*/g, ''))
      if (content.length < 24 || !RULE_PATTERN.test(content)) continue
      candidates.push({
        title: titleFromLine(content, heading || fileName),
        content,
        category: /feu|ei\d/i.test(content) ? 'Feu'
          : /dimension|hauteur|largeur|plancher|plafond/i.test(content) ? 'Dimensions'
          : /serrure|garniture|équipement|equipement|ferme-porte/i.test(content) ? 'Règle métier'
          : /prix|tarif|€|ht\b/i.test(content) ? 'Chiffrage'
          : 'Règle métier',
        severity: /jamais|obligatoire|interdit|hors catalogue|validation r&d/i.test(content) ? 'blocking' : 'warning',
        source_type: 'markdown',
        source_ref: `${fileName}:${heading || 'body'}`,
        tags: [IMPORT_TAG, basename(fileName, '.md')],
      })
    }
  }
  return candidates
}

async function loadExistingContents() {
  const [rows] = await db.query('SELECT content FROM devis_rules')
  return new Set(rows.map(row => normalizeText(row.content).toLowerCase()))
}

async function nextRuleCode() {
  const [rows] = await db.query('SELECT rule_code FROM devis_rules ORDER BY id DESC LIMIT 1')
  const last = rows[0]?.rule_code
  const match = String(last || '').match(/^R(\d+)$/)
  const n = match ? Number(match[1]) + 1 : 1
  return `R${String(n).padStart(3, '0')}`
}

const mdFiles = (await readdir(XLSX_DIR)).filter(name => name.endsWith('.md')).sort()
const allCandidates = []
for (const fileName of mdFiles) {
  const markdown = await readFile(join(XLSX_DIR, fileName), 'utf-8')
  allCandidates.push(...extractCandidates(markdown, fileName))
}

const seen = new Set()
const unique = allCandidates.filter((rule) => {
  const key = rule.content.toLowerCase()
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

if (!APPLY) {
  console.log(JSON.stringify({
    dry_run: true,
    files: mdFiles.length,
    candidates: unique.length,
    sample: unique.slice(0, 12),
  }, null, 2))
  await db.end()
  process.exit(0)
}

const existing = await loadExistingContents()
const [adminRows] = await db.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1")
const adminId = adminRows[0]?.id || null

let inserted = 0
let skipped = 0
let indexed = 0

for (const rawRule of unique) {
  if (existing.has(rawRule.content.toLowerCase())) {
    skipped += 1
    continue
  }
  const ruleCode = await nextRuleCode()
  const [result] = await db.query(
    `INSERT INTO devis_rules
      (rule_code, title, content, category, severity, source_type, source_ref, tags_json, status, created_by, approved_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      ruleCode,
      rawRule.title,
      rawRule.content,
      rawRule.category,
      rawRule.severity,
      rawRule.source_type,
      rawRule.source_ref,
      JSON.stringify(rawRule.tags),
      adminId,
      adminId,
    ]
  )
  inserted += 1
  const qdrantId = await storeDevisRule({
    ruleId: result.insertId,
    ruleCode,
    title: rawRule.title,
    content: rawRule.content,
    category: rawRule.category,
    severity: rawRule.severity,
    sourceType: rawRule.source_type,
    sourceRef: rawRule.source_ref,
    tags: rawRule.tags,
  })
  if (qdrantId) {
    indexed += 1
    await db.query('UPDATE devis_rules SET qdrant_id = ? WHERE id = ?', [qdrantId, result.insertId])
  }
}

console.log(JSON.stringify({ inserted, skipped, indexed, tag: IMPORT_TAG }, null, 2))
await db.end()
