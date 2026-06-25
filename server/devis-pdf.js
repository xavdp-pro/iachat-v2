/**
 * HTML template + Playwright Chromium PDF — Devis commercial NEXUS.
 * Adapted from zeruxtech-v2/src/devis-pdf.js for iachat-v2 data model.
 *
 * Layout reference (compare generated PDF side-by-side when iterating):
 * `/apps/zeruxcom-v1/app/ressources/Extrait/N25-1018-16D_NEXUS GIRARD HERVOUET SAS.pdf`
 *
 * Exports:
 *   buildDevisNexusHtml(data)   → string (HTML)
 *   renderDevisPdfBuffer(html, opts) → Promise<Buffer>
 *   buildDevisNexusPdf(input)   → Promise<{ buffer: Buffer, filename: string }>
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyPdfBodyLine,
  getPdfLabels,
  normalizePdfLanguage,
  pdfCurrencyUnitLabel,
} from "./lib/pdf-labels.js";
import {
  translatePdfDesignationMultiline,
  resolvePdfLineDesignation,
  pdfPassageDimLabel,
  pdfReservationDimLabel,
  pdfLockLabel,
} from "./lib/pdf-designation-i18n.js";
import { insertWeightLineInDesignation } from "./lib/pdf-designation-order.js";
import { formatPdfWeightLine } from "./services/weight-calculator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_BRAND_HEX = "#3c4b4d";
/** Armand-validated Montserrat files (Jun 2026) — see ressources/260625/Modifs template.pdf */
const FONT_DIR_ARMAND = path.join(__dirname, "../../ressources/260625");
const FONT_DIR_LEGACY = path.join(__dirname, "../../ressources/Polices");

const ARMAND_FONT_FILES = new Set([
  "Montserrat-Regular.ttf",
  "Montserrat-SemiBold.ttf",
]);

function resolveFontPath(file) {
  if (ARMAND_FONT_FILES.has(file)) {
    const armandPath = path.join(FONT_DIR_ARMAND, file);
    if (fs.existsSync(armandPath)) return armandPath;
  }
  return path.join(FONT_DIR_LEGACY, file);
}

// ─── Font loading (cached at startup) ──────────────────────────────────────
function buildFontFacesCss() {
  const fonts = [
    { file: "Montserrat-Regular.ttf", family: "Montserrat", weight: "400", style: "normal", fmt: "truetype" },
    { file: "Montserrat-Bold.ttf", family: "Montserrat", weight: "700", style: "normal", fmt: "truetype" },
    { file: "Montserrat-Light.ttf", family: "Montserrat", weight: "300", style: "normal", fmt: "truetype" },
    { file: "Montserrat-SemiBold.ttf", family: "Montserrat", weight: "600", style: "normal", fmt: "truetype" },
    { file: "MinionPro-Regular.otf", family: "Minion Pro", weight: "400", style: "normal", fmt: "opentype" },
    { file: "nordick.otf", family: "Nordick", weight: "400", style: "normal", fmt: "opentype" },
  ];
  return fonts.map(f => {
    try {
      const b64 = fs.readFileSync(resolveFontPath(f.file)).toString("base64");
      return `@font-face{font-family:'${f.family}';src:url('data:font/${f.fmt};base64,${b64}') format('${f.fmt}');font-weight:${f.weight};font-style:${f.style};font-display:block;}`;
    } catch { return ""; }
  }).filter(Boolean).join("\n");
}

export const FONT_FACES_CSS = buildFontFacesCss();

function buildHiveFontFacesCss() {
  // Hive CHF: Montserrat only — omit Minion/Nordick (~300 KB) so Playwright footer can embed Regular.
  const fonts = [
    { file: "Montserrat-Regular.ttf", weight: "400" },
    { file: "Montserrat-Bold.ttf", weight: "700" },
    { file: "Montserrat-Light.ttf", weight: "300" },
    { file: "Montserrat-SemiBold.ttf", weight: "600" },
  ];
  return fonts.map(f => {
    try {
      const b64 = fs.readFileSync(resolveFontPath(f.file)).toString("base64");
      return `@font-face{font-family:'Montserrat';src:url('data:font/truetype;base64,${b64}') format('truetype');font-weight:${f.weight};font-style:normal;font-display:block;}`;
    } catch { return ""; }
  }).filter(Boolean).join("\n");
}

export const HIVE_FONT_FACES_CSS = buildHiveFontFacesCss();

function buildFooterFontFaceCss() {
  // Regular only (~29 KB) — matches reference footer legal text weight.
  try {
    const b64 = fs.readFileSync(resolveFontPath("Montserrat-Regular.ttf")).toString("base64");
    return `@font-face{font-family:'Montserrat Footer';src:url('data:font/truetype;base64,${b64}') format('truetype');font-weight:400;font-style:normal;font-display:block;}`;
  } catch {
    return "";
  }
}

const FOOTER_FONT_FACE_CSS = buildFooterFontFaceCss();

function buildHivePdfFooterTemplate(companyLine1, companyLine2, pageLabel = "Page") {
  // Playwright footer — Montserrat Regular 400 throughout (reference legal + page box).
  const line1 = escapeHtml(companyLine1 || "");
  const line2 = escapeHtml(companyLine2 || "");
  const footerFontCss = FOOTER_FONT_FACE_CSS
    ? `<style>${FOOTER_FONT_FACE_CSS}</style>`
    : "";
  return `
    ${footerFontCss}
    <div style="width:100%;font-family:'Montserrat Footer',Arial,Helvetica,sans-serif;padding:0 9.5mm 5pt 9.5mm;transform:translateY(-3mm);font-weight:400;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;">
        <div style="font-size:8pt;font-weight:400;color:#232220;line-height:1.38;flex:1;text-align:left;">
          <div>${line1}</div>
          <div>${line2}</div>
        </div>
        <div style="flex-shrink:0;align-self:flex-end;">
          <div style="display:inline-block;box-sizing:border-box;background:#e1e0dc;border:none;min-width:22mm;padding:6.5pt 8pt;text-align:center;font-family:'Montserrat Footer',Arial,Helvetica,sans-serif;font-size:9.5pt;font-weight:400;color:#232220;line-height:1.08;">
            ${pageLabel} <span class="pageNumber"></span>/<span class="totalPages"></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function readEmbeddedLogoDataUri() {
  const candidates = [
    path.join(__dirname, "../public/assets/logo-zerux-dark.png"),
    path.join(__dirname, "../../ressources/images/logo-zerux-dark.png"),
    path.join(__dirname, "../../ressources/images/logo-zerux-transparent.png"),
    path.join(__dirname, "../public/zerux-logo.png"),
  ];
  for (const p of candidates) {
    try {
      const buf = fs.readFileSync(p);
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch { /* try next */ }
  }
  return null;
}

export const EMBEDDED_LOGO_DATA_URI = readEmbeddedLogoDataUri();

// ─── Helpers ───────────────────────────────────────────────────────────────
export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatEuro(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSwissAmount(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const rounded = Math.round(x);
  const whole = String(rounded);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${grouped} .-`;
}

function formatPdfAmount(n, currency) {
  const cur = normalizeCurrency(currency);
  if (cur === "CHF") return formatSwissAmount(n);
  return formatCurrency(n, cur);
}

function pdfAmountSuffix(currency) {
  const cur = normalizeCurrency(currency);
  return cur === "CHF" ? " CHF" : "";
}

function normalizeCurrency(value) {
  const cur = String(value || "EUR").trim().toUpperCase();
  return ["EUR", "CHF", "GBP", "USD"].includes(cur) ? cur : "EUR";
}

function currencyUnitLabel(currency, language = "fr") {
  return pdfCurrencyUnitLabel(currency, language);
}

function formatDate(isoOrDate, { dotted = false, locale = "fr-FR" } = {}) {
  if (!isoOrDate) return "—";
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return String(isoOrDate);
  const label = d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  return dotted ? label.replace(/\//g, ".") : label;
}

function formatCurrency(n, currency) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    style: "currency",
    currency: normalizeCurrency(currency),
  });
}

