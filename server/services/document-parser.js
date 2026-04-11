/**
 * document-parser.js
 * Extrait le texte et convertit chaque page en image JPEG (base64)
 * depuis un fichier PDF ou une image directe.
 *
 * Dépendances système : poppler-utils (pdftoppm, pdftotext)
 * npm : pdf-parse, sharp
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const execFileAsync = promisify(execFile)

// ── Helpers ────────────────────────────────────────────────────────────────

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'docparse-'))
}

async function cleanup(dir) {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => { })
}

/**
 * Lire un fichier et le retourner en data URI base64.
 */
async function fileToBase64DataUri(filePath, mimeType) {
  const buf = await fs.readFile(filePath)
  return `data:${mimeType};base64,${buf.toString('base64')}`
}

// ── PDF ────────────────────────────────────────────────────────────────────

/**
 * Compter les pages d'un PDF via pdfinfo.
 */
async function getPdfPageCount(pdfPath) {
  try {
    const { stdout } = await execFileAsync('pdfinfo', [pdfPath])
    const m = stdout.match(/Pages:\s+(\d+)/i)
    return m ? parseInt(m[1], 10) : 1
  } catch {
    return 1
  }
}

/**
 * Extraire le texte brut d'un PDF (une chaîne par page via pdftotext -f -l).
 * Retourne un tableau de strings (index = page-1).
 */
async function extractPdfText(pdfPath, pageCount) {
  const pages = []
  for (let p = 1; p <= pageCount; p++) {
    try {
      const { stdout } = await execFileAsync('pdftotext', [
        '-f', String(p),
        '-l', String(p),
        pdfPath,
        '-',
      ])
      pages.push(stdout.trim())
    } catch {
      pages.push('')
    }
  }
  return pages
}

/**
 * Convertir les pages PDF en images JPEG base64 via pdftoppm.
 * Retourne un tableau de data URI base64 (index = page-1).
 */
async function pdfPagesToImages(pdfPath, pageCount, dpi = 150) {
  const tmpDir = await makeTmpDir()
  try {
    await execFileAsync('pdftoppm', [
      '-jpeg',
      '-r', String(dpi),
      '-f', '1',
      '-l', String(pageCount),
      pdfPath,
      path.join(tmpDir, 'page'),
    ])

    const files = (await fs.readdir(tmpDir))
      .filter((f) => f.startsWith('page') && f.endsWith('.jpg'))
      .sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10)
        const numB = parseInt(b.replace(/\D/g, ''), 10)
        return numA - numB
      })

    const images = await Promise.all(
      files.map((f) => fileToBase64DataUri(path.join(tmpDir, f), 'image/jpeg'))
    )
    return images
  } finally {
    await cleanup(tmpDir)
  }
}

// ── Entrée publique ────────────────────────────────────────────────────────

/**
 * Analyser un fichier et retourner les pages prêtes pour le pipeline.
 *
 * @param {string} filePath  Chemin absolu du fichier
 * @param {string} mimeType  MIME type reçu à l'upload
 * @returns {Promise<{ pageCount: number, pages: Array<{ pageNumber: number, text: string, imageDataUri: string }> }>}
 */
export async function parseDocument(filePath, mimeType) {
  const isPdf = mimeType === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf')

  if (isPdf) {
    const pageCount = await getPdfPageCount(filePath)
    const [texts, images] = await Promise.all([
      extractPdfText(filePath, pageCount),
      pdfPagesToImages(filePath, pageCount),
    ])

    const pages = Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1,
      text: texts[i] || '',
      imageDataUri: images[i] || null,
    }))

    return { pageCount, pages }
  }

  // Image directe (jpeg, png, webp, gif…)
  const imageDataUri = await fileToBase64DataUri(filePath, mimeType)
  return {
    pageCount: 1,
    pages: [{ pageNumber: 1, text: '', imageDataUri }],
  }
}
