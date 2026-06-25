/**
 * Translate PDF line designations (FR source) into EN / DE at render time.
 * Preserves dimensions, references, RAL/NCS codes, site names and product refs.
 */
import { normalizePdfLanguage } from './pdf-labels.js'
import { applyCachedCustomPdfTranslations } from '../services/pdf-translation-dictionary.js'

/** @typedef {[RegExp, string | ((...args: string[]) => string)]} TranslationRule */

/** @type {Record<'en'|'de', TranslationRule[]>} */
const LINE_RULES = {
  en: [
    [/^GUICHET DE FACADE( FB\d)?(.*)$/i, (_, fb = '', rest = '') => `FACADE HATCH${fb}${rest}`],
    [/^Guichet de façade( FB\d)?(.*)$/i, (_, fb = '', rest = '') => `Facade hatch${fb}${rest}`],
    [/^avec interphone,\s*finition inox$/i, 'with intercom, stainless steel finish'],
    [/^finition inox$/i, 'stainless steel finish'],
    [/^Dimensions L (\d+) x P (\d+) x H (\d+), poids approximatif (\d+) kg$/i,
      (_, l, p, h, kg) => `Dimensions W ${l} x D ${p} x H ${h}, approximate weight ${kg} kg`],
    [/^BLOC-PORTE "NEXUS" DEUX VANTAUX$/i, 'DOOR SET "NEXUS" DOUBLE LEAF'],
    [/^BLOC-PORTE "NEXUS" UN VANTAIL$/i, 'DOOR SET "NEXUS" SINGLE LEAF'],
    [/^CHASSIS FIXE "NEXUS"$/i, 'FIXED FRAME "NEXUS"'],
    [/^Performances coupe-feu EI²?\s*(\d+)\s*minutes recto\/verso$/i,
      (_, m) => `Fire resistance performance EI² ${m} minutes both sides`],
    [/^Classement anti-effraction niveau (CR\d+) selon normes EN 1627 - 1630$/i,
      (_, cr) => `Burglar resistance class ${cr} per EN 1627 - 1630`],
    [/^Performances pare-balle (FB\d+) selon norme EN 1522$/i,
      (_, fb) => `Bullet resistance performance ${fb} per EN 1522`],
    [/^Classement anti-explosion ([\d.]+\s*t\/m²) sur note de calcul$/i,
      (_, v) => `Explosion resistance class ${v} per calculation note`],
    [/^Affaiblissement acoustique (\d+\s*dB) sur attestation$/i,
      (_, db) => `Sound reduction ${db} per certificate`],
    [/^Sans classement de résistance au feu$/i, 'No fire resistance rating'],
    [/^Coefficient de transmission thermique Uw\s*=\s*(.+)$/i, (_, v) => `Thermal transmittance Uw = ${v}`],
    [/^Vantail en tôle épaisseur 20\/10° double face$/i, 'Leaf in 20/10° sheet steel, double-sided'],
    [/^Profilés acier série froide$/i, 'Cold-formed steel profiles'],
    [/^Dimensions sur mesure\s*:\s*L\s*(\d+)\s*H\s*(\d+)\s*Passage libre à 90°$/i,
      (_, l, h) => `Custom dimensions: W ${l} H ${h} Clear opening at 90°`],
    [/^Dimensions sur mesure\s*:\s*L\s*(\d+)\s*H\s*(\d+)\s*Clair de vitrage$/i,
      (_, l, h) => `Custom dimensions: W ${l} H ${h} Glazing clear opening`],
    [/^Soit dimensions hors-tout\s*:\s*L\s*(\d+)\s*H\s*(\d+)/i, (_, l, h) => `Overall dimensions: W ${l} H ${h}`],
    [/^Dimensions hors-tout\s*:\s*L\s*(\d+)\s*H\s*(\d+)/i, (_, l, h) => `Overall dimensions: W ${l} H ${h}`],
    [/^Réservation gros[-\s]?(?:œuvre|oeuvre) prévoir\s*:\s*L\s*(\d+)\s*H\s*(\d+)/i,
      (_, l, h) => `Structural opening to allow: W ${l} H ${h}`],
    [/^Remplissage par (.+)$/i, (_, label) => `Infill: ${label}`],
    [/^Finition\s*:\s*acier galvanisé \+ thermolaquage teinte (.+) - à préciser pour faisabilité$/i,
      (_, shade) => `Finish: galvanized steel + powder coating shade ${shade} - subject to feasibility`],
    [/^Finition\s*:\s*acier galvanisé \+ thermolaquage RAL\/NCS$/i, 'Finish: galvanized steel + powder coating RAL/NCS'],
    [/^Equipement fourni-posé\s*:$/i, 'Equipment supplied and fitted:'],
    [/^Localisation\s*:\s*(.+)$/i, (_, place) => `Location: ${place}`],
    [/^Performance coupe-feu complémentaire$/i, 'Complementary fire performance'],
    [/^Protection pare-balles complémentaire$/i, 'Complementary bullet protection'],
    [/^Renfort anti-effraction complémentaire$/i, 'Complementary anti-burglary reinforcement'],
    [/^Thermolaquage RAL\/NCS$/i, 'Powder coating RAL/NCS'],
    [/^Poids approximatif(?:\s*-\s*Vantail)?\s*:\s*(.+)$/i, (_, v) => `Approximate weight - leaf: ${v}`],
    [/^Serrure\s*:\s*(.+)$/i, (_, v) => `Lock: ${v}`],
    [/^NOTA$/i, 'NOTE'],
    [/^VARIANTE$/i, 'VARIANT'],
    [/^OPTION$/i, 'OPTION'],
    [/^SPÉCIFICITÉ$/i, 'SPECIFICITY'],
    [/^SPECIFICITE$/i, 'SPECIFICITY'],
    [/^PRÉCISION$/i, 'PRECISION'],
    [/^PRECISION$/i, 'PRECISION'],
    [/^Frais de port$/i, 'Delivery charges'],
    [/^Avis de chantier \/ note de calcul$/i, 'Site notice / calculation note'],
    [/^Avis \/ note de calcul$/i, 'Notice / calculation note'],
    [/^-\s*Serrure\s*[—-]\s*(.+)$/i, (_, v) => `- Lock — ${v}`],
    [/^-\s*Garniture intérieure\s*[—-]\s*(.+)$/i, (_, v) => `- Interior trim — ${v}`],
    [/^-\s*Garniture extérieure\s*[—-]\s*(.+)$/i, (_, v) => `- Exterior trim — ${v}`],
    [/^-\s*Garniture double\s*[—-]\s*(.+)$/i, (_, v) => `- Double trim — ${v}`],
    [/^-\s*Crémone\s*[—-]\s*(.+)$/i, (_, v) => `- Espagnolette — ${v}`],
    [/^-\s*Ferme-porte\s*[—-]\s*(.+)$/i, (_, v) => `- Door closer — ${v}`],
    [/^-\s*Judas\s*\/\s*œilleton\s*[—-]\s*(.+)$/i, (_, v) => `- Viewer / peephole — ${v}`],
    [/^-\s*Plinthe automatique\s*[—-]\s*(.+)$/i, (_, v) => `- Automatic door bottom — ${v}`],
  ],
  de: [
    [/^GUICHET DE FACADE( FB\d)?(.*)$/i, (_, fb = '', rest = '') => `FAZADENLUKE${fb}${rest}`],
    [/^Guichet de façade( FB\d)?(.*)$/i, (_, fb = '', rest = '') => `Fassadenluke${fb}${rest}`],
    [/^avec interphone,\s*finition inox$/i, 'mit Intercom, Edelstahl-Oberfläche'],
    [/^finition inox$/i, 'Edelstahl-Oberfläche'],
    [/^Dimensions L (\d+) x P (\d+) x H (\d+), poids approximatif (\d+) kg$/i,
      (_, l, p, h, kg) => `Abmessungen B ${l} x T ${p} x H ${h}, ungefähres Gewicht ${kg} kg`],
    [/^BLOC-PORTE "NEXUS" DEUX VANTAUX$/i, 'TÜRELEMENT "NEXUS" ZWEIFLÜGELIG'],
    [/^BLOC-PORTE "NEXUS" UN VANTAIL$/i, 'TÜRELEMENT "NEXUS" EINFLÜGELIG'],
    [/^CHASSIS FIXE "NEXUS"$/i, 'FESTER RAHMEN "NEXUS"'],
    [/^Performances coupe-feu EI²?\s*(\d+)\s*minutes recto\/verso$/i,
      (_, m) => `Brandschutzleistung EI² ${m} Minuten beidseitig`],
    [/^Classement anti-effraction niveau (CR\d+) selon normes EN 1627 - 1630$/i,
      (_, cr) => `Einbruchhemmung Klasse ${cr} gemäß EN 1627 - 1630`],
    [/^Performances pare-balle (FB\d+) selon norme EN 1522$/i,
      (_, fb) => `Kugelsicherheitsleistung ${fb} gemäß EN 1522`],
    [/^Classement anti-explosion ([\d.]+\s*t\/m²) sur note de calcul$/i,
      (_, v) => `Explosionsschutzklasse ${v} laut Berechnungsnotiz`],
    [/^Affaiblissement acoustique (\d+\s*dB) sur attestation$/i,
      (_, db) => `Schalldämmung ${db} laut Bescheinigung`],
    [/^Sans classement de résistance au feu$/i, 'Keine Feuerwiderstandsklassifizierung'],
    [/^Coefficient de transmission thermique Uw\s*=\s*(.+)$/i, (_, v) => `Wärmedurchgangskoeffizient Uw = ${v}`],
    [/^Vantail en tôle épaisseur 20\/10° double face$/i, 'Flügel aus 20/10° Blech, beidseitig'],
    [/^Profilés acier série froide$/i, 'Kaltprofil-Stahl'],
    [/^Dimensions sur mesure\s*:\s*L\s*(\d+)\s*H\s*(\d+)\s*Passage libre à 90°$/i,
      (_, l, h) => `Maßanfertigung: B ${l} H ${h} Lichtes Maß bei 90°`],
    [/^Dimensions sur mesure\s*:\s*L\s*(\d+)\s*H\s*(\d+)\s*Clair de vitrage$/i,
      (_, l, h) => `Maßanfertigung: B ${l} H ${h} Glaslicht`],
    [/^Soit dimensions hors-tout\s*:\s*L\s*(\d+)\s*H\s*(\d+)/i, (_, l, h) => `Außenmaße: B ${l} H ${h}`],
    [/^Dimensions hors-tout\s*:\s*L\s*(\d+)\s*H\s*(\d+)/i, (_, l, h) => `Außenmaße: B ${l} H ${h}`],
    [/^Réservation gros[-\s]?(?:œuvre|oeuvre) prévoir\s*:\s*L\s*(\d+)\s*H\s*(\d+)/i,
      (_, l, h) => `Rohbauöffnung vorsehen: B ${l} H ${h}`],
    [/^Remplissage par (.+)$/i, (_, label) => `Füllung: ${label}`],
    [/^Finition\s*:\s*acier galvanisé \+ thermolaquage teinte (.+) - à préciser pour faisabilité$/i,
      (_, shade) => `Oberfläche: verzinkter Stahl + Pulverbeschichtung Farbton ${shade} - Machbarkeit zu prüfen`],
    [/^Finition\s*:\s*acier galvanisé \+ thermolaquage RAL\/NCS$/i, 'Oberfläche: verzinkter Stahl + Pulverbeschichtung RAL/NCS'],
    [/^Equipement fourni-posé\s*:$/i, 'Mitgelieferte und montierte Ausstattung:'],
    [/^Localisation\s*:\s*(.+)$/i, (_, place) => `Standort: ${place}`],
    [/^Performance coupe-feu complémentaire$/i, 'Ergänzende Brandschutzleistung'],
    [/^Protection pare-balles complémentaire$/i, 'Ergänzender Kugelschutz'],
    [/^Renfort anti-effraction complémentaire$/i, 'Ergänzende Einbruchhemmung'],
    [/^Thermolaquage RAL\/NCS$/i, 'Pulverbeschichtung RAL/NCS'],
    [/^Poids approximatif(?:\s*-\s*Vantail)?\s*:\s*(.+)$/i, (_, v) => `Ungefähres Gewicht - Flügel: ${v}`],
    [/^Serrure\s*:\s*(.+)$/i, (_, v) => `Schloss: ${v}`],
    [/^NOTA$/i, 'HINWEIS'],
    [/^VARIANTE$/i, 'VARIANTE'],
    [/^OPTION$/i, 'OPTION'],
    [/^SPÉCIFICITÉ$/i, 'SPEZIFIKATION'],
    [/^SPECIFICITE$/i, 'SPEZIFIKATION'],
    [/^PRÉCISION$/i, 'PRÄZISIERUNG'],
    [/^PRECISION$/i, 'PRÄZISIERUNG'],
    [/^Frais de port$/i, 'Versandkosten'],
    [/^Avis de chantier \/ note de calcul$/i, 'Baustellenhinweis / Berechnungsnotiz'],
    [/^Avis \/ note de calcul$/i, 'Hinweis / Berechnungsnotiz'],
    [/^-\s*Serrure\s*[—-]\s*(.+)$/i, (_, v) => `- Schloss — ${v}`],
    [/^-\s*Garniture intérieure\s*[—-]\s*(.+)$/i, (_, v) => `- Innengarnitur — ${v}`],
    [/^-\s*Garniture extérieure\s*[—-]\s*(.+)$/i, (_, v) => `- Außengarnitur — ${v}`],
    [/^-\s*Garniture double\s*[—-]\s*(.+)$/i, (_, v) => `- Doppelgarnitur — ${v}`],
    [/^-\s*Crémone\s*[—-]\s*(.+)$/i, (_, v) => `- Espagnolette — ${v}`],
    [/^-\s*Ferme-porte\s*[—-]\s*(.+)$/i, (_, v) => `- Türschließer — ${v}`],
    [/^-\s*Judas\s*\/\s*œilleton\s*[—-]\s*(.+)$/i, (_, v) => `- Spion / Türspion — ${v}`],
    [/^-\s*Plinthe automatique\s*[—-]\s*(.+)$/i, (_, v) => `- Automatische Türschwelle — ${v}`],
  ],
}