function lineWeightKg(line) {
  const weight = Number(line?.weight_kg)
  if (Number.isFinite(weight) && weight > 0) return weight
  try {
    const raw = typeof line.raw_json === "string" ? JSON.parse(line.raw_json) : line.raw_json;
    if (raw && !Array.isArray(raw) && raw?.weight_kg != null) return Number(raw.weight_kg);
  } catch { /* noop */ }
  return null;
}

function lineWeightLabel(line, pdfLanguage = 'fr') {
  const desig = String(line?.designation || '')
  if (/poids\s+approximatif|approximate\s+weight|ungefähres\s+gewicht/i.test(desig)) return ''
  if (line?.weight_pdf_line && pdfLanguage === 'fr') return line.weight_pdf_line
  const breakdown = line?.weight_breakdown
  const weightKg = lineWeightKg(line)
  if (breakdown && (breakdown.leaf_kg || breakdown.frame_kg)) {
    return formatPdfWeightLine(line, { ...breakdown, total_kg: weightKg }, pdfLanguage) || ''
  }
  if (Number.isFinite(weightKg) && weightKg > 0) {
    const labels = getPdfLabels(pdfLanguage)
    return `${labels.weightApprox} ${weightKg} kg`
  }
  return ''
}

function effectiveCommercialDiscount(devis = {}, grandTotal = 0) {
  const pct = Number(devis.commercial_discount_pct)
  if (Number.isFinite(pct) && pct !== 0) {
    return Math.round(-Number(grandTotal || 0) * pct / 100 * 100) / 100
  }
  return Number(devis.commercial_discount_ht || 0) || 0
}

function lineQuantity(line) {
  if (line?.qty != null) {
    const qty = Number(line.qty);
    if (Number.isFinite(qty) && qty > 0) return Math.round(qty);
  }
  try {
    const raw = typeof line.raw_json === "string" ? JSON.parse(line.raw_json) : line.raw_json;
    if (raw && !Array.isArray(raw) && raw.qty != null) {
      const qty = Number(raw.qty);
      if (Number.isFinite(qty) && qty > 0) return Math.round(qty);
    }
  } catch { /* noop */ }
  return 1;
}

function parseJsonValue(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function addressLinesFromText(value) {
  return String(value || "")
    .split(/\r?\n|[|;]/)
    .map(part => part.trim())
    .filter(Boolean);
}

function extractTransportAddress(lines = []) {
  for (const line of lines) {
    if (line.line_section !== "transport") continue;
    const raw = parseJsonValue(line.raw_json, {});
    const candidates = [
      raw?.delivery_address,
      raw?.transport_address,
      raw?.notes,
      line.designation,
      line.localisation,
    ];
    for (const candidate of candidates) {
      const linesOut = addressLinesFromText(candidate);
      if (linesOut.length) return linesOut;
    }
  }
  return [];
}

function extractPdfAddresses(devis, lines = []) {
  const analysis = parseJsonValue(devis?.analysis_json, {}) || {};
  const delivery = addressLinesFromText(
    analysis.delivery_address
    || analysis.adresse_livraison
    || analysis.shipping_address
  );
  const billing = addressLinesFromText(
    analysis.billing_address
    || analysis.adresse_facturation
    || analysis.invoice_address
  );
  const transportAddress = extractTransportAddress(lines);
  const deliveryLines = delivery.length ? delivery : transportAddress;
  const billingLines = billing.length
    ? billing
    : (devis?.client_name ? [devis.client_name, ...transportAddress.slice(1)] : transportAddress);
  return { deliveryLines, billingLines };
}

function affairLabel(devis) {
  const analysis = parseJsonValue(devis?.analysis_json, {}) || {};
  return String(
    analysis.affaire
    || analysis.project_name
    || analysis.chantier
    || devis?.name
    || devis?.client_name
    || "—"
  ).trim() || "—";
}

function repLetter(i) {
  let n = i + 1;
  let label = "";
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

function isPdfChassisLine(line = {}) {
  const text = [line.type_porte, line.type, line.designation, line.gamme, line.vantail, line.ref_base]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  return /\bCH\b|CHASSIS|CHÂSSIS|CHASSIS FIXE|CHÂSSIS FIXE|CHASSIS VITR[ÉE]|CHÂSSIS VITR[ÉE]/u.test(text);
}

function isPdfTwoLeafLine(line = {}) {
  const text = [line.type_porte, line.type, line.designation, line.vantail]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  return /\b2\s*V\b|\b2VSFX\b|2\s*VANTAUX|DEUX\s+VANTAUX/u.test(text);
}

function pdfPassageDimensions(line = {}) {
  const haut = Number(line.hauteur_mm ?? line.haut_mm);
  const larg = Number(line.largeur_mm ?? line.larg_mm);
  const chassis = isPdfChassisLine(line);
  const twoLeaf = isPdfTwoLeafLine(line);
  return {
    label: chassis ? "CV" : "PL",
    h: Number.isFinite(haut) ? haut - (chassis ? 140 : 70) : null,
    l: Number.isFinite(larg) ? larg - (chassis ? 140 : (twoLeaf ? 270 : 205)) : null,
    reservationH: Number.isFinite(haut) ? haut + 10 : null,
    reservationL: Number.isFinite(larg) ? larg + 10 : null,
  };
}

function tightenPdfLineUnits(text) {
  return String(text || "")
    .replace(/(\d)\s+kg\b/gi, '$1\u00a0kg')
    .replace(/(\d)\s+W\/m²\.K/gi, '$1\u00a0W/m².K')
}

function formatDesignationBodyLine(line, language = "fr") {
  const raw = tightenPdfLineUnits(String(line || "").trim());
  const escaped = escapeHtml(raw);
  if (!raw) return "";
  const { class: rowClass } = classifyPdfBodyLine(raw, language);
  return `<div class="line-body-row ${rowClass}">${escaped}</div>`;
}

function cleanLegacyDesignationFragment(value) {
  return String(value || "")
    .replace(/\([^)]*€[^)]*\)/giu, "")
    .replace(/\(\s*défaut[^)]*\)/giu, "")
    .replace(/\s+—\s*voir\s+[^\s)]*\.md\)?/giu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/\s*[—-]\s*$/u, "")
    .trim();
}

function splitLegacyDesignationFragment(value) {
  const cleaned = cleanLegacyDesignationFragment(value);
  if (!cleaned) return [];
  const firePrefix = cleaned.match(/^(EI\s*\d{2,3})\b\s*,\s*(.+)$/i);
  const chunks = firePrefix ? [firePrefix[1], firePrefix[2]] : [cleaned];
  return chunks.flatMap(chunk => {
    const shouldSplitCommas = /\b(?:Serrure|Crémone|Garniture|Ferme-porte|VAM|Vitrage|Remplissage)\b/i.test(chunk) && chunk.includes(',');
    return (shouldSplitCommas ? chunk.split(',') : [chunk])
      .map(cleanLegacyDesignationFragment)
      .filter(Boolean);
  });
}

function normalizeDesignationLinesForPdf(designation) {
  return String(designation || "")
    .split('\n')
    .flatMap(line => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      if (!trimmed.includes('|')) return splitLegacyDesignationFragment(trimmed);
      return trimmed.split('|').flatMap(splitLegacyDesignationFragment);
    });
}

// ─── HTML builder ──────────────────────────────────────────────────────────
/**
 * @param {{
 *   devis: object,           — row from `devis` table
 *   lines: object[],         — rows from `devis_lines` table
 *   offerNumber?: string,
 *   offerDateLabel?: string,
 *   referenceLabel?: string,
 *   contactName?: string,
 *   contactPhone?: string,
 *   contactEmail?: string,
 *   companyLine1?: string,
 *   companyLine2?: string,
 * }} data
 */
