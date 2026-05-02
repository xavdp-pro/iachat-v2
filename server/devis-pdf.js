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

function repLetter(i) {
  if (i < 26) return String.fromCharCode(65 + i);
  return String(i + 1);
}

function formatDate(isoOrDate) {
  if (!isoOrDate) return "—";
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return String(isoOrDate);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
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
    contactName = process.env.DEVIS_PDF_CONTACT_NAME || "Votre commercial Zerux",
    contactPhone = process.env.DEVIS_PDF_CONTACT_PHONE || "",
    contactEmail = process.env.DEVIS_PDF_CONTACT_EMAIL || "",
    companyLine1 = process.env.DEVIS_PDF_COMPANY_LINE1 || "",
    companyLine2 = process.env.DEVIS_PDF_COMPANY_LINE2 || "",
  } = data;

  const docLabel = "Devis";
  const number = offerNumber || devis.name || `D${devis.id}`;
  const dateLabel = offerDateLabel || formatDate(devis.created_at);
  const refLabel = referenceLabel || devis.deal_id || "—";
  const clientName = devis.client_name || "—";

  // Build table rows from devis_lines
  const rowsHtml = lines.map((line, i) => {
    const gamme = line.gamme ? `[${escapeHtml(line.gamme)}]` : "";
    const dims = (line.hauteur_mm && line.largeur_mm)
      ? ` H${line.hauteur_mm}×L${line.largeur_mm} mm` : "";
    const vantail = line.vantail ? ` — ${escapeHtml(line.vantail)}` : "";
    const title = line.designation
      ? escapeHtml(line.designation)
      : `${gamme}${dims}${vantail}`;

    // Build options description from options_json
    let optDesc = "";
    if (line.options_json) {
      const opts = typeof line.options_json === "string"
        ? (() => { try { return JSON.parse(line.options_json); } catch { return []; } })()
        : (Array.isArray(line.options_json) ? line.options_json : []);
      optDesc = opts.map(o => `${escapeHtml(o.label || "")}${o.prix ? ` (${formatEuro(o.prix)} €)` : ""}`).join(", ");
    }

    const serrure = line.serrure_ref ? `Serrure : ${escapeHtml(line.serrure_ref)}` : "";
    const descParts = [optDesc, serrure].filter(Boolean).join(" | ");

    const total = Number(line.total_ligne_ht) || Number(line.prix_base_ht) || 0;

    return `
      <tr>
        <td class="cell-rep">${escapeHtml(repLetter(i))}</td>
        <td class="cell-desc">
          <div class="line-title">${title}</div>
          ${descParts ? `<div class="line-desc">${descParts}</div>` : ""}
        </td>
        <td class="cell-delais">—</td>
        <td class="cell-num">1</td>
        <td class="cell-num">${total ? formatEuro(total) : "—"}</td>
        <td class="cell-num">${total ? formatEuro(total) : "—"}</td>
      </tr>`;
  }).join("");

  const grandTotal = Number(devis.total_ht) || lines.reduce((s, l) => s + (Number(l.total_ligne_ht) || Number(l.prix_base_ht) || 0), 0);

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

    /* ── HEADER ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 25px;
      padding: 0 10mm 0 calc(3mm + 38px);
    }
    .logo-zone { width: 260px; }
    .logo-img { width: 100%; display: block; }
    .main-title-box {
      display: flex; flex-direction: column; align-items: flex-end;
      margin-top: 10pt; text-align: right;
    }
    .main-title-main {
      font-size: 20pt; font-weight: 800; color: ${PDF_BRAND_HEX};
      letter-spacing: 0.05em; text-transform: uppercase;
    }
    .main-title-sub {
      font-size: 10pt; font-weight: 700; color: var(--zr-title);
      letter-spacing: 0.03em; text-transform: uppercase;
      margin-top: 8pt; max-width: 380px; line-height: 1.35;
    }

    /* ── METADATA ── */
    .metadata {
      display: flex; gap: 30px; margin-bottom: 30px;
      padding: 0 10mm 0 3mm;
    }
    .meta-col { flex: 1; }
    .meta-col.left {
      border-right: 1.5pt solid var(--zr-border);
      padding-right: 30px; padding-left: 38px;
    }
    .meta-box h1 {
      font-size: 11pt; font-weight: 700; margin: 0 0 12px 0;
      color: var(--zr-title); text-transform: uppercase;
      letter-spacing: 0.02em; word-break: break-word;
    }
    .meta-line { margin-bottom: 4px; display: flex; font-size: 9pt; }
    .meta-label { width: 80px; color: var(--zr-label); font-weight: 300; }
    .meta-value { font-weight: 300; flex: 1; color: var(--zr-title); }
    .contact-info { margin-top: 18px; font-size: 9pt; line-height: 1.6; }
    .contact-info .contact-name { font-weight: 400; display: block; margin-bottom: 1px; color: var(--zr-title); }
    .contact-info .contact-line { font-weight: 300; color: var(--zr-label); font-style: italic; display: block; }
    .client-box h2 {
      font-size: 12pt; font-weight: 700; margin: 0 0 10px 0; color: var(--zr-title);
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
    table.data-table td {
      padding: 10px 8px; vertical-align: top;
      border-left: 1px dashed var(--zr-border-dashed);
    }
    table.data-table td:first-child { border-left: none; padding-left: 3mm; }
    table.data-table td:last-child { padding-right: 10mm; }

    .cell-rep { width: 40px; min-width: 40px; text-align: center; font-weight: 700; color: var(--zr-title); }
    .cell-desc { width: auto; }
    .cell-delais { width: 65px; text-align: center; color: var(--zr-blue); font-size: 8.5pt; font-weight: 400; }
    .cell-num { width: 80px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 300; }

    .line-title { font-weight: 700; font-size: 9.5pt; margin-bottom: 4px; text-transform: uppercase; color: var(--zr-title); }
    .line-desc { font-family: 'Montserrat', sans-serif; font-size: 8.5pt; color: var(--zr-body); line-height: 1.55; font-weight: 300; }

    /* ── TOTAL ── */
    .footer-summary { margin-top: 50px; page-break-inside: avoid; break-inside: avoid; }
    .eco-contribution { text-align: right; font-size: 8.5pt; font-style: italic; color: var(--zr-label); margin-bottom: 8px; padding-right: 15px; }
    .total-bar {
      background: var(--zr-table-head); color: #fff;
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 10mm; font-weight: 700; font-size: 7.5pt;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
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
      <div class="main-title-box">
        <div class="main-title-main">${escapeHtml(docLabel)}</div>
        <div class="main-title-sub">PORTES COUPE-FEU / BLINDÉES / ANTI-EXPLOSION NEXUS</div>
      </div>
    </div>

    <div class="metadata">
      <div class="meta-col left">
        <div class="meta-box">
          <h1>${escapeHtml(docLabel)} N° ${escapeHtml(number)}</h1>
          <div class="meta-line">
            <div class="meta-label">Date :</div>
            <div class="meta-value">${escapeHtml(dateLabel)}</div>
          </div>
          <div class="meta-line">
            <div class="meta-label">V/Réf. :</div>
            <div class="meta-value">${escapeHtml(refLabel)}</div>
          </div>
          <div class="contact-info">
            <div style="font-size:8.5pt;font-style:italic;margin-bottom:4px;font-weight:300;color:var(--zr-label);">Votre contact commercial :</div>
            <span class="contact-name">${escapeHtml(contactName)}</span>
            ${contactPhone ? `<span class="contact-line">Tél. : ${escapeHtml(contactPhone)}</span>` : ""}
            ${contactEmail ? `<span class="contact-line">Mail : ${escapeHtml(contactEmail)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="meta-col">
        <div class="client-box">
          <h2>${escapeHtml(clientName)}</h2>
        </div>
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width:40px;min-width:40px;text-align:center;">REP.</th>
          <th>DÉSIGNATION</th>
          <th style="width:65px;text-align:center;">DÉLAIS</th>
          <th style="width:45px;text-align:right;">Q.</th>
          <th style="width:85px;text-align:right;">P.U HT</th>
          <th style="width:90px;text-align:right;">MONTANT HT</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--zr-label);">Aucune ligne renseignée.</td></tr>`}
      </tbody>
    </table>

    <div class="footer-summary">
      <div class="eco-contribution">Total éco-contribution : 0,00 € HT</div>
      <div class="total-bar">
        <span>Montant Total HT (en euros)</span>
        <span>${formatEuro(grandTotal)} €</span>
      </div>
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
      </div>
      <div class="web-footer">
        <div style="width:100%;font-family:'Montserrat',sans-serif;">
          <div class="footer-band" style="padding:4px 10mm;">
            <span>${escapeHtml(docLabel)} N° ${escapeHtml(number)}</span>
            <span>MONTANT TOTAL HT (EN EUROS) &nbsp;&nbsp; ${formatEuro(grandTotal)} €</span>
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
  const companyLine1 = opts.companyLine1 || process.env.DEVIS_PDF_COMPANY_LINE1 || "";
  const companyLine2 = opts.companyLine2 || process.env.DEVIS_PDF_COMPANY_LINE2 || "";

  const footerRight = grandTotalLabel
    ? `MONTANT TOTAL HT (EN EUROS) &nbsp;&nbsp; ${grandTotalLabel} €`
    : "Suite page suivante";

  const footerTemplate = `
    <div style="width:100%;font-family:'Montserrat',sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;background:${PDF_BRAND_HEX};color:#fff;padding:4px 10mm;">
        <span style="font-size:7.5pt;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">Devis N° ${offerNumber}</span>
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

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
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
/**
 * @param {{ devis: object, lines: object[], contactName?: string, contactPhone?: string, contactEmail?: string, companyLine1?: string, companyLine2?: string }} input
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
export async function buildDevisNexusPdf(input) {
  const { devis, lines = [] } = input;
  const number = devis.name || `D${devis.id}`;
  const dateLabel = new Date(devis.created_at || Date.now()).toLocaleDateString("fr-FR");
  const grandTotal = Number(devis.total_ht) || lines.reduce((s, l) => s + (Number(l.total_ligne_ht) || 0), 0);

  const html = buildDevisNexusHtml({
    ...input,
    offerNumber: number,
    offerDateLabel: dateLabel,
    referenceLabel: devis.deal_id || "—",
  });

  const buffer = await renderDevisPdfBuffer(html, {
    offerNumber: number,
    grandTotalLabel: grandTotal ? new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(grandTotal) : "",
    companyLine1: input.companyLine1,
    companyLine2: input.companyLine2,
  });

  const slug = String(number).replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `Devis_NEXUS_${slug}.pdf`;

  return { buffer, filename };
}
