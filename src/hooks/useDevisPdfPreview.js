import { useState, useEffect, useMemo } from 'react'
import { normalizePdfLanguage } from '../lib/pdfLanguages.js'
import api from '../api/index.js'

/**
 * Live PDF preview for a devis (carrosserie labels follow pdfLanguage).
 */
export function useDevisPdfPreview({
  devisId,
  versionId,
  lines = [],
  pdfLanguage: initialPdfLanguage = 'fr',
  debounceMs = 700,
}) {
  const [pdfLanguage, setPdfLanguage] = useState(normalizePdfLanguage(initialPdfLanguage))
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null)
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false)

  useEffect(() => {
    setPdfLanguage(normalizePdfLanguage(initialPdfLanguage))
  }, [initialPdfLanguage])

  const previewLabels = useMemo(
    () => lines.filter((line) => line?.id).map((line) => ({
      line_id: line.id,
      designation_pdf: line.designation || null,
    })),
    [lines]
  )
  const previewLabelsKey = useMemo(() => JSON.stringify(previewLabels), [previewLabels])

  useEffect(() => {
    if (!devisId) return undefined
    let alive = true
    const timer = window.setTimeout(() => {
      setPdfPreviewLoading(true)
      const token = localStorage.getItem('token')
      api.post(`/devis/${devisId}/pdf-preview`, {
        version_id: versionId || null,
        labels: previewLabels,
        pdf_language: pdfLanguage,
      }, {
        responseType: 'blob',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 120000,
      }).then((blob) => {
        if (!alive || !(blob instanceof Blob)) return
        setPdfPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(blob)
        })
      }).catch(() => {}).finally(() => {
        if (alive) setPdfPreviewLoading(false)
      })
    }, debounceMs)
    return () => {
      alive = false
      window.clearTimeout(timer)
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [devisId, pdfLanguage, previewLabelsKey, versionId, debounceMs])

  return { pdfLanguage, setPdfLanguage, pdfPreviewUrl, pdfPreviewLoading }
}