const FRAGMENT_REPLACEMENTS = {
  en: [
    [/Remplissage par /gi, 'Infill: '],
    [/Passage libre à 90°/gi, 'Clear opening at 90°'],
    [/Clair de vitrage/gi, 'Glazing clear opening'],
    [/Dimensions hors-tout/gi, 'Overall dimensions'],
    [/Dimensions sur mesure/gi, 'Custom dimensions'],
    [/Réservation gros[-\s]?(?:œuvre|oeuvre)/gi, 'Structural opening'],
    [/prévoir\s*:/gi, 'to allow:'],
    [/Equipement fourni-posé/gi, 'Equipment supplied and fitted'],
    [/Localisation\s*:/gi, 'Location:'],
    [/Poids approximatif/gi, 'Approximate weight'],
    [/acier galvanisé \+ thermolaquage/gi, 'galvanized steel + powder coating'],
    [/à préciser pour faisabilité/gi, 'subject to feasibility'],
    [/sur attestation/gi, 'per certificate'],
    [/sur note de calcul/gi, 'per calculation note'],
    [/recto\/verso/gi, 'both sides'],
    [/minutes/gi, 'minutes'],
    [/selon normes/gi, 'per standards'],
    [/selon norme/gi, 'per standard'],
    [/niveau/gi, 'class'],
    [/Performances coupe-feu/gi, 'Fire resistance performance'],
    [/Classement anti-effraction/gi, 'Burglar resistance class'],
    [/Performances pare-balle/gi, 'Bullet resistance performance'],
    [/Classement anti-explosion/gi, 'Explosion resistance class'],
    [/Affaiblissement acoustique/gi, 'Sound reduction'],
    [/Garniture intérieure/gi, 'Interior trim'],
    [/Garniture extérieure/gi, 'Exterior trim'],
    [/Garniture double/gi, 'Double trim'],
    [/Ferme-porte/gi, 'Door closer'],
    [/Crémone/gi, 'Espagnolette'],
    [/Serrure/gi, 'Lock'],
    [/Vitrage/gi, 'Glazing'],
    [/Remplissage/gi, 'Infill'],
    [/Finition\s*:/gi, 'Finish:'],
    [/un vantail/gi, 'single leaf'],
    [/deux vantaux/gi, 'double leaf'],
    [/intérieure/gi, 'interior'],
    [/extérieure/gi, 'exterior'],
    [/mécanique/gi, 'mechanical'],
    [/points/gi, 'points'],
  ],
  de: [
    [/Remplissage par /gi, 'Füllung: '],
    [/Passage libre à 90°/gi, 'Lichtes Maß bei 90°'],
    [/Clair de vitrage/gi, 'Glaslicht'],
    [/Dimensions hors-tout/gi, 'Außenmaße'],
    [/Dimensions sur mesure/gi, 'Maßanfertigung'],
    [/Réservation gros[-\s]?(?:œuvre|oeuvre)/gi, 'Rohbauöffnung'],
    [/prévoir\s*:/gi, 'vorsehen:'],
    [/Equipement fourni-posé/gi, 'Mitgelieferte und montierte Ausstattung'],
    [/Localisation\s*:/gi, 'Standort:'],
    [/Poids approximatif/gi, 'Ungefähres Gewicht'],
    [/acier galvanisé \+ thermolaquage/gi, 'verzinkter Stahl + Pulverbeschichtung'],
    [/à préciser pour faisabilité/gi, 'Machbarkeit zu prüfen'],
    [/sur attestation/gi, 'laut Bescheinigung'],
    [/sur note de calcul/gi, 'laut Berechnungsnotiz'],
    [/recto\/verso/gi, 'beidseitig'],
    [/Performances coupe-feu/gi, 'Brandschutzleistung'],
    [/Classement anti-effraction/gi, 'Einbruchhemmung Klasse'],
    [/Performances pare-balle/gi, 'Kugelsicherheitsleistung'],
    [/Classement anti-explosion/gi, 'Explosionsschutzklasse'],
    [/Affaiblissement acoustique/gi, 'Schalldämmung'],
    [/Garniture intérieure/gi, 'Innengarnitur'],
    [/Garniture extérieure/gi, 'Außengarnitur'],
    [/Garniture double/gi, 'Doppelgarnitur'],
    [/Ferme-porte/gi, 'Türschließer'],
    [/Crémone/gi, 'Espagnolette'],
    [/Serrure/gi, 'Schloss'],
    [/Vitrage/gi, 'Verglasung'],
    [/Remplissage/gi, 'Füllung'],
    [/Finition\s*:/gi, 'Oberfläche:'],
    [/un vantail/gi, 'einflügelig'],
    [/deux vantaux/gi, 'zweiflügelig'],
    [/intérieure/gi, 'innen'],
    [/extérieure/gi, 'außen'],
    [/mécanique/gi, 'mechanisch'],
  ],
}

