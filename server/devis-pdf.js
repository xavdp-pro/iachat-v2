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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_BRAND_HEX = "#3c4b4d";
const FONT_DIR = path.join(__dirname, "../../ressources/Polices");

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
      const b64 = fs.readFileSync(path.join(FONT_DIR, f.file)).toString("base64");
      return `@font-face{font-family:'${f.family}';src:url('data:font/${f.fmt};base64,${b64}') format('${f.fmt}');font-weight:${f.weight};font-style:${f.style};font-display:block;}`;
    } catch { return ""; }
  }).filter(Boolean).join("\n");
}

export const FONT_FACES_CSS = buildFontFacesCss();

function readEmbeddedLogoDataUri() {
  const candidates = [
    path.join(__dirname, "../public/zerux-logo.png"),
    path.join(__dirname, "../../ressources/images/logo-zerux-dark.png"),
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
  const rounded = Math.round(x * 100) / 100;
  const [whole, decimals] = rounded.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  if (decimals === "00") return `${grouped} .–`;
  return `${grouped}.${decimals}`;
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

function currencyUnitLabel(currency) {
  return {
    EUR: "EUROS",
    CHF: "FRANCS SUISSES",
    GBP: "LIVRES STERLING",
    USD: "DOLLARS US",
  }[normalizeCurrency(currency)] || "EUROS";
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
  try {
    const raw = typeof line.raw_json === "string" ? JSON.parse(line.raw_json) : line.raw_json;
    if (raw?.weight_kg != null) return Number(raw.weight_kg);
  } catch { /* noop */ }
  return line.weight_kg != null ? Number(line.weight_kg) : null;
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

function formatDate(isoOrDate) {
  if (!isoOrDate) return "—";
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return String(isoOrDate);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
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

function formatDesignationBodyLine(line) {
  const raw = String(line || "").trim();
  const escaped = escapeHtml(raw);
  if (!raw) return "";
  if (/^Dimensions\s+hors[-\s]tout\s*:/i.test(raw)) return `<div class="line-body-row line-strong">${escaped}</div>`;
  if (/^Soit dimensions hors[-\s]tout\s*:/i.test(raw)) return `<div class="line-body-row line-strong">${escaped}</div>`;
  if (/^Réservation gros[-\s]?œuvre/i.test(raw)) return `<div class="line-body-row line-strong">${escaped}</div>`;
  if (/^Poids approximatif/i.test(raw)) return `<div class="line-body-row">${escaped}</div>`;
  if (/^Equipement fourni-posé\s*:/i.test(raw)) return `<div class="line-body-row line-equipment-head">${escaped}</div>`;
  if (/^-\s+/.test(raw)) return `<div class="line-body-row line-bullet">${escaped}</div>`;
  if (/^Localisation\s*:/i.test(raw)) return `<div class="line-body-row line-localisation-inline">${escaped}</div>`;
  if (/^(?:[0-9]{1,3}\s*DB\s+MAXI|VARIANTE\b|OPTION\b|SP[ÉE]CIFICIT[ÉE]\b|PR[ÉE]CISION\b|NOTA\b)/i.test(raw)) return `<div class="line-body-row line-note-strong">${escaped}</div>`;
  return `<div class="line-body-row">${escaped}</div>`;
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
    contactName = devis.requester_contact_name || process.env.DEVIS_PDF_CONTACT_NAME || "Votre commercial Zerux",
    contactPhone = process.env.DEVIS_PDF_CONTACT_PHONE || "",
    contactEmail = process.env.DEVIS_PDF_CONTACT_EMAIL || "",
    companyLine1: inputCompanyLine1 = process.env.DEVIS_PDF_COMPANY_LINE1 || "",
    companyLine2: inputCompanyLine2 = process.env.DEVIS_PDF_COMPANY_LINE2 || "",
  } = data;

  const docLabel = "Devis";
  const number = offerNumber || devis.name || `D${devis.id}`;
  const dateLabel = offerDateLabel || formatDate(devis.created_at);
  const refLabel = referenceLabel || devis.deal_id || "—";
  const clientName = devis.client_name || "—";
  const currency = normalizeCurrency(devis.currency);
  const isChf = currency === "CHF";
  const { deliveryLines, billingLines } = extractPdfAddresses(devis, lines);
  const affair = affairLabel(devis);

  // Build table rows from devis_lines (Hive layout: no section headers, no délais column)
  let displayIndex = 0;
  const rowsHtml = lines.filter(line => line.line_section !== "calculations").map((line) => {
    const gamme = line.gamme ? `[${escapeHtml(line.gamme)}]` : "";
    const dims = (line.hauteur_mm && line.largeur_mm)
      ? ` H${line.hauteur_mm}×L${line.largeur_mm} mm` : "";
    const passageDims = pdfPassageDimensions(line);
    const passageDimsLabel = passageDims.h != null && passageDims.l != null
      ? `${passageDims.label} H${passageDims.h}×L${passageDims.l} mm`
      : "";
    const reservationDimsLabel = passageDims.reservationH != null && passageDims.reservationL != null
      ? `Réservation GO H${passageDims.reservationH}×L${passageDims.reservationL} mm`
      : "";
    const vantail = line.vantail ? ` — ${escapeHtml(line.vantail)}` : "";

    // Split multi-line designation: first line = bold title, rest = body block
    const desigLines = normalizeDesignationLinesForPdf(line.designation);
    const titleLine = desigLines.length
      ? escapeHtml(desigLines[0])
      : `${gamme}${dims}${vantail}`;
    const bodyHtml = desigLines.slice(1)
      .map(formatDesignationBodyLine)
      .join('');
    const localisation = String(line.localisation || "").trim();
    const hasBodyLocalisation = desigLines.some(l => /^Localisation\s*:/i.test(l));
    const localisationHtml = localisation && !hasBodyLocalisation
      ? `<div class="line-localisation">Localisation : ${escapeHtml(localisation)}</div>`
      : "";

    // Build fallback options description (shown only when no multi-line body)
    let optDesc = "";
    if (!bodyHtml && line.options_json) {
      const opts = typeof line.options_json === "string"
        ? (() => { try { return JSON.parse(line.options_json); } catch { return []; } })()
        : (Array.isArray(line.options_json) ? line.options_json : []);
      optDesc = opts.map(o => `${escapeHtml(o.label || "")}${o.prix ? ` (${formatEuro(o.prix)} €)` : ""}`).join(", ");
    }
    const weightKg = lineWeightKg(line);
    const weightLabel = Number.isFinite(weightKg) && weightKg > 0 ? `Poids approximatif - Vantail : ${weightKg} kg` : "";
    const serrure = (!bodyHtml && line.serrure_ref) ? `Serrure : ${escapeHtml(line.serrure_ref)}` : "";
    const localisationDesc = localisation ? `Localisation : ${escapeHtml(localisation)}` : "";
    const descParts = [passageDimsLabel, reservationDimsLabel, weightLabel, localisationDesc, optDesc, serrure].filter(Boolean).join(" | ");

    const total = Number(line.total_ligne_ht) || Number(line.prix_base_ht) || 0;
    const qty = lineQuantity(line);
    const unitPrice = qty > 0 && total ? total / qty : total;
    const amountSuffix = pdfAmountSuffix(currency);

    const longRow = desigLines.length > 6 || String(line.designation || '').length > 420

    const rowHtml = `
      <tr class="${longRow ? 'row-splittable' : ''}">
        <td class="cell-rep">${escapeHtml(repLetter(displayIndex))}</td>
        <td class="cell-desc">
          <div class="line-title">${titleLine}</div>
          ${bodyHtml ? `<div class="line-body">${bodyHtml}</div>` : (descParts ? `<div class="line-desc">${descParts}</div>` : "")}
          ${bodyHtml ? localisationHtml : ""}
        </td>
        <td class="cell-num cell-qty">${qty}</td>
        <td class="cell-num">${total ? `${formatPdfAmount(unitPrice, currency)}` : "—"}</td>
        <td class="cell-num">${total ? `${formatPdfAmount(total, currency)}` : "—"}</td>
      </tr>`;
    displayIndex += 1;
    return rowHtml;
  }).join("");

  const grandTotal = lines.reduce((sum, line) => sum + (Number(line.total_ligne_ht) || Number(line.prix_base_ht) || 0), 0)
    || Number(devis.total_ht) || 0;
  const commercialDiscount = Number(devis.commercial_discount_ht || 0) || 0;
  const totalAfterDiscount = grandTotal + commercialDiscount;
  const tvaRate = Number(devis.tva_rate);
  const effectiveTvaRate = Number.isFinite(tvaRate) ? tvaRate : 0.2;
  const tvaAmount = totalAfterDiscount * effectiveTvaRate;
  const totalTtc = totalAfterDiscount + tvaAmount;
  const totalWeightKg = lines.reduce((sum, line) => {
    const weight = lineWeightKg(line);
    return Number.isFinite(weight) && weight > 0 ? sum + weight : sum;
  }, 0);
  const amountSuffix = pdfAmountSuffix(currency);
  const companyLine1 = inputCompanyLine1 || (isChf
    ? "Zerux International SA – Route de Crassier 7 – CH-1262 Eysins – Tel : +41 (0)26 519 02 99"
    : "");
  const companyLine2 = inputCompanyLine2 || (isChf
    ? "SA au capital de 100'000 CHF – UID : CHE-385.444.080 – TVA : CHE-385.444.080 – RC Vaud : CH-550.1.253.039-2"
    : "");
  const tvaLabel = isChf
    ? `TVA déductible (achat) ${(effectiveTvaRate * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`
    : `TVA ${(effectiveTvaRate * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

  const addressBlock = (title, rows) => rows.length
    ? `<div class="address-block">
        <div class="address-title">${escapeHtml(title)}</div>
        ${rows.map(line => `<div class="address-line">${escapeHtml(line)}</div>`).join("")}
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(number)}</title>
  <style>
    ${FONT_FACES_CSS}

    @page { size: A4; margin: 5mm 0 22mm 0; }
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
    .page { padding: 0; }

    /* ── HEADER (Hive-like) ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 18px;
      padding: 0 10mm 0 3mm;
    }
    .logo-zone { width: 220px; flex-shrink: 0; }
    .logo-img { width: 100%; display: block; }
    .header-right { flex: 1; display: flex; justify-content: flex-end; gap: 28px; }
    .address-block { min-width: 180px; max-width: 240px; font-size: 8.5pt; line-height: 1.45; color: var(--zr-title); }
    .address-title { font-weight: 700; margin-bottom: 4px; text-transform: none; }
    .address-line { font-weight: 300; }

    .quote-band {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 20px;
      padding: 0 10mm 0 3mm;
    }
    .client-box { min-width: 180px; max-width: 260px; text-align: right; }
    .quote-meta { flex: 1; padding-left: 38px; }
    .quote-meta h1 {
      font-size: 11pt; font-weight: 700; margin: 0 0 10px 0;
      color: var(--zr-title); letter-spacing: 0.01em;
    }
    .meta-line { margin-bottom: 3px; display: flex; font-size: 9pt; }
    .meta-label { width: 72px; color: var(--zr-label); font-weight: 300; }
    .meta-value { font-weight: 400; flex: 1; color: var(--zr-title); }
    .client-box h2 {
      font-size: 11pt; font-weight: 700; margin: 0; color: var(--zr-title);
    }

    /* ── TABLE ── */
    table.data-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    table.data-table thead th {
      background: var(--zr-table-head); color: #fff; font-weight: 700;
      text-align: left; padding: 4px 8px; text-transform: uppercase;
      font-size: 7.5pt; letter-spacing: 0.05em; white-space: nowrap;
      vertical-align: middle; border-left: 1px dashed rgba(255,255,255,0.4);
    }
    table.data-table thead th:first-child { border-left: none; padding-left: 3mm; }
    table.data-table thead th:last-child { padding-right: 10mm; }
    table.data-table thead { display: table-header-group; }
    table.data-table tbody tr {
      border-bottom: 0.5pt solid var(--zr-row-border);
      page-break-inside: avoid; break-inside: avoid;
    }
    table.data-table tbody tr.row-splittable {
      page-break-inside: auto; break-inside: auto;
    }
    table.data-table td {
      padding: 10px 8px; vertical-align: top;
      border-left: 1px dashed var(--zr-border-dashed);
    }
    table.data-table td:first-child { border-left: none; padding-left: 3mm; }
    table.data-table td:last-child { padding-right: 10mm; }

    .section-row {
      background: #f3f7f8; color: var(--zr-title); font-size: 8pt;
      font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
      padding: 5px 10mm 5px calc(3mm + 8px) !important;
      border-left: none !important;
    }

    .cell-rep { width: 34px; min-width: 34px; text-align: center; font-weight: 700; color: var(--zr-title); }
    .cell-desc { width: auto; }
    .cell-qty { width: 42px; text-align: center; font-weight: 400; }
    .cell-num { width: 92px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 400; }

    .line-title { font-weight: 700; font-size: 9pt; margin-bottom: 2px; text-transform: uppercase; color: var(--zr-title); line-height: 1.25; }
    .line-body { font-size: 8pt; color: var(--zr-body); line-height: 1.28; font-weight: 300; margin-top: 1px; padding-left: 10px; }
    .line-body-row { margin: 0; padding: 0; }
    .line-bullet { padding-left: 4px; }
    .line-equipment-head { margin-top: 4px; font-weight: 400; }
    .line-strong { font-weight: 700; color: var(--zr-title); }
    .line-note-strong { font-weight: 700; color: var(--zr-title); margin-top: 10px; }
    .line-localisation,
    .line-localisation-inline { font-size: 8pt; color: var(--zr-title); line-height: 1.22; font-weight: 700; font-style: italic; margin-top: 2px; }
    .line-desc { font-family: 'Montserrat', sans-serif; font-size: 8.5pt; color: var(--zr-body); line-height: 1.55; font-weight: 300; }

    /* ── TOTAL ── */
    .footer-summary { margin-top: 28px; page-break-inside: avoid; break-inside: avoid; }
    .eco-contribution { text-align: right; font-size: 8.5pt; font-style: italic; color: var(--zr-label); margin-bottom: 8px; padding-right: 10mm; }
    .totals-hive {
      margin-left: auto;
      width: 320px;
      margin-right: 10mm;
      font-size: 9pt;
      color: var(--zr-title);
    }
    .totals-hive-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 3px 0;
      border-bottom: 0.5pt solid var(--zr-row-border);
    }
    .totals-hive-row strong { font-weight: 700; }
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
  <div class="page">

    <div class="header">
      <div class="logo-zone">
        ${EMBEDDED_LOGO_DATA_URI
      ? `<img class="logo-img" alt="Zerux" src="${EMBEDDED_LOGO_DATA_URI}" />`
      : `<div style="font-size:22pt;font-weight:800;color:${PDF_BRAND_HEX}">ZERUX</div>`}
      </div>
      <div class="header-right">
        ${addressBlock("Adresse de livraison", deliveryLines)}
        ${addressBlock("Adresse de facturation", billingLines)}
      </div>
    </div>

    <div class="quote-band">
      <div class="quote-meta">
        <h1>Devis n° ${escapeHtml(number)}</h1>
        <div class="meta-line">
          <div class="meta-label">Date :</div>
          <div class="meta-value">${escapeHtml(dateLabel)}</div>
        </div>
        <div class="meta-line">
          <div class="meta-label">Affaire :</div>
          <div class="meta-value">${escapeHtml(affair)}</div>
        </div>
        ${refLabel && refLabel !== '—' ? `
        <div class="meta-line">
          <div class="meta-label">Réf. :</div>
          <div class="meta-value">${escapeHtml(refLabel)}</div>
        </div>` : ''}
        ${contactName && contactName !== "Votre commercial Zerux" ? `
        <div class="meta-line" style="margin-top:10px;">
          <div class="meta-label">Contact :</div>
          <div class="meta-value">${escapeHtml(contactName)}${contactPhone ? ` — ${escapeHtml(contactPhone)}` : ""}${contactEmail ? ` — ${escapeHtml(contactEmail)}` : ""}</div>
        </div>` : ""}
      </div>
      ${clientName && clientName !== '—' ? `
      <div class="client-box">
        <h2>${escapeHtml(clientName)}</h2>
      </div>` : ''}
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width:34px;min-width:34px;text-align:center;">Rép.</th>
          <th>Désignation</th>
          <th style="width:42px;text-align:center;">Q.</th>
          <th style="width:92px;text-align:right;">P.U. HT</th>
          <th style="width:92px;text-align:right;">Total HT</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--zr-label);">Aucune ligne renseignée.</td></tr>`}
      </tbody>
    </table>

    <div class="footer-summary">
      <div class="eco-contribution">Total éco-contribution : ${formatPdfAmount(0, currency)}${amountSuffix} HT</div>
      ${totalWeightKg > 0 ? `<div class="eco-contribution">Poids estimé total : ${Math.round(totalWeightKg).toLocaleString("fr-FR")} kg</div>` : ""}
      ${isChf ? `
      <div class="totals-hive">
        <div class="totals-hive-row"><span>Total HT :</span><strong>${formatPdfAmount(grandTotal, currency)}${amountSuffix}</strong></div>
        ${commercialDiscount ? `<div class="totals-hive-row"><span>Geste commercial HT</span><strong>${formatPdfAmount(commercialDiscount, currency)}${amountSuffix}</strong></div>` : ""}
        <div class="totals-hive-row"><span>${escapeHtml(tvaLabel)}</span><strong>${formatPdfAmount(tvaAmount, currency)}${amountSuffix}</strong></div>
        <div class="totals-hive-row"><span><strong>Total TTC :</strong></span><strong>${formatPdfAmount(totalTtc, currency)}${amountSuffix}</strong></div>
      </div>` : `
      <div class="total-bar">
        <span>Montant Total HT (en ${currencyUnitLabel(currency)})</span>
        <span>${formatPdfAmount(grandTotal, currency)}${amountSuffix}</span>
      </div>
      ${commercialDiscount ? `<div class="total-bar total-bar-secondary"><span>Geste commercial HT</span><span>${formatPdfAmount(commercialDiscount, currency)}${amountSuffix}</span></div>` : ""}
      <div class="total-bar total-bar-secondary"><span>${escapeHtml(tvaLabel)}</span><span>${formatPdfAmount(tvaAmount, currency)}${amountSuffix}</span></div>
      <div class="total-bar total-bar-ttc"><span>Total TTC</span><span>${formatPdfAmount(totalTtc, currency)}${amountSuffix}</span></div>`}
      ${isChf ? "" : `
      <div class="signature-block">
        <div class="sig-legal">
          <div style="margin-bottom:15px;">
            Conditions de règlement : <strong>30 jours fin de mois le 10 par chèque</strong>
          </div>
          <div style="margin-bottom:15px;">
            Délai de livraison : <strong>Suivant accord à la commande</strong>
          </div>
          <div style="font-size:8.5pt;font-style:italic;opacity:0.8;">
            Toute commande confiée à Zerux implique l'acceptation sans réserve de nos conditions générales de vente.<br/>
            Validité du devis : 6 semaines
          </div>
        </div>
        <div class="sig-box">
          <div class="sig-title">Bon pour accord, le :</div>
          <div style="border-bottom:0.5pt solid var(--zr-border);margin-top:20px;width:85%;"></div>
          <div style="display:flex;justify-content:space-between;margin-top:50px;font-size:7.5pt;font-weight:700;color:var(--zr-label);text-transform:uppercase;letter-spacing:0.05em;">
            <span>CACHET ET SIGNATURE</span>
          </div>
        </div>
      </div>`}
      <div class="web-footer">
        <div style="width:100%;font-family:'Montserrat',sans-serif;">
          <div class="footer-band" style="padding:4px 10mm;">
            <span>${escapeHtml(docLabel)} n° ${escapeHtml(number)}</span>
            <span>MONTANT TOTAL HT &nbsp;&nbsp; ${formatPdfAmount(grandTotal, currency)}${amountSuffix}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:12pt 10mm 15pt 10mm;">
            <div style="font-size:6.5pt;color:#636e72;line-height:1.5;flex:1;text-align:center;opacity:0.8;">
              <div style="font-weight:800;text-transform:uppercase;margin-bottom:3px;">${escapeHtml(companyLine1)}</div>
              <div>${escapeHtml(companyLine2)}</div>
            </div>
            <div style="width:100px;text-align:right;">
              <div style="display:inline-block;border:0.5pt solid ${PDF_BRAND_HEX};padding:4pt 10pt;font-size:9pt;font-weight:700;color:${PDF_BRAND_HEX};">
                Page <span>1</span>/<span>1</span>
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
 * @param {{ offerNumber?: string, grandTotalLabel?: string, companyLine1?: string, companyLine2?: string }} opts
 * @returns {Promise<Buffer>}
 */
export async function renderDevisPdfBuffer(html, opts = {}) {
  const offerNumber = opts.offerNumber || "Devis";
  const grandTotalLabel = opts.grandTotalLabel || "";
  const grandTotalCurrency = normalizeCurrency(opts.grandTotalCurrency);
  const companyLine1 = opts.companyLine1 || process.env.DEVIS_PDF_COMPANY_LINE1 || "";
  const companyLine2 = opts.companyLine2 || process.env.DEVIS_PDF_COMPANY_LINE2 || "";

  const footerRight = grandTotalLabel
    ? `MONTANT TOTAL HT &nbsp;&nbsp; ${grandTotalLabel}${pdfAmountSuffix(grandTotalCurrency)}`
    : "Suite page suivante";

  const footerTemplate = `
    <div style="width:100%;font-family:'Montserrat',sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;background:${PDF_BRAND_HEX};color:#fff;padding:4px 10mm;">
        <span style="font-size:7.5pt;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">Devis n° ${offerNumber}</span>
        <span style="font-size:7.5pt;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">${footerRight}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:12pt 10mm 15pt 10mm;">
        <div style="font-size:6.5pt;color:#636e72;line-height:1.5;flex:1;text-align:center;opacity:0.8;">
          <div style="font-weight:800;text-transform:uppercase;margin-bottom:3px;">${companyLine1}</div>
          <div>${companyLine2}</div>
        </div>
        <div style="width:100px;text-align:right;">
          <div style="display:inline-block;border:0.5pt solid ${PDF_BRAND_HEX};padding:4pt 10pt;font-size:9pt;font-weight:700;color:${PDF_BRAND_HEX};">
            Page <span class="pageNumber"></span>/<span class="totalPages"></span>
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
  const number = devis.quote_number || devis.name || `D${devis.id}`;
  const dateLabel = new Date(devis.created_at || Date.now()).toLocaleDateString("fr-FR");
  const grandTotal = Number(devis.total_ht) || lines.reduce((s, l) => s + (Number(l.total_ligne_ht) || 0), 0);
  const currency = normalizeCurrency(devis.currency);
  const isChf = currency === "CHF";
  const resolvedCompanyLine1 = input.companyLine1 || (isChf
    ? "Zerux International SA – Route de Crassier 7 – CH-1262 Eysins – Tel : +41 (0)26 519 02 99"
    : process.env.DEVIS_PDF_COMPANY_LINE1 || "");
  const resolvedCompanyLine2 = input.companyLine2 || (isChf
    ? "SA au capital de 100'000 CHF – UID : CHE-385.444.080 – TVA : CHE-385.444.080 – RC Vaud : CH-550.1.253.039-2"
    : process.env.DEVIS_PDF_COMPANY_LINE2 || "");

  const html = buildDevisNexusHtml({
    ...input,
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
  });

  const filename = devis.pdf_filename || fallbackPdfFilename(devis);

  return { buffer, filename };
}
