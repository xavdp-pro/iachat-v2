/**
 * PDF devis template labels — FR / EN / DE (carrosserie + structural designation phrases).
 */

export const PDF_LANGUAGES = ['fr', 'en', 'de']

export function normalizePdfLanguage(value) {
  const lang = String(value || 'fr').trim().toLowerCase()
  return PDF_LANGUAGES.includes(lang) ? lang : 'fr'
}

const LABELS = {
  fr: {
    htmlLang: 'fr',
    dateLocale: 'fr-FR',
    docLabel: 'Devis',
    quoteTitle: 'Devis n°',
    deliveryAddress: 'Adresse de livraison',
    billingAddress: 'Adresse de facturation',
    date: 'Date :',
    affair: 'Affaire :',
    reference: 'Réf. :',
    contact: 'Contact :',
    defaultContact: 'Votre commercial Zerux',
    colRep: 'Rép.',
    colDesc: 'Désignation',
    colQty: 'Q.',
    colUnit: 'P.U. HT',
    colTotal: 'Total HT',
    emptyLines: 'Aucune ligne renseignée.',
    localisation: 'Localisation :',
    nota: 'NOTA',
    weightApprox: 'Poids approximatif - Vantail :',
    weightPerLeaf: 'kg/m² par ouvrant :',
    leaves: 'ouvrants',
    totalHt: 'Total HT :',
    commercialDiscount: 'Geste commercial HT',
    totalTtc: 'Total TTC :',
    totalTtcStrong: 'Total TTC :',
    ecoContribution: 'Total éco-contribution :',
    estimatedWeight: 'Poids estimé total :',
    amountSuffixHt: ' HT',
    grandTotalHt: 'Montant Total HT',
    grandTotalHtIn: (unit) => `Montant Total HT (en ${unit})`,
    footerGrandTotal: 'MONTANT TOTAL HT',
    page: 'Page',
    paymentTerms: 'Conditions de règlement :',
    paymentTermsValue: '30 jours fin de mois le 10 par chèque',
    deliveryDelay: 'Délai de livraison :',
    deliveryDelayValue: 'Suivant accord à la commande',
    cgv: "Toute commande confiée à Zerux implique l'acceptation sans réserve de nos conditions générales de vente.",
    quoteValidity: 'Validité du devis : 6 semaines',
    signatureTitle: 'Bon pour accord, le :',
    stampSignature: 'CACHET ET SIGNATURE',
    tvaDeductible: (rate) => `TVA déductible (achat) ${rate} %`,
    tva: (rate) => `TVA ${rate} %`,
    currencyUnits: { EUR: 'EUROS', CHF: 'FRANCS SUISSES', GBP: 'LIVRES STERLING', USD: 'DOLLARS US' },
    designation: {
      blocPorte1V: 'BLOC-PORTE "NEXUS" UN VANTAIL',
      blocPorte2V: 'BLOC-PORTE "NEXUS" DEUX VANTAUX',
      chassis: 'CHASSIS FIXE "NEXUS"',
      leafSheet: 'Vantail en tôle épaisseur 20/10° double face',
      coldProfile: 'Profilés acier série froide',
      customDimsDoor: (l, h) => `Dimensions sur mesure : L ${l} H ${h} Passage libre à 90°`,
      customDimsChassis: (l, h) => `Dimensions sur mesure : L ${l} H ${h} Clair de vitrage`,
      outsideDims: (l, h) => `Dimensions hors-tout : L ${l} H ${h}`,
      reservation: (l, h) => `Réservation gros-oeuvre prévoir : L ${l} H ${h}`,
      filling: (label) => `Remplissage par ${label}`,
      equipmentHead: 'Equipement fourni-posé :',
      localisation: (value) => `Localisation : ${value}`,
      facade: 'GUICHET DE FACADE',
    },
    bodyMatchers: [
      { class: 'line-strong', patterns: [/^Dimensions\s+sur\s+mesure\s*:/i] },
      { class: 'line-body-row', patterns: [/^Dimensions\s+hors[-\s]tout\s*:/i, /^Soit dimensions hors[-\s]tout\s*:/i, /^Réservation gros[-\s]?œuvre/i, /^Poids approximatif/i] },
      { class: 'line-equipment-head', patterns: [/^Equipement fourni-posé\s*:/i, /^Equipment supplied/i, /^Mitgelieferte Ausstattung/i] },
      { class: 'line-bullet', patterns: [/^-\s+/] },
      { class: 'line-localisation-inline', patterns: [/^Localisation\s*:/i, /^Location\s*:/i, /^Standort\s*:/i, /^Lokalisation\s*:/i] },
      { class: 'line-note-strong', patterns: [/^(?:NOTA|VARIANTE|OPTION|SP[ÉE]CIFICIT[ÉE]|PR[ÉE]CISION)\b/i, /^\d{1,3}\s*DB\s+MAXI/i] },
    ],
  },
  en: {
    htmlLang: 'en',
    dateLocale: 'en-GB',
    docLabel: 'Quotation',
    quoteTitle: 'Quotation no.',
    deliveryAddress: 'Delivery address',
    billingAddress: 'Billing address',
    date: 'Date:',
    affair: 'Project:',
    reference: 'Ref.:',
    contact: 'Contact:',
    defaultContact: 'Your Zerux sales contact',
    colRep: 'Item',
    colDesc: 'Description',
    colQty: 'Qty',
    colUnit: 'Unit price ex. VAT',
    colTotal: 'Total ex. VAT',
    emptyLines: 'No lines entered.',
    localisation: 'Location:',
    nota: 'NOTE',
    weightApprox: 'Approximate weight - leaf:',
    weightPerLeaf: 'kg/m² per leaf:',
    leaves: 'leaves',
    totalHt: 'Total ex. VAT:',
    commercialDiscount: 'Commercial discount ex. VAT',
    totalTtc: 'Total incl. VAT:',
    totalTtcStrong: 'Total incl. VAT:',
    ecoContribution: 'Total eco-contribution:',
    estimatedWeight: 'Estimated total weight:',
    amountSuffixHt: ' ex. VAT',
    grandTotalHt: 'Grand total ex. VAT',
    grandTotalHtIn: (unit) => `Grand total ex. VAT (in ${unit})`,
    footerGrandTotal: 'GRAND TOTAL EX. VAT',
    page: 'Page',
    paymentTerms: 'Payment terms:',
    paymentTermsValue: '30 days end of month, due on the 10th by cheque',
    deliveryDelay: 'Delivery time:',
    deliveryDelayValue: 'As agreed upon order',
    cgv: 'Any order placed with Zerux implies unreserved acceptance of our general terms and conditions of sale.',
    quoteValidity: 'Quotation validity: 6 weeks',
    signatureTitle: 'Approved on:',
    stampSignature: 'STAMP AND SIGNATURE',
    tvaDeductible: (rate) => `Deductible VAT (purchase) ${rate}%`,
    tva: (rate) => `VAT ${rate}%`,
    currencyUnits: { EUR: 'EUROS', CHF: 'SWISS FRANCS', GBP: 'POUNDS STERLING', USD: 'US DOLLARS' },
    designation: {
      blocPorte1V: 'DOOR SET "NEXUS" SINGLE LEAF',
      blocPorte2V: 'DOOR SET "NEXUS" DOUBLE LEAF',
      chassis: 'FIXED FRAME "NEXUS"',
      leafSheet: 'Leaf in 20/10° sheet steel, double-sided',
      coldProfile: 'Cold-formed steel profiles',
      customDimsDoor: (l, h) => `Custom dimensions: W ${l} H ${h} Clear opening at 90°`,
      customDimsChassis: (l, h) => `Custom dimensions: W ${l} H ${h} Glazing clear opening`,
      outsideDims: (l, h) => `Overall dimensions: W ${l} H ${h}`,
      reservation: (l, h) => `Structural opening to allow: W ${l} H ${h}`,
      filling: (label) => `Infill: ${label}`,
      equipmentHead: 'Equipment supplied and fitted:',
      localisation: (value) => `Location: ${value}`,
      facade: 'FACADE HATCH',
    },
    bodyMatchers: [
      { class: 'line-strong', patterns: [/^Custom dimensions\s*:/i, /^Dimensions\s+sur\s+mesure\s*:/i] },
      { class: 'line-body-row', patterns: [/^Overall dimensions\s*:/i, /^Dimensions hors[-\s]tout\s*:/i, /^Structural opening/i, /^Réservation gros/i, /^Approximate weight/i, /^Poids approximatif/i] },
      { class: 'line-equipment-head', patterns: [/^Equipment supplied and fitted\s*:/i, /^Equipement fourni-posé\s*:/i] },
      { class: 'line-bullet', patterns: [/^-\s+/] },
      { class: 'line-localisation-inline', patterns: [/^Location\s*:/i, /^Localisation\s*:/i, /^Standort\s*:/i] },
      { class: 'line-note-strong', patterns: [/^(?:NOTE|NOTA|VARIANT|OPTION|SPECIFICITY|PRECISION)\b/i, /^\d{1,3}\s*DB\s+MAXI/i] },
    ],
  },
  de: {
    htmlLang: 'de',
    dateLocale: 'de-DE',
    docLabel: 'Angebot',
    quoteTitle: 'Angebot Nr.',
    deliveryAddress: 'Lieferadresse',
    billingAddress: 'Rechnungsadresse',
    date: 'Datum:',
    affair: 'Projekt:',
    reference: 'Ref.:',
    contact: 'Kontakt:',
    defaultContact: 'Ihr Zerux Ansprechpartner',
    colRep: 'Pos.',
    colDesc: 'Bezeichnung',
    colQty: 'Mge',
    colUnit: 'EP exkl. MwSt.',
    colTotal: 'Summe exkl. MwSt.',
    emptyLines: 'Keine Positionen erfasst.',
    localisation: 'Standort:',
    nota: 'HINWEIS',
    weightApprox: 'Ungefähres Gewicht - Flügel:',
    weightPerLeaf: 'kg/m² pro Flügel:',
    leaves: 'Flügel',
    totalHt: 'Summe exkl. MwSt.:',
    commercialDiscount: 'Kulanz exkl. MwSt.',
    totalTtc: 'Summe inkl. MwSt.:',
    totalTtcStrong: 'Summe inkl. MwSt.:',
    ecoContribution: 'Gesamt Ökobeitrag:',
    estimatedWeight: 'Geschätztes Gesamtgewicht:',
    amountSuffixHt: ' exkl. MwSt.',
    grandTotalHt: 'Gesamtbetrag exkl. MwSt.',
    grandTotalHtIn: (unit) => `Gesamtbetrag exkl. MwSt. (in ${unit})`,
    footerGrandTotal: 'GESAMTBETRAG EXKL. MWST.',
    page: 'Seite',
    paymentTerms: 'Zahlungsbedingungen:',
    paymentTermsValue: '30 Tage Monatsende, am 10. per Scheck',
    deliveryDelay: 'Lieferzeit:',
    deliveryDelayValue: 'Nach Vereinbarung bei Bestellung',
    cgv: 'Jeder Auftrag an Zerux setzt die vorbehaltlose Annahme unserer allgemeinen Verkaufsbedingungen voraus.',
    quoteValidity: 'Angebotsgültigkeit: 6 Wochen',
    signatureTitle: 'Genehmigt am:',
    stampSignature: 'STEMPEL UND UNTERSCHRIFT',
    tvaDeductible: (rate) => `Abzugsfähige MwSt. (Einkauf) ${rate} %`,
    tva: (rate) => `MwSt. ${rate} %`,
    currencyUnits: { EUR: 'EURO', CHF: 'SCHWEIZER FRANKEN', GBP: 'PFUND STERLING', USD: 'US-DOLLAR' },
    designation: {
      blocPorte1V: 'TÜRELEMENT "NEXUS" EINFLÜGELIG',
      blocPorte2V: 'TÜRELEMENT "NEXUS" ZWEIFLÜGELIG',
      chassis: 'FESTER RAHMEN "NEXUS"',
      leafSheet: 'Flügel aus 20/10° Blech, beidseitig',
      coldProfile: 'Kaltprofil-Stahl',
      customDimsDoor: (l, h) => `Maßanfertigung: B ${l} H ${h} Lichtes Maß bei 90°`,
      customDimsChassis: (l, h) => `Maßanfertigung: B ${l} H ${h} Glaslicht`,
      outsideDims: (l, h) => `Außenmaße: B ${l} H ${h}`,
      reservation: (l, h) => `Rohbauöffnung vorsehen: B ${l} H ${h}`,
      filling: (label) => `Füllung: ${label}`,
      equipmentHead: 'Mitgelieferte und montierte Ausstattung:',
      localisation: (value) => `Standort: ${value}`,
      facade: 'FAZADENLUKE',
    },
    bodyMatchers: [
      { class: 'line-strong', patterns: [/^Maßanfertigung\s*:/i, /^Dimensions\s+sur\s+mesure\s*:/i, /^Custom dimensions\s*:/i] },
      { class: 'line-body-row', patterns: [/^Außenmaße\s*:/i, /^Overall dimensions\s*:/i, /^Dimensions hors[-\s]tout\s*:/i, /^Rohbauöffnung/i, /^Réservation gros/i, /^Ungefähres Gewicht/i, /^Poids approximatif/i, /^Approximate weight/i] },
      { class: 'line-equipment-head', patterns: [/^Mitgelieferte und montierte Ausstattung\s*:/i, /^Equipement fourni-posé\s*:/i, /^Equipment supplied/i] },
      { class: 'line-bullet', patterns: [/^-\s+/] },
      { class: 'line-localisation-inline', patterns: [/^Standort\s*:/i, /^Lokalisation\s*:/i, /^Location\s*:/i, /^Localisation\s*:/i] },
      { class: 'line-note-strong', patterns: [/^(?:HINWEIS|NOTA|NOTE|VARIANTE|OPTION|SPEZIFITÄT|SPEZIFIKATION)\b/i, /^\d{1,3}\s*DB\s+MAXI/i] },
    ],
  },
}