function applyLineRules(text, lang) {
  const rules = LINE_RULES[lang] || []
  for (const [pattern, repl] of rules) {
    if (!pattern.test(text)) continue
    if (typeof repl === 'function') {
      return text.replace(pattern, (...args) => repl(...args))
    }
    return text.replace(pattern, repl)
  }
  return text
}

function applyFragmentReplacements(text, lang) {
  let out = text
  for (const [pattern, repl] of FRAGMENT_REPLACEMENTS[lang] || []) {
    out = out.replace(pattern, repl)
  }
  return out
}

/**
 * Translate one designation line from FR to target language.
 * @param {string} line
 * @param {string} language
 */
export function translatePdfDesignationLine(line, language) {
  const lang = normalizePdfLanguage(language)
  const text = String(line || '').trim()
  if (!text || lang === 'fr') return text
  const ruled = applyLineRules(text, lang)
  const base = ruled !== text ? ruled : text
  const fragmented = applyFragmentReplacements(base, lang)
  return applyCachedCustomPdfTranslations(fragmented, lang)
}

/**
 * Translate a multi-line PDF designation block.
 * @param {string} designation
 * @param {string} language
 */
export function translatePdfDesignationMultiline(designation, language) {
  const lang = normalizePdfLanguage(language)
  const raw = String(designation || '')
  if (!raw || lang === 'fr') return raw
  return raw
    .split('\n')
    .map((line) => translatePdfDesignationLine(line, lang))
    .join('\n')
}

