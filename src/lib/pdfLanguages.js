/** PDF document language options (devis commercial). */
export const PDF_LANGUAGE_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
]

export function normalizePdfLanguage(value) {
  const lang = String(value || 'fr').trim().toLowerCase()
  return PDF_LANGUAGE_OPTIONS.some((item) => item.value === lang) ? lang : 'fr'
}
