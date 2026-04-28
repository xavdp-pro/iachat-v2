// Test direct du validateur sans passer par HTTP
import '../server/env.js'
import { validateDevis } from '../server/services/rules-validator.js'

const id = Number(process.argv[2] || 1)
console.log(`\n=== Validation du devis ${id} ===\n`)
try {
  const t0 = Date.now()
  const report = await validateDevis({ devisId: id })
  console.log(`Durée: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`Règles: ${report.rules_count}, Lignes: ${report.lines.length}`)
  console.log(`Résumé:`, report.summary)
  for (const line of report.lines) {
    console.log(`\n──── Ligne ${line.position + 1}: ${line.gamme} ${line.vantail} (${line.designation || ''}) ────`)
    for (const v of line.verdicts) {
      const icon = { ok: '✅', warning: '⚠️ ', violation: '❌', na: '➖' }[v.status] || '?'
      console.log(`  ${icon} [${v.status}] ${v.rule_title}`)
      if (v.reason) console.log(`     → ${v.reason}`)
      if (v.fix) console.log(`     fix: ${v.fix}`)
    }
  }
} catch (err) {
  console.error('ERREUR:', err.message)
  console.error(err.stack)
}
process.exit(0)