export function getPdfLabels(language) {
  return LABELS[normalizePdfLanguage(language)]
}

export function pdfCurrencyUnitLabel(currency, language) {
  const labels = getPdfLabels(language)
  const cur = String(currency || 'EUR').trim().toUpperCase()
  return labels.currencyUnits[cur] || labels.currencyUnits.EUR
}

/** Armand Hive template — SemiBold (600) only on title (separate), custom dims, and localisation. */
export const PDF_MEASUREMENT_HIGHLIGHT_PATTERNS = [
  /^Dimensions\s+sur\s+mesure\s*:/i,
  /^Custom dimensions\s*:/i,
  /^Maßanfertigung\s*:/i,
]

export const PDF_LOCALISATION_HIGHLIGHT_PATTERNS = [
  /^Localisation\s*:/i,
  /^Location\s*:/i,
  /^Standort\s*:/i,
  /^Lokalisation\s*:/i,
]

export function classifyPdfBodyLine(rawLine, language) {
  const line = String(rawLine || '').trim()
  if (!line) return { class: 'line-body-row' }

  if (PDF_MEASUREMENT_HIGHLIGHT_PATTERNS.some((pattern) => pattern.test(line))) {
    return { class: 'line-strong' }
  }
  if (PDF_LOCALISATION_HIGHLIGHT_PATTERNS.some((pattern) => pattern.test(line))) {
    return { class: 'line-localisation-inline' }
  }

  const { bodyMatchers } = getPdfLabels(language)
  for (const matcher of bodyMatchers) {
    if (matcher.class === 'line-strong' || matcher.class === 'line-localisation-inline') continue
    if (matcher.patterns.some((pattern) => pattern.test(line))) {
      return { class: matcher.class }
    }
  }
  return { class: 'line-body-row' }
}