export function resolvePdfLineDesignation(line = {}, language = 'fr') {
  const lang = normalizePdfLanguage(language)
  const i18n = line.designation_pdf_i18n && typeof line.designation_pdf_i18n === 'object'
    ? line.designation_pdf_i18n
    : {}
  if (lang !== 'fr' && i18n[lang]) return String(i18n[lang])
  if (lang === 'fr') return String(line.designation_pdf || line.designation || '')
  const base = String(line.designation || line.designation_pdf || '')
  return translatePdfDesignationMultiline(base, lang)
}

/**
 * Short labels used in PDF row fallbacks (passage dims, lock, etc.)
 */
export function pdfPassageDimLabel({ label, h, l, language }) {
  const lang = normalizePdfLanguage(language)
  const height = Number(h)
  const width = Number(l)
  if (!Number.isFinite(height) || !Number.isFinite(width) || height <= 0 || width <= 0) return ''
  if (lang === 'en') {
    const kind = String(label || '').toUpperCase() === 'CV' ? 'Glazing clear opening' : 'Clear opening at 90°'
    return `${kind} H${height}×W${width} mm`
  }
  if (lang === 'de') {
    const kind = String(label || '').toUpperCase() === 'CV' ? 'Glaslicht' : 'Lichtes Maß bei 90°'
    return `${kind} H${height}×B${width} mm`
  }
  const kind = String(label || '').toUpperCase() === 'CV' ? 'CV' : 'PL'
  return `${kind} H${height}×L${width} mm`
}

export function pdfReservationDimLabel({ h, l, language }) {
  const lang = normalizePdfLanguage(language)
  const height = Number(h)
  const width = Number(l)
  if (!Number.isFinite(height) || !Number.isFinite(width) || height <= 0 || width <= 0) return ''
  if (lang === 'en') return `Structural opening H${height}×W${width} mm`
  if (lang === 'de') return `Rohbauöffnung H${height}×B${width} mm`
  return `Réservation GO H${height}×L${width} mm`
}

export function pdfLockLabel(ref, language) {
  const lang = normalizePdfLanguage(language)
  const value = String(ref || '').trim()
  if (!value) return ''
  if (lang === 'en') return `Lock: ${value}`
  if (lang === 'de') return `Schloss: ${value}`
  return `Serrure : ${value}`
}
