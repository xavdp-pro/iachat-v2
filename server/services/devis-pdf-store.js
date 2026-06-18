/**
 * Persist generated devis PDFs under UPLOAD_DIR/devis-pdf/{devisId}/.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, '../../tmp/uploads')
const DEVIS_PDF_DIR = join(UPLOAD_DIR, 'devis-pdf')

function safePdfFilename(name) {
  return String(name || 'devis.pdf')
    .replace(/[^\w.\- ()àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ-]/g, '_')
    .slice(0, 180) || 'devis.pdf'
}

/**
 * @returns {Promise<string>} Public URL path (/uploads/devis-pdf/...)
 */
export async function saveDevisPdfBuffer({ devisId, filename, buffer }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('PDF buffer required')
  }
  const id = Number(devisId)
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('devisId required')
  }
  const safeName = safePdfFilename(filename)
  const folder = join(DEVIS_PDF_DIR, String(id))
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, safeName), buffer)
  return `/uploads/devis-pdf/${id}/${encodeURIComponent(safeName).replace(/%20/g, ' ')}`
}

/**
 * @param {import('mysql2/promise').Pool} db
 */
export async function persistDevisPdfPaths(db, { devisId, versionId, relativePath }) {
  const id = Number(devisId)
  if (!relativePath || !Number.isInteger(id) || id < 1) return
  await db.query(
    `UPDATE devis SET pdf_path = ?, status = CASE WHEN status IN ('draft', 'analysis', 'editing') THEN 'generated' ELSE status END WHERE id = ?`,
    [relativePath, id]
  )
  const vId = Number(versionId)
  if (Number.isInteger(vId) && vId > 0) {
    await db.query('UPDATE devis_versions SET pdf_path = ? WHERE id = ? AND devis_id = ?', [relativePath, vId, id])
  }
}