export function buildDevisNexusHtml(data) {
  const {
    devis,
    lines = [],
    offerNumber,
    offerDateLabel,
    referenceLabel,
    pdfLanguage: inputPdfLanguage,
    contactName: inputContactName,
    contactPhone = process.env.DEVIS_PDF_CONTACT_PHONE || "",
    contactEmail = process.env.DEVIS_PDF_CONTACT_EMAIL || "",
    companyLine1: inputCompanyLine1 = process.env.DEVIS_PDF_COMPANY_LINE1 || "",
    companyLine2: inputCompanyLine2 = process.env.DEVIS_PDF_COMPANY_LINE2 || "",
  } = data;

  const pdfLanguage = normalizePdfLanguage(inputPdfLanguage || devis?.pdf_language);
  const labels = getPdfLabels(pdfLanguage);
  const docLabel = labels.docLabel;
  const number = offerNumber || devis.name || `D${devis.id}`;
  const currency = normalizeCurrency(devis.currency);
  const isChf = currency === "CHF";
  const dateLabel = offerDateLabel || formatDate(devis.created_at, { dotted: isChf, locale: labels.dateLocale });
  const refLabel = referenceLabel || devis.deal_id || "—";
  const clientName = devis.client_name || "—";
  const contactName = inputContactName
    ?? devis.requester_contact_name
    ?? process.env.DEVIS_PDF_CONTACT_NAME
    ?? labels.defaultContact;
  const { deliveryLines, billingLines } = extractPdfAddresses(devis, lines);
  const affair = affairLabel(devis);
  const localisationPattern = new RegExp(`^(?:${[
    'Localisation',
    'Location',
    'Standort',
    'Lokalisation',
  ].join('|')})\\s*:`, 'i');

  // Build table rows from devis_lines (Hive layout: no section headers, no délais column)
  let displayIndex = 0;
  const rowEntries = lines.filter(line => line.line_section !== "calculations").map((line) => {
    const rawLine = parseJsonValue(line.raw_json, {}) || {};
    const pageBreakBefore = rawLine.pdf_page_break_before || (line.line_section === "transport" && displayIndex === 2);
    if (line.line_section === "note") {
      const noteDesignation = resolvePdfLineDesignation(line, pdfLanguage);
      const noteLines = normalizeDesignationLinesForPdf(noteDesignation);
      const noteTitle = noteLines.length ? escapeHtml(noteLines[0]) : labels.nota;
      const noteBody = noteLines.slice(1).map(part => `<div>${escapeHtml(part)}</div>`).join("");
      const noteCells = isChf
        ? `<td class="cell-rep"></td>
        <td class="cell-desc">
          <div class="note-title">${noteTitle}</div>
          <div class="note-body">${noteBody}</div>
        </td>
        <td class="cell-qty col-qty hive-note-num"></td>
        <td class="cell-num col-pu hive-note-num"></td>
        <td class="cell-num col-total hive-note-num"></td>`
        : `<td class="cell-rep"></td>
        <td class="cell-desc" colspan="4">
          <div class="note-title">${noteTitle}</div>
          <div class="note-body">${noteBody}</div>
        </td>`;
      return {
        pageBreakBefore,
        html: `
      <tr class="note-row">
        ${noteCells}
      </tr>`,
      };
    }
    const gamme = line.gamme ? `[${escapeHtml(line.gamme)}]` : "";
    const dims = (line.hauteur_mm && line.largeur_mm)
      ? ` H${line.hauteur_mm}×L${line.largeur_mm} mm` : "";
    const passageDims = pdfPassageDimensions(line);
    const passageDimsLabel = pdfPassageDimLabel({
      label: passageDims.label,
      h: passageDims.h,
      l: passageDims.l,
      language: pdfLanguage,
    });
    const reservationDimsLabel = pdfReservationDimLabel({
      h: passageDims.reservationH,
      l: passageDims.reservationL,
      language: pdfLanguage,
    });
    const vantail = line.vantail ? ` — ${escapeHtml(line.vantail)}` : "";

    // Split multi-line designation: first line = bold title, rest = body block
    const localizedDesignation = resolvePdfLineDesignation(line, pdfLanguage);
    const desigLines = normalizeDesignationLinesForPdf(localizedDesignation);
    const titleLine = desigLines.length
      ? escapeHtml(desigLines[0])
      : `${gamme}${dims}${vantail}`;
    const weightLabel = lineWeightLabel(line, pdfLanguage);
    const bodyLines = insertWeightLineInDesignation(desigLines.slice(1), weightLabel);
    const bodyHtml = bodyLines
      .map((part) => formatDesignationBodyLine(part, pdfLanguage))
      .join('');
    const localisation = String(line.localisation || "").trim();
    const hasBodyLocalisation = desigLines.some((l) => localisationPattern.test(l));
    const localisationHtml = localisation && !hasBodyLocalisation
      ? `<div class="line-localisation">${escapeHtml(labels.localisation)} ${escapeHtml(localisation)}</div>`
      : "";

    // Build fallback options description (shown only when no multi-line body)
    let optDesc = "";
    if (!bodyHtml && line.options_json) {
      const opts = typeof line.options_json === "string"
        ? (() => { try { return JSON.parse(line.options_json); } catch { return []; } })()
        : (Array.isArray(line.options_json) ? line.options_json : []);
      optDesc = opts.map(o => `${escapeHtml(o.label || "")}${o.prix ? ` (${formatEuro(o.prix)} €)` : ""}`).join(", ");
    }
    const serrure = (!bodyHtml && line.serrure_ref)
      ? escapeHtml(pdfLockLabel(line.serrure_ref, pdfLanguage))
      : "";
    const localisationDesc = localisation ? `${labels.localisation} ${escapeHtml(localisation)}` : "";
    const skipFallbackMeta = line.line_section === 'transport' || line.line_section === 'note';
    const descParts = skipFallbackMeta
      ? ''
      : [passageDimsLabel, reservationDimsLabel, weightLabel, localisationDesc, optDesc, serrure].filter(Boolean).join(' | ');

    const total = Number(line.total_ligne_ht) || Number(line.prix_base_ht) || 0;
    const qty = lineQuantity(line);
    const unitPrice = qty > 0 && total ? total / qty : total;
    const amountSuffix = pdfAmountSuffix(currency);

    const longRow = desigLines.length > 6 || String(line.designation || '').length > 420
    const rowClasses = [
      longRow ? 'row-splittable' : '',
      line.line_section === 'transport' ? 'transport-row' : '',
    ].filter(Boolean).join(' ');

    const rowHtml = `
      <tr class="product-row ${rowClasses}">
        <td class="cell-rep">${escapeHtml(repLetter(displayIndex))}</td>
        <td class="cell-desc">
          <div class="line-title">${titleLine}</div>
          ${bodyHtml ? `<div class="line-body">${bodyHtml}</div>` : (descParts ? `<div class="line-desc">${descParts}</div>` : "")}
          ${bodyHtml ? localisationHtml : ""}
        </td>
        <td class="cell-num cell-qty col-qty">${qty}</td>
        <td class="cell-num col-pu">${total ? `${formatPdfAmount(unitPrice, currency)}` : "—"}</td>
        <td class="cell-num col-total">${total ? `${formatPdfAmount(total, currency)}` : "—"}</td>
      </tr>`;
    displayIndex += 1;
    return { html: rowHtml, pageBreakBefore };
  });

  const tableHeadHtml = isChf ? `
    <thead>
      <tr>
        <th class="col-rep">${labels.colRep}</th>
        <th class="col-desc">${labels.colDesc}</th>
        <th class="col-qty">${labels.colQty}</th>
        <th class="col-pu">${labels.colUnit}</th>
        <th class="col-total">${labels.colTotal}</th>
      </tr>
    </thead>` : `
    <thead>
      <tr>
        <th style="width:34px;min-width:34px;text-align:center;">${labels.colRep}</th>
        <th>${labels.colDesc}</th>
        <th style="width:42px;text-align:center;">${labels.colQty}</th>
        <th style="width:92px;text-align:right;">${labels.colUnit}</th>
        <th style="width:92px;text-align:right;">${labels.colTotal}</th>
      </tr>
    </thead>`;
  const emptyTableRow = `<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--zr-label);">${labels.emptyLines}</td></tr>`;
  const hiveFillerRow = `<tr class="hive-table-filler" aria-hidden="true"><td class="cell-rep"></td><td class="cell-desc"></td><td class="cell-num cell-qty col-qty"></td><td class="cell-num col-pu"></td><td class="cell-num col-total"></td></tr>`;
  const grandTotal = Number(devis.total_ht)
    || lines.reduce((sum, line) => sum + (Number(line.total_ligne_ht) || Number(line.prix_base_ht) || 0), 0)
    || 0;
  const commercialDiscount = effectiveCommercialDiscount(devis, grandTotal);
  const totalAfterDiscount = grandTotal + commercialDiscount;
  const tvaRate = Number(devis.tva_rate);
  const effectiveTvaRate = Number.isFinite(tvaRate) ? tvaRate : 0.2;
  const tvaAmount = totalAfterDiscount * effectiveTvaRate;
  const totalTtc = totalAfterDiscount + tvaAmount;
  const amountSuffix = pdfAmountSuffix(currency);
  const tvaRateLabel = (effectiveTvaRate * 100).toLocaleString(labels.dateLocale, {
    maximumFractionDigits: isChf ? 1 : 2,
  });
  const tvaLabel = isChf ? labels.tvaDeductible(tvaRateLabel) : labels.tva(tvaRateLabel);

  const hiveTotalsHiveHtml = isChf ? `
        <div class="totals-hive">
          <div class="totals-hive-row"><span class="totals-hive-label">${labels.totalHt}</span><span class="totals-hive-amount">${formatPdfAmount(grandTotal, currency)}${amountSuffix}</span></div>
          ${commercialDiscount ? `<div class="totals-hive-row"><span class="totals-hive-label">${labels.commercialDiscount}</span><span class="totals-hive-amount">${formatPdfAmount(commercialDiscount, currency)}${amountSuffix}</span></div>` : ""}
          <div class="totals-hive-row"><span class="totals-hive-label">${escapeHtml(tvaLabel)}</span><span class="totals-hive-amount">${formatPdfAmount(tvaAmount, currency)}${amountSuffix}</span></div>
          <div class="totals-hive-row totals-hive-row--ttc"><span class="totals-hive-label">${labels.totalTtcStrong}</span><span class="totals-hive-amount">${formatPdfAmount(totalTtc, currency)}${amountSuffix}</span></div>
        </div>` : "";
  const hiveTotalsTfoot = isChf ? `
      <tfoot class="hive-tfoot">
        <tr class="hive-tfoot-bridge" aria-hidden="true">
          <td class="cell-rep hive-tfoot-bridge-cell"><div class="hive-tfoot-bridge-fill"></div></td>
          <td class="cell-desc hive-tfoot-bridge-cell"><div class="hive-tfoot-bridge-fill"></div></td>
          <td class="cell-qty col-qty hive-tfoot-bridge-cell"><div class="hive-tfoot-bridge-fill"></div></td>
          <td class="cell-pu col-pu hive-tfoot-bridge-cell"><div class="hive-tfoot-bridge-fill"></div></td>
          <td class="cell-total col-total hive-tfoot-bridge-cell"><div class="hive-tfoot-bridge-fill"></div></td>
        </tr>
        <tr class="hive-tfoot-totals">
          <td class="cell-rep"></td>
          <td colspan="4" class="hive-tfoot-totals-cell">${hiveTotalsHiveHtml}</td>
        </tr>
      </tfoot>` : "";

  const renderDataTable = (rows, { withFiller = false, withTotals = false } = {}) => `
    <table class="data-table">
      ${tableHeadHtml}
      <tbody>${rows.length ? rows.join("") : emptyTableRow}${withFiller ? hiveFillerRow : ""}</tbody>
      ${withTotals ? hiveTotalsTfoot : ""}
    </table>`;
  const tableSections = [];
  let sectionRows = [];
  rowEntries.forEach((entry) => {
    if (entry.pageBreakBefore && sectionRows.length) {
      tableSections.push(sectionRows);
      sectionRows = [];
    }
    sectionRows.push(entry.html);
  });
  if (sectionRows.length || !tableSections.length) tableSections.push(sectionRows);
  const tablesHtml = tableSections.map((rows, idx) => {
    const prefix = idx > 0
      ? (isChf
        ? `<div class="pdf-page-break"></div><div class="hive-chf-continuation"><div class="hive-head-bar continuation-title">${labels.quoteTitle} ${escapeHtml(number)}</div></div>`
        : `<div class="pdf-page-break"></div><div class="continuation-title">${labels.quoteTitle} ${escapeHtml(number)}</div>`)
      : "";
    const withFiller = isChf && idx === tableSections.length - 1;
    const withTotals = isChf && idx === tableSections.length - 1;
    return `${prefix}${renderDataTable(rows, { withFiller, withTotals })}`;
  }).join("");

  const totalWeightKg = lines.reduce((sum, line) => {
    const weight = lineWeightKg(line);
    return Number.isFinite(weight) && weight > 0 ? sum + weight : sum;
  }, 0);
  const companyLine1 = inputCompanyLine1 || (isChf
    ? "Zerux International SA – Route de Crassier 7 – CH-1262 Eysins – Tel : +41 (0)26 519 02 99"
    : "");
  const companyLine2 = inputCompanyLine2 || (isChf
    ? "SA au capital de 100'000 CHF – UID : CHE-385.444.080 – TVA : CHE-385.444.080 – RC Vaud : CH-550.1.253.039-2"
    : "");
  const showStandaloneClient = !isChf && clientName && clientName !== '—';

  const addressBlock = (title, rows, extraClass = "") => {
    if (!rows.length) return ""
    const linesHtml = rows.map(line => `<div class="address-line">${escapeHtml(line)}</div>`).join("")
    const titleClass = isChf ? "address-title hive-head-bar" : "address-title"
    const body = isChf
      ? `<div class="address-body">${linesHtml}</div>`
      : linesHtml
    return `<div class="address-block ${extraClass}">
        <div class="${titleClass}">${escapeHtml(title)}</div>
        ${body}
      </div>`
  }

  const metaLinesInner = `
        <div class="meta-line">
          <div class="meta-label">${labels.date}</div>
          <div class="meta-value">${escapeHtml(dateLabel)}</div>
        </div>
        <div class="meta-line">
          <div class="meta-label">${labels.affair}</div>
          <div class="meta-value">${escapeHtml(affair)}</div>
        </div>
        ${refLabel && refLabel !== '—' ? `
        <div class="meta-line">
          <div class="meta-label">${labels.reference}</div>
          <div class="meta-value">${escapeHtml(refLabel)}</div>
        </div>` : ''}
        ${contactName && contactName !== labels.defaultContact ? `
        <div class="meta-line" style="margin-top:10px;">
          <div class="meta-label">${labels.contact}</div>
          <div class="meta-value">${escapeHtml(contactName)}${contactPhone ? ` — ${escapeHtml(contactPhone)}` : ""}${contactEmail ? ` — ${escapeHtml(contactEmail)}` : ""}</div>
        </div>` : ""}`

  const billingLinesHtml = billingLines.map(line => `<div class="address-line">${escapeHtml(line)}</div>`).join("")

  const addressBlocksHtml = isChf
    ? `${addressBlock(labels.deliveryAddress, deliveryLines, "address-block--delivery")}
        <div class="hive-head-bar hive-grid-devis">${labels.quoteTitle} ${escapeHtml(number)}</div>
        <div class="hive-head-bar hive-grid-facturation">${escapeHtml(labels.billingAddress)}</div>
        <div class="meta-body">${metaLinesInner}</div>
        <div class="address-body hive-grid-billing-body">${billingLinesHtml}</div>`
    : `<div class="header-address-col">
        ${addressBlock(labels.deliveryAddress, deliveryLines, "address-block--delivery")}
        ${addressBlock(labels.billingAddress, billingLines, "address-block--billing")}
      </div>`

  return `<!DOCTYPE html>
<html lang="${labels.htmlLang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(number)}</title>
  <style>
    ${isChf ? HIVE_FONT_FACES_CSS : FONT_FACES_CSS}

    @page { size: A4; margin: 8mm 0 18mm 0; }
    :root {
      --zr-title:  #595959;
      --zr-black:  #1a1a1a;
      --zr-body:   #4a4a4a;
      --zr-label:  #888888;
      --zr-border: #d0d0d0;
      --zr-row-border: #e0e4e6;
      --zr-border-dashed: #9aa4a8;
      --zr-table-head:   ${PDF_BRAND_HEX};
      --zr-primary:      ${PDF_BRAND_HEX};
      --zr-blue:         ${PDF_BRAND_HEX};
    }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
    body {
      font-family: 'Montserrat', sans-serif;
      font-weight: 300;
      color: var(--zr-body);
      font-size: 10pt;
      line-height: 1.4;
      margin: 0; padding: 0;
      background: #fff;
    }
    .hive-chf {
      font-weight: 300;
    }
    .page { padding: 0; }

    /* ── HEADER (Hive-like) — dimensions from reference PDF 605.0106 ── */
    .hive-head-grid {
      display: grid;
      grid-template-columns: 84.4mm 84.4mm;
      column-gap: 21.2mm;
      grid-template-rows: 30mm auto;
      align-items: start;
      margin-bottom: 10.3mm;
      padding: 3.1mm 9.8mm 0 10.2mm;
    }
    .hive-chf .hive-head-grid {
      grid-template-rows: auto auto auto;
      row-gap: 0;
      margin-bottom: 7mm;
      align-items: stretch;
    }
    .hive-chf .logo-zone {
      grid-row: 1;
      grid-column: 1;
      align-self: start;
    }
    .hive-chf .address-block--delivery {
      grid-row: 1;
      grid-column: 2;
      width: 84.4mm;
      align-self: start;
    }
    .hive-chf .hive-grid-devis {
      grid-row: 2;
      grid-column: 1;
      width: 84.4mm;
      max-width: 84.4mm;
      margin-top: 4.5mm;
      justify-self: start;
    }
    .hive-chf .hive-head-bar.hive-grid-devis {
      width: 84.4mm;
      max-width: 84.4mm;
      display: flex;
      box-sizing: border-box;
    }
    .hive-chf .hive-grid-facturation {
      grid-row: 2;
      grid-column: 2;
      width: 84.4mm;
      margin-top: 4.5mm;
    }
    .hive-chf .meta-body {
      grid-row: 3;
      grid-column: 1;
      margin-top: 3mm;
      width: 84.4mm;
      max-width: 84.4mm;
      align-self: stretch;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }
    .hive-chf .hive-grid-billing-body {
      grid-row: 3;
      grid-column: 2;
      margin-top: 3mm;
      width: 84.4mm;
      max-width: 84.4mm;
      align-self: stretch;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }
    .logo-zone {
      grid-column: 1;
      grid-row: 1;
      width: 84.4mm;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }
    .quote-meta {
      grid-column: 1;
      grid-row: 2;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      width: 84.4mm;
    }
    .header-address-col {
      display: contents;
    }
    .address-block--delivery { grid-column: 2; grid-row: 1; width: 84.4mm; }
    .address-block--billing { grid-column: 2; grid-row: 2; width: 84.4mm; }
    .hive-chf .hive-head-bar {
      background: var(--zr-table-head);
      color: #fff;
      font-size: 10pt;
      font-weight: 600;
      height: 6.5mm;
      min-height: 6.5mm;
      max-height: 6.5mm;
      display: inline-flex;
      align-items: center;
      padding: 0 3mm;
      margin-bottom: 0;
      box-sizing: border-box;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .logo-img {
      width: 62.1mm;
      height: auto;
      display: block;
    }
    .hive-chf .logo-img {
      width: 62.1mm;
      opacity: 1;
    }
    .logo-wordmark {
      color: var(--zr-table-head);
      font-family: 'Montserrat', sans-serif;
      font-size: 45pt;
      font-weight: 700;
      line-height: 0.8;
      letter-spacing: -0.08em;
    }
    .logo-tagline {
      color: var(--zr-table-head);
      font-size: 9.5pt;
      font-weight: 400;
      letter-spacing: 0.47em;
      line-height: 1.2;
      margin-top: 4mm;
    }
    .address-block { width: 100%; font-size: 8.1pt; line-height: 1.38; color: var(--zr-title); }
    .hive-chf .address-block { font-size: 8pt; line-height: 1.35; color: #232220; }
    .address-title {
      display: block;
      box-sizing: border-box;
      width: 100%;
      background: var(--zr-table-head); color: #fff; font-weight: 700;
      margin-bottom: 2mm; padding: 3px 3mm; font-size: 8.1pt;
      min-height: 6mm;
      line-height: 1.2;
    }
    .hive-chf .address-title { font-size: 9pt; font-weight: 600; margin-bottom: 0; min-height: unset; }
    .address-line { font-weight: 300; padding-left: 3mm; }
    .hive-chf .address-line {
      font-weight: 300;
      font-size: 8pt;
      padding-left: 3mm;
      line-height: 11pt;
      margin: 0;
    }
    .hive-chf .meta-body {
      border-left: 1px solid #d8d3c8;
      width: 100%;
      box-sizing: border-box;
      padding-top: 0;
    }
    .hive-chf .address-block--delivery .address-body,
    .hive-chf .hive-grid-billing-body {
      border-left: 1px solid #d8d3c8;
      width: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }
    .hive-chf .address-block--delivery .address-body {
      height: auto;
      min-height: 0;
      max-height: none;
      padding-top: 3.9mm;
    }
    .hive-chf .hive-grid-billing-body {
      padding-top: 0;
    }

    .client-box { min-width: 180px; max-width: 260px; text-align: right; }
    .quote-meta h1 {
      display: block;
      box-sizing: border-box;
      width: 100%;
      background: var(--zr-table-head); color: #fff;
      font-size: 8.1pt; font-weight: 700; margin: 0 0 2.5mm 0;
      padding: 3px 3mm; letter-spacing: 0.01em;
      min-height: 6mm;
      line-height: 1.2;
    }
    .hive-chf .quote-meta h1 { font-size: 9pt; font-weight: 600; margin-bottom: 0; }
    .meta-line { margin-bottom: 1.5px; display: flex; font-size: 7.9pt; line-height: 1.24; padding-left: 3mm; width: 100%; }
    .hive-chf .meta-line {
      font-size: 8pt; line-height: 1.35; color: #232220;
      border-bottom: none;
      padding-bottom: 0;
      margin-bottom: 0;
    }
    .hive-chf .meta-line + .meta-line { margin-top: 0.4mm; }
    .meta-label { width: 14mm; color: var(--zr-label); font-weight: 300; flex-shrink: 0; }
    .hive-chf .meta-label { font-weight: 300; color: #232220; width: 14mm; }
    .hive-chf .meta-value { font-weight: 300; color: #232220; }
    .meta-value { font-weight: 400; flex: 1; color: var(--zr-title); }
    .client-box h2 {
      font-size: 11pt; font-weight: 700; margin: 0; color: var(--zr-title);
    }

    /* ── TABLE ── */
    table.data-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .hive-chf table.data-table {
      table-layout: fixed;
      font-size: 8pt;
    }
    table.data-table thead th {
      background: var(--zr-table-head); color: #fff; font-weight: 700;
      text-align: left; padding: 4px 7px; text-transform: none;
      font-size: 7.5pt; letter-spacing: 0; white-space: nowrap;
      vertical-align: middle; border-left: 1px dashed rgba(255,255,255,0.4);
    }
    .hive-chf table.data-table thead tr {
      background: var(--zr-table-head);
    }
    .hive-chf table.data-table thead th {
      font-size: 9.5pt;
      font-weight: 600;
      padding: 4px 1.5mm;
      line-height: 1.25;
      border-left: none !important;
      background: transparent;
      color: #fff;
    }
    .hive-chf table.data-table thead th.col-qty,
    .hive-chf table.data-table thead th.col-pu,
    .hive-chf table.data-table thead th.col-total {
      border-left: 0.5pt solid rgba(255, 255, 255, 0.38) !important;
    }
    table.data-table thead th:first-child { border-left: none; padding-left: 8mm; }
    table.data-table thead th:last-child { padding-right: 9mm; }
    .hive-chf table.data-table thead th.col-rep { width: 18.2mm; text-align: center; padding-left: 8mm; padding-right: 0; }
    .hive-chf table.data-table thead th.col-desc { width: 134.2mm; text-align: left; padding-left: 2mm; }
    .hive-chf table.data-table thead th.col-qty { width: 8.5mm; text-align: center; padding-left: 0.5mm; padding-right: 0.5mm; }
    .hive-chf table.data-table thead th.col-pu { width: 21.4mm; text-align: right; padding-right: 2mm; }
    .hive-chf table.data-table thead th.col-total { width: 27.7mm; text-align: right; padding-right: 9mm; }
    table.data-table thead { display: table-header-group; }
    table.data-table tbody tr {
      border-bottom: 0;
      page-break-inside: avoid; break-inside: avoid;
    }
    .hive-chf table.data-table tbody tr.product-row,
    .hive-chf table.data-table tbody tr.note-row {
      background: #fff;
    }
    .hive-chf table.data-table tbody tr.product-row td,
    .hive-chf table.data-table tbody tr.note-row td {
      background: #fff;
    }
    table.data-table tbody tr.row-splittable {
      page-break-inside: auto; break-inside: auto;
    }
    .pdf-page-break { page-break-before: always; break-before: page; height: 0; }
    .hive-chf-continuation {
      padding: 2.1mm 0 0 10.2mm;
      margin-bottom: 4mm;
    }
    .hive-chf-continuation .continuation-title {
      width: auto;
      max-width: none;
      display: inline-flex;
      margin: 0;
    }
    .continuation-title {
      display: inline-block;
      margin: 0 0 4mm 8mm;
      padding: 3px 3mm;
      background: var(--zr-table-head);
      color: #fff;
      font-size: 8.2pt;
      font-weight: 700;
    }
    .hive-chf .continuation-title { font-size: 10pt; font-weight: 600; }
    table.data-table td {
      padding: 8px 7px 12px; vertical-align: top;
      border-left: none;
    }
    .hive-chf table.data-table td {
      padding: 8px 1.5mm 6px; font-size: 8pt;
      border-left: none;
      border-right: none;
      line-height: 1.35;
    }
    .hive-chf table.data-table tbody tr.product-row:first-child td,
    .hive-chf table.data-table tbody tr.note-row:first-child td {
      padding-top: 14px;
    }
    .hive-chf-continuation + table.data-table tbody tr.product-row:first-child td,
    .hive-chf-continuation + table.data-table tbody tr.note-row:first-child td {
      padding-top: 15px;
    }
    .hive-chf table.data-table tbody tr.transport-row td {
      padding-top: 6mm;
    }
    .hive-chf table.data-table td.cell-desc {
      padding-left: 2mm;
      border-left: none;
      background: #fff !important;
    }
    .hive-chf table.data-table td.cell-rep {
      border-left: none;
      border-right: none;
    }
    .hive-chf table.data-table td.col-qty,
    .hive-chf table.data-table td.col-pu,
    .hive-chf table.data-table td.col-total,
    .hive-chf table.data-table td.cell-qty,
    .hive-chf table.data-table td.cell-num {
      border-left: none;
      border-right: none;
    }
    .hive-chf table.data-table tr.hive-table-filler td {
      min-height: 62mm;
      height: 62mm;
      padding: 0;
      vertical-align: top;
      border-top: none;
      background: #fff;
      border-left: none;
      border-right: none;
    }
    .hive-chf table.data-table tr.hive-table-filler td.cell-rep {
      border-left: none;
      border-right: none;
    }
    .hive-chf table.data-table tr.hive-table-filler td.cell-desc {
      border-left: none;
      background: #fff !important;
    }
    table.data-table td.cell-qty,
    table.data-table td.cell-num { border-left: 1px dashed #c8ced2; }
    table.data-table td:first-child { border-left: none; padding-left: 8mm; }
    table.data-table td:last-child { padding-right: 9mm; }

    /* Hive CHF — overrides EUR table styles (order matters) */
    .hive-chf table.data-table tbody td {
      background: #fff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .hive-chf table.data-table thead th {
      background: var(--zr-table-head) !important;
    }
    .hive-chf table.data-table td.cell-desc {
      background: #fff !important;
      border-left: none !important;
    }
    .hive-chf table.data-table td.cell-rep {
      border-left: none !important;
      border-right: 0.5pt solid #d8d3c8 !important;
    }
    .hive-chf table.data-table td.col-qty,
    .hive-chf table.data-table td.col-pu,
    .hive-chf table.data-table td.col-total,
    .hive-chf table.data-table td.cell-qty,
    .hive-chf table.data-table td.cell-num {
      border-left: 0.5pt solid #d8d3c8 !important;
      border-right: none !important;
    }
    .hive-chf table.data-table tr.hive-table-filler td.cell-rep {
      border-right: 0.5pt solid #d8d3c8 !important;
    }
    .hive-chf table.data-table tr.hive-table-filler td.col-qty,
    .hive-chf table.data-table tr.hive-table-filler td.col-pu,
    .hive-chf table.data-table tr.hive-table-filler td.col-total {
      border-left: 0.5pt solid #d8d3c8 !important;
    }

    .section-row {
      background: #f3f7f8; color: var(--zr-title); font-size: 8pt;
      font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
      padding: 5px 10mm 5px calc(3mm + 8px) !important;
      border-left: none !important;
    }

    .cell-rep { width: 34px; min-width: 34px; text-align: center; font-weight: 700; color: var(--zr-title); }
    .cell-desc { width: auto; }
    .cell-qty { width: 38px; text-align: center; font-weight: 400; }
    .cell-num { width: 74px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 400; }
    .hive-chf .cell-rep { width: 18.2mm; min-width: 18.2mm; font-weight: 300; font-size: 8pt; font-family: 'Montserrat', sans-serif; }
    .hive-chf .cell-qty { width: 8.5mm; min-width: 8.5mm; padding-left: 0.5mm !important; padding-right: 0.5mm !important; text-align: center; font-size: 8pt; font-weight: 300; font-family: 'Montserrat', sans-serif; font-variant-numeric: normal; }
    .hive-chf .cell-num { font-family: 'Montserrat', sans-serif; font-weight: 300; font-variant-numeric: normal; }
    .hive-chf .col-pu { width: 21.4mm; min-width: 21.4mm; padding-right: 2mm !important; font-size: 8pt; font-weight: 300; font-family: 'Montserrat', sans-serif; font-variant-numeric: normal; }
    .hive-chf .col-total { width: 27.7mm; min-width: 27.7mm; font-size: 8pt; font-weight: 300; font-family: 'Montserrat', sans-serif; font-variant-numeric: normal; padding-right: 9mm !important; }

    .line-title { font-weight: 700; font-size: 8.6pt; margin-bottom: 2px; text-transform: uppercase; color: var(--zr-title); line-height: 1.18; }
    .hive-chf .line-title {
      font-size: 8pt; font-weight: 600; color: #232220;
      line-height: 1.35; margin-bottom: 0; letter-spacing: 0.01em;
      text-transform: uppercase;
      font-family: 'Montserrat', sans-serif;
    }
    .line-body { font-size: 7.8pt; color: #5a5a5a; line-height: 1.3; font-weight: 300; margin-top: 1px; padding-left: 8px; }
    .hive-chf .line-body {
      font-size: 7.75pt; font-weight: 300; color: #232220;
      line-height: 1.34; margin-top: 0; padding-left: 0;
      letter-spacing: -0.01em;
    }
    .line-body-row { margin: 0; padding: 0; font-weight: 400; }
    .line-body-row + .line-body-row { margin-top: 0.3px; }
    .hive-chf .line-body-row {
      font-size: 7.75pt; font-weight: 300; color: #232220;
      letter-spacing: -0.01em;
    }
    .hive-chf .line-body-row + .line-body-row { margin-top: 0.08mm; }
    .line-bullet { padding-left: 10px; text-indent: -4px; }
    .line-equipment-head { margin-top: 2px; font-weight: 400; }
    .hive-chf .line-equipment-head { margin-top: 1px; font-weight: 300; font-size: 7.75pt; }
    .line-strong { font-weight: 700; color: var(--zr-title); }
    /* Custom passage dimensions — SemiBold (Armand highlight) */
    .hive-chf .line-strong {
      font-weight: 600; color: #232220; font-size: 7.75pt;
      letter-spacing: 0;
      font-family: 'Montserrat', sans-serif;
    }
    .line-note-strong { font-weight: 700; color: var(--zr-title); margin-top: 10px; }
    .hive-chf .line-note-strong { font-weight: 300; color: #232220; margin-top: 1px; font-size: 7.75pt; }
    .line-localisation,
    .line-localisation-inline { font-size: 7.8pt; color: var(--zr-title); line-height: 1.18; font-weight: 700; font-style: italic; margin-top: 1px; }
    /* Geographic localisation — SemiBold (Armand highlight) */
    .hive-chf .line-localisation,
    .hive-chf .line-localisation-inline {
      font-size: 7.75pt; color: #232220; line-height: 1.34;
      font-weight: 600; font-style: normal; margin-top: 0;
      letter-spacing: 0;
      font-family: 'Montserrat', sans-serif;
    }
    .hive-chf .line-bullet { padding-left: 8px; text-indent: -3px; font-weight: 300; font-size: 7.75pt; }
    .line-desc { font-family: 'Montserrat', sans-serif; font-size: 8pt; color: var(--zr-body); line-height: 1.35; font-weight: 300; }
    .hive-chf .line-desc { font-weight: 400; color: #232220; }
    .note-row td { padding-top: 9px; padding-bottom: 12px; border-bottom: 0; }
    .note-title { font-size: 8.4pt; font-weight: 700; color: var(--zr-title); margin-bottom: 9px; }
    .hive-chf .note-row .cell-desc {
      font-weight: 300;
    }
    .hive-chf .note-row .note-title {
      font-size: 8pt;
      font-weight: 700;
      margin-bottom: 2mm;
    }
    .note-body { max-width: 128mm; font-size: 8pt; line-height: 1.4; color: var(--zr-body); }
    .hive-chf .note-body {
      font-weight: 300;
      font-size: 8pt;
      line-height: 1.35;
      color: #232220;
    }
    .hive-chf .note-body div {
      font-weight: 300;
    }
    .hive-chf .note-row td.hive-note-num {
      border-left: 0.5pt solid #d8d3c8 !important;
      padding: 0;
      vertical-align: top;
      background: #fff !important;
    }

    /* Hive tfoot — bridge row: vertical rules (Q./P.U./Total) down to totals box */
    .hive-chf .hive-tfoot-bridge-fill {
      display: block;
      height: 5.3mm;
      min-height: 5.3mm;
      width: 100%;
      overflow: hidden;
    }
    .hive-chf table.data-table tfoot tr.hive-tfoot-bridge td.hive-tfoot-bridge-cell {
      padding: 0 !important;
      vertical-align: top;
      border-top: none;
      background: #fff !important;
      line-height: 0;
    }
    .hive-chf table.data-table tfoot tr.hive-tfoot-bridge td.cell-rep {
      border-right: 0.5pt solid #d8d3c8 !important;
    }
    .hive-chf table.data-table tfoot tr.hive-tfoot-bridge td.col-qty,
    .hive-chf table.data-table tfoot tr.hive-tfoot-bridge td.col-pu,
    .hive-chf table.data-table tfoot tr.hive-tfoot-bridge td.col-total {
      border-left: 0.5pt solid #d8d3c8 !important;
    }

    /* Hive tfoot — totals flush under table columns */
    .hive-chf table.data-table tfoot td {
      padding: 0;
      vertical-align: top;
      border-top: none;
      background: #fff;
    }
    .hive-chf table.data-table tfoot td.cell-rep {
      border-right: 0.5pt solid #d8d3c8 !important;
    }
    .hive-chf table.data-table tfoot td.hive-tfoot-totals-cell {
      border-left: none !important;
      padding: 0;
      background: #fff;
    }
    .hive-chf table.data-table tfoot .totals-hive {
      width: 83mm;
      margin-left: auto;
      margin-right: 0;
      min-width: 83mm;
      max-width: 83mm;
      padding: 0;
      box-sizing: border-box;
    }

    /* ── TOTAL ── */
    .footer-summary { margin-top: 14px; page-break-inside: avoid; break-inside: avoid; }
    .hive-chf .footer-summary { margin-top: 0; }
    .eco-contribution { text-align: right; font-size: 7.2pt; font-style: italic; color: var(--zr-label); margin-bottom: 4px; padding-right: 9mm; }
    .totals-hive {
      margin-left: auto;
      width: 70mm;
      margin-right: 9mm;
      font-size: 7.6pt;
      color: var(--zr-title);
    }
    .hive-chf .totals-hive {
      margin-top: 0;
      padding-top: 0;
      font-size: 7.5pt;
      font-weight: 400;
      font-family: 'Montserrat', sans-serif;
      color: #000;
    }
    .totals-hive-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 2px 4mm;
      background: #e8e5dc;
      border-bottom: 0.5pt solid #d8d3c8;
    }
    .hive-chf .totals-hive-row {
      padding: 1.6pt 3mm 0 1.2mm;
      line-height: 1.38;
      gap: 8mm;
      color: #000;
      background: #e8e5dc;
      font-weight: 400;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .hive-chf .totals-hive-row:first-child + .totals-hive-row:not(.totals-hive-row--ttc) {
      margin-top: -2.5pt;
    }
    .hive-chf table.data-table tfoot .totals-hive-row {
      padding-right: 5mm;
    }
    .hive-chf .totals-hive-label,
    .hive-chf .totals-hive-amount {
      white-space: nowrap;
      color: #000;
      font-weight: 400;
      font-family: 'Montserrat', sans-serif;
    }
    .hive-chf .totals-hive-amount {
      text-align: right;
    }
    .hive-chf .totals-hive-label {
      flex-shrink: 0;
    }
    .hive-chf .totals-hive-row:first-child {
      padding-top: 0;
    }
    .totals-hive-row strong { font-weight: 700; }
    .totals-hive-row--ttc {
      background: var(--zr-table-head);
      color: #fff;
      border-bottom: 0;
      font-size: 8.4pt;
    }
    .hive-chf .totals-hive-row--ttc {
      font-size: 8.5pt;
      font-weight: 600;
      padding-top: 4.3pt;
      background: var(--zr-table-head) !important;
      color: #fff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .hive-chf .totals-hive-row--ttc .totals-hive-label,
    .hive-chf .totals-hive-row--ttc .totals-hive-amount {
      color: #fff !important;
      font-weight: 600 !important;
    }
    .total-bar {
      background: var(--zr-table-head); color: #fff;
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 10mm; font-weight: 700; font-size: 7.5pt;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .total-bar-secondary {
      background: #eef3f4; color: var(--zr-title);
      border-left: 1px solid var(--zr-border); border-right: 1px solid var(--zr-border);
      border-bottom: 1px solid var(--zr-border);
    }
    .total-bar-ttc { background: #1f2a2c; color: #fff; }
    .signature-block {
      display: flex; gap: 50px; margin-top: 35px; font-size: 9.5pt;
      page-break-inside: avoid;
    }
    .sig-legal { flex: 1.5; color: var(--zr-label); line-height: 1.6; font-size: 9pt; }
    .sig-box {
      flex: 1; border-left: 1px solid var(--zr-border);
      padding-left: 25px; min-height: 140px;
    }
    .sig-title { font-weight: 800; margin-bottom: 20px; font-size: 10pt; color: var(--zr-primary); }

    @media print { .web-footer { display: none !important; } }
    .web-footer { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; }
    .footer-band {
      display: flex; justify-content: space-between; align-items: center;
      background: var(--zr-table-head); color: #fff; padding: 4px 8px;
    }
    .footer-band span { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="page${isChf ? " hive-chf" : ""}">

    <div class="hive-head-grid">
      <div class="logo-zone">
        ${EMBEDDED_LOGO_DATA_URI
      ? `<img class="logo-img" alt="Zerux" src="${EMBEDDED_LOGO_DATA_URI}" />`
      : `<div class="logo-wordmark">ZERUX</div><div class="logo-tagline">SAFE . FOR . LIFE .</div>`}
      </div>
      ${addressBlocksHtml}
      ${isChf ? '' : `<div class="quote-meta">
        <h1>${labels.quoteTitle} ${escapeHtml(number)}</h1>
        <div class="meta-body">${metaLinesInner}</div>
      </div>`}
      ${showStandaloneClient ? `
      <div class="client-box">
        <h2>${escapeHtml(clientName)}</h2>
      </div>` : ''}
    </div>

    ${tablesHtml}

    <div class="footer-summary">
      ${!isChf ? `<div class="eco-contribution">${labels.ecoContribution} ${formatPdfAmount(0, currency)}${amountSuffix}${labels.amountSuffixHt}</div>` : ""}
      ${totalWeightKg > 0 ? `<div class="eco-contribution">${labels.estimatedWeight} ${Math.round(totalWeightKg).toLocaleString(labels.dateLocale)} kg</div>` : ""}
      ${!isChf ? `
      <div class="total-bar">
        <span>${labels.grandTotalHtIn(currencyUnitLabel(currency, pdfLanguage))}</span>
        <span>${formatPdfAmount(grandTotal, currency)}${amountSuffix}</span>
      </div>
      ${commercialDiscount ? `<div class="total-bar total-bar-secondary"><span>${labels.commercialDiscount}</span><span>${formatPdfAmount(commercialDiscount, currency)}${amountSuffix}</span></div>` : ""}
      <div class="total-bar total-bar-secondary"><span>${escapeHtml(tvaLabel)}</span><span>${formatPdfAmount(tvaAmount, currency)}${amountSuffix}</span></div>
      <div class="total-bar total-bar-ttc"><span>${labels.totalTtc}</span><span>${formatPdfAmount(totalTtc, currency)}${amountSuffix}</span></div>` : ""}
      ${isChf ? "" : `
      <div class="signature-block">
        <div class="sig-legal">
          <div style="margin-bottom:15px;">
            ${labels.paymentTerms} <strong>${labels.paymentTermsValue}</strong>
          </div>
          <div style="margin-bottom:15px;">
            ${labels.deliveryDelay} <strong>${labels.deliveryDelayValue}</strong>
          </div>
          <div style="font-size:8.5pt;font-style:italic;opacity:0.8;">
            ${labels.cgv}<br/>
            ${labels.quoteValidity}
          </div>
        </div>
        <div class="sig-box">
          <div class="sig-title">${labels.signatureTitle}</div>
          <div style="border-bottom:0.5pt solid var(--zr-border);margin-top:20px;width:85%;"></div>
          <div style="display:flex;justify-content:space-between;margin-top:50px;font-size:7.5pt;font-weight:700;color:var(--zr-label);text-transform:uppercase;letter-spacing:0.05em;">
            <span>${labels.stampSignature}</span>
          </div>
        </div>
      </div>`}
      <div class="web-footer">
        <div style="width:100%;font-family:'Montserrat',sans-serif;">
          ${isChf ? "" : `
          <div class="footer-band" style="padding:4px 10mm;">
            <span>${escapeHtml(docLabel)} ${escapeHtml(number)}</span>
            <span>${labels.footerGrandTotal} &nbsp;&nbsp; ${formatPdfAmount(grandTotal, currency)}${amountSuffix}</span>
          </div>`}
          <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:12pt 10mm 15pt 10mm;">
            <div style="font-size:6.5pt;color:#636e72;line-height:1.5;flex:1;text-align:center;opacity:0.8;">
              <div style="font-weight:800;text-transform:uppercase;margin-bottom:3px;">${escapeHtml(companyLine1)}</div>
              <div>${escapeHtml(companyLine2)}</div>
            </div>
            <div style="width:100px;text-align:right;">
              <div style="display:inline-block;border:0.5pt solid ${PDF_BRAND_HEX};padding:4pt 10pt;font-size:9pt;font-weight:700;color:${PDF_BRAND_HEX};">
                ${labels.page} <span>1</span>/<span>1</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── Playwright renderer ───────────────────────────────────────────────────
/**
 * @param {string} html
 * @param {{ offerNumber?: string, grandTotalLabel?: string, companyLine1?: string, companyLine2?: string, hiveLayout?: boolean }} opts
 * @returns {Promise<Buffer>}
 */
export async function renderDevisPdfBuffer(html, opts = {}) {
  const offerNumber = opts.offerNumber || "Devis";
  const grandTotalLabel = opts.grandTotalLabel || "";
  const grandTotalCurrency = normalizeCurrency(opts.grandTotalCurrency);
  const companyLine1 = opts.companyLine1 || process.env.DEVIS_PDF_COMPANY_LINE1 || "";
  const companyLine2 = opts.companyLine2 || process.env.DEVIS_PDF_COMPANY_LINE2 || "";
  const hiveLayout = Boolean(opts.hiveLayout);
  const labels = getPdfLabels(opts.pdfLanguage);

  const footerTemplate = hiveLayout ? buildHivePdfFooterTemplate(companyLine1, companyLine2, labels.page) : `
    <div style="width:100%;font-family:'Montserrat',sans-serif;padding:0 10mm 8pt 10mm;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;">
        <div style="font-size:6.5pt;color:#636e72;line-height:1.45;flex:1;text-align:left;opacity:0.85;">
          <div style="font-weight:800;text-transform:uppercase;margin-bottom:2px;">${companyLine1}</div>
          <div>${companyLine2}</div>
        </div>
        <div style="flex-shrink:0;text-align:right;">
          <div style="display:inline-block;background:#dfe2e4;border:none;padding:3pt 8pt;font-size:8pt;font-weight:700;color:${PDF_BRAND_HEX};">
            ${labels.page} <span class="pageNumber"></span>/<span class="totalPages"></span>
          </div>
        </div>
      </div>
    </div>
  `;

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1200, height: 1600 });
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBuf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "5mm", right: "0", bottom: "22mm", left: "0" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate,
    });
    await ctx.close();
    return Buffer.from(pdfBuf);
  } finally {
    await browser.close();
  }
}

// ─── High-level builder ────────────────────────────────────────────────────
function safePdfFilePart(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackPdfFilename(devis) {
  const parts = [
    devis?.quote_number || devis?.name || (devis?.id ? `D${devis.id}` : null),
    devis?.client_name || null,
  ].map(safePdfFilePart).filter(Boolean);
  return `${parts.length ? parts.join(" - ") : "devis"}.pdf`;
}

/**
 * @param {{ devis: object, lines: object[], contactName?: string, contactPhone?: string, contactEmail?: string, companyLine1?: string, companyLine2?: string }} input
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
export async function buildDevisNexusPdf(input) {
  const { devis, lines = [] } = input;
  const pdfLanguage = normalizePdfLanguage(input.pdfLanguage || devis?.pdf_language);
  const number = devis.quote_number || devis.name || `D${devis.id}`;
  const currency = normalizeCurrency(devis.currency);
  const isChf = currency === "CHF";
  const dateLabel = formatDate(devis.created_at || Date.now(), { dotted: isChf, locale: getPdfLabels(pdfLanguage).dateLocale });
  const grandTotal = Number(devis.total_ht) || lines.reduce((s, l) => s + (Number(l.total_ligne_ht) || 0), 0);
  const resolvedCompanyLine1 = input.companyLine1 || (isChf
    ? "Zerux International SA – Route de Crassier 7 – CH-1262 Eysins – Tel : +41 (0)26 519 02 99"
    : process.env.DEVIS_PDF_COMPANY_LINE1 || "");
  const resolvedCompanyLine2 = input.companyLine2 || (isChf
    ? "SA au capital de 100'000 CHF – UID : CHE-385.444.080 – TVA : CHE-385.444.080 – RC Vaud : CH-550.1.253.039-2"
    : process.env.DEVIS_PDF_COMPANY_LINE2 || "");

  const html = buildDevisNexusHtml({
    ...input,
    pdfLanguage,
    offerNumber: number,
    offerDateLabel: dateLabel,
    referenceLabel: devis.deal_id || "—",
    companyLine1: resolvedCompanyLine1,
    companyLine2: resolvedCompanyLine2,
  });

  const buffer = await renderDevisPdfBuffer(html, {
    offerNumber: number,
    grandTotalLabel: grandTotal ? formatPdfAmount(grandTotal, currency) : "",
    grandTotalCurrency: currency,
    companyLine1: resolvedCompanyLine1,
    companyLine2: resolvedCompanyLine2,
    hiveLayout: isChf,
    pdfLanguage,
  });

  const filename = devis.pdf_filename || fallbackPdfFilename(devis);

  return { buffer, filename };
}