export function composePdfItemDesignationI18n(line = {}, language = 'fr') {
  const phrases = getPdfLabels(language).designation
  const isGuichet = /guichet/i.test([line.type_porte, line.designation, line.gamme].filter(Boolean).join(' '))
  if (isGuichet) {
    const lines = [phrases.facade, String(line.designation || line.type || '').trim()].filter(Boolean)
    if (line.localisation) lines.push(phrases.localisation(String(line.localisation).trim()))
    return lines.join('\n')
  }
  const chassis = /ch[aâ]ssis|fixe/i.test([line.type_porte, line.designation, line.gamme].filter(Boolean).join(' '))
  const twoLeaf = /\b2\s*V\b|2\s*VANTAUX|DEUX\s+VANTAUX|DOUBLE\s+LEAF|ZWEIFLÜGELIG/i.test(
    [line.type_porte, line.type, line.designation, line.vantail].filter(Boolean).join(' ')
  )
  const out = [chassis ? phrases.chassis : (twoLeaf ? phrases.blocPorte2V : phrases.blocPorte1V)]
  out.push(chassis ? phrases.coldProfile : phrases.leafSheet)

  const widthHt = line.larg_mm || line.largeur_mm || line.largeur_ht_mm
  const heightHt = line.haut_mm || line.hauteur_mm || line.hauteur_ht_mm
  const widthPl = line.largeur_pl_mm
  const heightPl = line.hauteur_pl_mm
  if (widthPl != null && heightPl != null) {
    out.push(chassis ? phrases.customDimsChassis(widthPl, heightPl) : phrases.customDimsDoor(widthPl, heightPl))
  }
  if (widthHt != null && heightHt != null) {
    out.push(phrases.outsideDims(widthHt, heightHt))
    const reservationWidth = line.largeur_reservation_mm ?? (Number.isFinite(Number(widthHt)) ? Number(widthHt) + 10 : null)
    const reservationHeight = line.hauteur_reservation_mm ?? (Number.isFinite(Number(heightHt)) ? Number(heightHt) + 10 : null)
    if (reservationWidth != null && reservationHeight != null) out.push(phrases.reservation(reservationWidth, reservationHeight))
  }
  if (line.localisation) out.push(phrases.localisation(String(line.localisation).trim()))
  return out.filter(Boolean).join('\n')
}
