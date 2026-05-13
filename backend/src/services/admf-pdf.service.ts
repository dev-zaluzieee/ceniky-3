/**
 * Customer-facing OBJEDNÁVKA PDF for a persisted ADMF form.
 *
 * Replaces the legacy PNG generator (admf-image.service.ts). The output is a
 * real PDF that mirrors the printed contract template used by žaluzieee:
 * branded header, customer grid, fixed-slot product table, payment & deposit
 * boxes, A-N toggle column, legal text, and signature row.
 *
 * Architecture: pdf-lib (same dependency the inSign POC already vetted) +
 * Roboto TTFs embedded via @pdf-lib/fontkit for full Czech diacritic support.
 *
 * Layout philosophy: A4 portrait with manual coordinate placement. The page
 * is conceptually a stack of horizontal "bands". Each band has its own y
 * range; helpers draw cells, labels, and values relative to that band.
 */

import { PDFDocument, PDFFont, PDFPage, PDFImage, rgb, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** A4 portrait in points. */
const PAGE_W = 595.276;
const PAGE_H = 841.89;
const MARGIN = 24;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const FG = rgb(0.06, 0.08, 0.14);
const MUTED = rgb(0.42, 0.45, 0.5);
const BORDER = rgb(0.55, 0.57, 0.62);
const BAND_BG = rgb(0.94, 0.95, 0.97);

const FONT_SIZE_TITLE = 16;
const FONT_SIZE_HEADING = 11;
const FONT_SIZE_BODY = 9;
const FONT_SIZE_SMALL = 7.5;
const FONT_SIZE_LABEL = 6.5;
const FONT_SIZE_LEGAL = 6.5;

const ROBOTO_REG_PATH = path.resolve(__dirname, "../../fonts/Roboto-Regular.ttf");
const ROBOTO_BOLD_PATH = path.resolve(__dirname, "../../fonts/Roboto-Bold.ttf");
const LOGO_PATH = path.resolve(__dirname, "../../assets/logo.png");

const LEGAL_TEXT =
  "Kupující podpisem této Objednávky potvrzuje a bere na vědomí, že: " +
  "1. ve smyslu § 1837 písm. d) občanského zákoníku. nemůže odstoupit od objednávky (Kupní smlouvy) ve lhůtě 14 dnů ode dne jejího uzavření, neboť se jedná o dodávku zboží vyrobeného podle požadavků Kupujícího nebo přizpůsobeného jeho osobním potřebám; " +
  "2. byl/a řádně seznámen/a s obchodními podmínkami, které jsou přiloženy k této objednávce a souhlasí s jejich platností a dodržováním pro účely dodání objednaného Zboží; " +
  "3. objednávka (resp. Kupní smlouva) se dle platných obchodních podmínek považuje za uzavřenou podpisem oběma stranami a uhrazením zálohy na základě zálohové faktury/příjmového dokladu; " +
  "4. údaje, které poskytl Prodávajícímu zejména v sekci „bytový prostor\", jsou pravdivé a skutečné; " +
  "5. souhlasí s obsahem této objednávky, zejména v sekci „Specifikace zboží; " +
  "6. fakturační údaje nelze po uzavření Objednávky (resp. Kupní smlouvy) měnit; " +
  "7. stínící technika neslouží k zatemnění interiéru. Tudíž nelze akceptovat námitky na propustnost slunečních paprsků do interiéru. " +
  "8. v případě vad zboží má Kupující práva z vadného plnění dle § 2099 a násl občanského zákoníku, zejména právo na odstranění vady dodáním nového zboží bez vady nebo dodáním chybějícího zboží, na odstranění vady opravou zboží, na přiměřenou slevu z kupní ceny, nebo odstoupit od objednávky (resp. Kupní smlouvy); bližší podrobnosti práv z vadného plnění a práv ze záruky jsou uvedeny v reklamačním řádu.";

const DEMAXIA_LINE =
  "Prodávající: DEMAXIA, s.r.o. IČO: 06045898, tel.: 553 400 340, sídlo: U Habrovky 247/11, Praha-Krč, 140 00, zapsán v OR u Městského soudu v Praze pod sp. zn. C 274918";

const MIN_PRODUCT_ROWS = 7;

// ---------------------------------------------------------------------------
// Form data shape — pulled inline rather than importing from frontend types
// (this service shouldn't depend on frontend code)
// ---------------------------------------------------------------------------

interface PriceAffectingField {
  label?: string;
  value?: string;
}

interface ProductRow {
  produkt?: string;
  ks?: number;
  cena?: number;
  sleva?: number;
  cenaPoSleve?: number;
  priceAffectingFields?: PriceAffectingField[];
}

interface AdmfFormData {
  name?: string;
  // Customer
  jmenoPrijmeni?: string;
  ico?: string;
  dic?: string;
  nazevFirmy?: string;
  email?: string;
  telefon?: string;
  ulice?: string;
  mesto?: string;
  psc?: string;
  castMesta?: string;
  bytRdFirma?: string; // "BYT" | "RD" | "FIRMA" — admin-chosen radio
  typOsoby?: "soukroma" | "pravnicka";
  // Delivery
  jinaAdresaDodani?: boolean;
  dodaciUlice?: string;
  dodaciMesto?: string;
  dodaciPsc?: string;
  // Další informace
  patro?: string;
  zv?: string;
  parkovani?: boolean;
  maZakaznikVyfocenouLamelu?: boolean;
  zvonek?: string;
  infoKParkovani?: string;
  // Booleans for right-side toggles
  platceDph?: boolean;
  faktura?: boolean;
  typProstoru?: "bytovy" | "nebytovy";
  vatRate?: 0 | 12 | 21;
  // Products + montáž
  productRows?: ProductRow[];
  montazCenaBezDph?: number;
  // Discounts (s DPH — the customer-visible amounts)
  ovtSlevaSDph?: number;
  mngSleva?: boolean;
  mngSlevaSDph?: number;
  // Doplňující informace
  doplnujiciInformaceObjednavky?: string;
  doplnujiciInformaceMontaz?: string;
  poznamkyVyroba?: string; // legacy fallback
  poznamkyMontaz?: string; // legacy fallback
  // K objednání + payment
  kObjednani?: string;
  zalohaZaplacena?: string;
  zalohovaFaktura?: number;
  variabilniSymbol?: number;
  doplatek?: number;
  infoKZaloze?: string;
  infoKFakture?: string;
  // Předpokládaná
  predpokladanaDodaciDoba?: string;
  kodTerminalu?: string;
  dobaMontaze?: string;
  predpokladanaDobaMontaze?: string; // legacy fallback
  // Signature
  datum?: string;
  podpisZakaznika?: string;
  jmenoPodpisZprostredkovatele?: string;
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  fontReg: PDFFont;
  fontBold: PDFFont;
  logo: PDFImage | null;
}

/** Convert "y from top" → pdf-lib's bottom-origin coordinate. */
function fromTop(y: number, h = 0): number {
  return PAGE_H - y - h;
}

function rect(ctx: Ctx, x: number, yTop: number, w: number, h: number, opts?: { fill?: RGB; border?: RGB; borderWidth?: number }): void {
  ctx.page.drawRectangle({
    x,
    y: fromTop(yTop, h),
    width: w,
    height: h,
    color: opts?.fill,
    borderColor: opts?.border ?? BORDER,
    borderWidth: opts?.borderWidth ?? 0.5,
  });
}

/**
 * Draw text inside a box, with auto-truncation if it exceeds maxWidth.
 * x is the LEFT edge of the text, yTop is the TOP of the line.
 */
function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  yTop: number,
  opts?: {
    size?: number;
    bold?: boolean;
    color?: RGB;
    maxWidth?: number;
    align?: "left" | "center" | "right";
  }
): void {
  const size = opts?.size ?? FONT_SIZE_BODY;
  const font = opts?.bold ? ctx.fontBold : ctx.fontReg;
  const color = opts?.color ?? FG;
  let display = text;
  if (opts?.maxWidth) {
    while (display.length > 0 && font.widthOfTextAtSize(display, size) > opts.maxWidth) {
      display = display.slice(0, -1);
    }
    if (display.length < text.length && display.length > 1) {
      // Replace last char with ellipsis when truncated.
      display = display.slice(0, -1) + "…";
    }
  }
  let xDraw = x;
  if (opts?.align === "center" && opts.maxWidth) {
    xDraw = x + (opts.maxWidth - font.widthOfTextAtSize(display, size)) / 2;
  } else if (opts?.align === "right" && opts.maxWidth) {
    xDraw = x + opts.maxWidth - font.widthOfTextAtSize(display, size);
  }
  ctx.page.drawText(display, {
    x: xDraw,
    y: fromTop(yTop + size),
    size,
    font,
    color,
  });
}

/** Wrap text to multiple lines that fit inside maxWidth. */
function wrapLines(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? current + " " + w : w;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Cell with a small label in the top-left corner and a value below it.
 * Used for the customer grid and similar labeled fields.
 */
function drawLabeledCell(
  ctx: Ctx,
  x: number,
  yTop: number,
  w: number,
  h: number,
  label: string,
  value: string,
  opts?: { valueBold?: boolean; valueSize?: number; valueAlign?: "left" | "center" | "right"; pad?: number }
): void {
  rect(ctx, x, yTop, w, h);
  const pad = opts?.pad ?? 3;
  // Label in top-left
  drawText(ctx, label, x + pad, yTop + pad, {
    size: FONT_SIZE_LABEL,
    color: MUTED,
    maxWidth: w - 2 * pad,
  });
  // Value below label
  if (value) {
    drawText(ctx, value, x + pad, yTop + pad + FONT_SIZE_LABEL + 2, {
      size: opts?.valueSize ?? FONT_SIZE_BODY,
      bold: opts?.valueBold,
      maxWidth: w - 2 * pad,
      align: opts?.valueAlign,
    });
  }
}

/**
 * "A - N" toggle. Renders the label on the left of the cell and the A-N pair
 * on the right with a circle around the active letter.
 */
function drawAnCell(
  ctx: Ctx,
  x: number,
  yTop: number,
  w: number,
  h: number,
  label: string,
  state: "A" | "N" | null
): void {
  rect(ctx, x, yTop, w, h);
  const pad = 4;
  // Label centered vertically on the left
  drawText(ctx, label, x + pad, yTop + (h - FONT_SIZE_BODY) / 2 + 1, {
    size: FONT_SIZE_BODY,
    bold: true,
    maxWidth: w - 40,
  });
  // A - N markers on the right
  const aX = x + w - 28;
  const dashX = x + w - 19;
  const nX = x + w - 10;
  const charY = yTop + (h - FONT_SIZE_BODY) / 2 + 1;
  drawText(ctx, "A", aX, charY, { size: FONT_SIZE_BODY, bold: true });
  drawText(ctx, "-", dashX, charY, { size: FONT_SIZE_BODY });
  drawText(ctx, "N", nX, charY, { size: FONT_SIZE_BODY, bold: true });
  if (state === "A") {
    ctx.page.drawCircle({
      x: aX + 2.5,
      y: fromTop(charY + FONT_SIZE_BODY / 2 + 1),
      size: 5,
      borderColor: FG,
      borderWidth: 0.8,
    });
  } else if (state === "N") {
    ctx.page.drawCircle({
      x: nX + 2.5,
      y: fromTop(charY + FONT_SIZE_BODY / 2 + 1),
      size: 5,
      borderColor: FG,
      borderWidth: 0.8,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers — value formatting
// ---------------------------------------------------------------------------

function fmtKc(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "";
  return `${Math.round(n)} Kč`;
}

function joinCity(d: AdmfFormData): string {
  const city = (d.mesto ?? "").trim();
  const psc = (d.psc ?? "").trim();
  // City takes precedence; PSC appended as ", 120 00". When city is missing
  // we fall back to PSC alone so the cell isn't completely empty.
  if (city && psc) return `${city}, ${psc}`;
  return city || psc;
}

function joinName(d: AdmfFormData): string {
  if (d.typOsoby === "pravnicka" && d.nazevFirmy?.trim()) {
    return d.nazevFirmy.trim();
  }
  return (d.jmenoPrijmeni ?? "").trim();
}

function deriveBytRdFirma(d: AdmfFormData): string {
  if (d.bytRdFirma?.trim()) return d.bytRdFirma.trim();
  // Fallback from typOsoby (admin's two-valued field maps to two of three)
  if (d.typOsoby === "pravnicka") return "FIRMA";
  if (d.typOsoby === "soukroma") return "BYT";
  return "";
}

// ---------------------------------------------------------------------------
// Section drawers
// ---------------------------------------------------------------------------

/** Header band: logo (left), OBJEDNÁVKA (right), DEMAXIA line, "Kupující:". */
function drawHeader(ctx: Ctx, yTop: number): number {
  let y = yTop;
  // Logo (preserve aspect ratio: source is 2821:840 ≈ 3.36)
  let logoBottom = y;
  if (ctx.logo) {
    const logoW = 110;
    const logoH = logoW * (ctx.logo.height / ctx.logo.width);
    ctx.page.drawImage(ctx.logo, {
      x: MARGIN,
      y: fromTop(y, logoH),
      width: logoW,
      height: logoH,
    });
    logoBottom = y + logoH;
  }
  // Title right-aligned on the same row
  drawText(ctx, "OBJEDNÁVKA", MARGIN, y + 4, {
    size: FONT_SIZE_TITLE,
    bold: true,
    maxWidth: CONTENT_W,
    align: "right",
  });
  // Advance past whichever is taller: title row or logo. Add small padding.
  y = Math.max(y + 28, logoBottom + 4);
  // DEMAXIA line
  const demaxiaLines = wrapLines(ctx.fontReg, DEMAXIA_LINE, FONT_SIZE_SMALL, CONTENT_W);
  for (const line of demaxiaLines) {
    drawText(ctx, line, MARGIN, y, { size: FONT_SIZE_SMALL });
    y += FONT_SIZE_SMALL + 1.5;
  }
  y += 2;
  // "Kupující:" label
  drawText(ctx, "Kupující:", MARGIN, y, { size: FONT_SIZE_SMALL, bold: true });
  y += FONT_SIZE_SMALL + 2;
  return y;
}

/** Customer grid: 3 rows × 3 cols + parkování. */
function drawCustomerGrid(ctx: Ctx, yTop: number, d: AdmfFormData): number {
  const rowH = 22;
  // Column widths: pravá je BYT/RD/FIRMA (narrow), levá MĚSTO (~30%), střední JMÉNO (~50%)
  const col1W = 165;
  const col3W = 110;
  const col2W = CONTENT_W - col1W - col3W;
  const x1 = MARGIN;
  const x2 = x1 + col1W;
  const x3 = x2 + col2W;

  // Row 1 — combine city + PSC in MĚSTO so we don't need a separate row for PSC
  let y = yTop;
  drawLabeledCell(ctx, x1, y, col1W, rowH, "MĚSTO", joinCity(d));
  drawLabeledCell(ctx, x2, y, col2W, rowH, "JMÉNO A PŘÍJMENÍ", joinName(d), { valueBold: true });
  drawLabeledCell(ctx, x3, y, col3W, rowH, "BYT / RD / FIRMA", deriveBytRdFirma(d));
  y += rowH;

  // Row 2 — ČÁST MĚSTA | TELEFON | P: + ZV:
  drawLabeledCell(ctx, x1, y, col1W, rowH, "ČÁST MĚSTA", d.castMesta ?? "");
  drawLabeledCell(ctx, x2, y, col2W, rowH, "TELEFON", d.telefon ?? "");
  // P: and ZV: in two sub-cells inside col3
  const pW = col3W / 2;
  drawLabeledCell(ctx, x3, y, pW, rowH, "P:", d.patro ?? "");
  drawLabeledCell(ctx, x3 + pW, y, col3W - pW, rowH, "ZV:", d.zv ?? "");
  y += rowH;

  // Row 3 — ULICE | E-MAIL | STRANA / CELKEM
  drawLabeledCell(ctx, x1, y, col1W, rowH, "ULICE", d.ulice ?? "");
  drawLabeledCell(ctx, x2, y, col2W, rowH, "E-MAIL", d.email ?? "");
  // Right cell: STRANA / CELKEM (computed at page emit time; placeholder "1 / 1" — overwritten by stamping)
  const sW = col3W / 2;
  drawLabeledCell(ctx, x3, y, sW, rowH, "STRANA", "1");
  drawLabeledCell(ctx, x3 + sW, y, col3W - sW, rowH, "CELKEM", "1");
  y += rowH;

  // Row 4 — same height as the others to prevent text bleeding into the
  // section title below. Left side is intentionally blank (PSC + city are
  // now in MĚSTO); right side carries the PARKOVÁNÍ A-N toggle.
  rect(ctx, x1, y, col1W + col2W, rowH);
  drawAnCell(
    ctx,
    x3,
    y,
    col3W,
    rowH,
    "PARKOVÁNÍ OK / ŠPATNÉ",
    d.parkovani == null ? null : d.parkovani ? "A" : "N"
  );
  y += rowH;
  return y;
}

/** Centered section heading like "Specifikace zboží". */
function drawSectionTitle(ctx: Ctx, yTop: number, label: string): number {
  const h = 18;
  rect(ctx, MARGIN, yTop, CONTENT_W, h, { fill: BAND_BG });
  drawText(ctx, label, MARGIN, yTop + (h - FONT_SIZE_HEADING) / 2 + 1, {
    size: FONT_SIZE_HEADING,
    bold: true,
    maxWidth: CONTENT_W,
    align: "center",
  });
  return yTop + h;
}

/**
 * Product table — 7 fixed rows minimum + M (montáž) + celkem.
 * All monetary cells render the s-DPH (with VAT) value. Stored prices in
 * `form_json` are bez-DPH, so we multiply by `(1 + vatRate/100)` at render
 * time. `celkem` shows only the s-DPH total per request.
 */
function drawProductTable(ctx: Ctx, yTop: number, d: AdmfFormData): number {
  const vat = d.vatRate ?? 12;
  const withVat = (n: number) => Math.round(n * (1 + vat / 100));
  const rowH = 20;
  const cols = [
    { key: "produkt", label: "produkt", w: 0, align: "left" as const },
    { key: "ks", label: "ks", w: 35, align: "center" as const },
    { key: "ram", label: "rám", w: 80, align: "left" as const },
    { key: "lamela", label: "lamela/látka", w: 88, align: "left" as const },
    { key: "cena", label: "cena", w: 60, align: "right" as const },
    { key: "sleva", label: "sleva", w: 45, align: "right" as const },
    { key: "cenapo", label: "cena po slevě", w: 85, align: "right" as const },
  ];
  // Compute first column to fill remaining width
  const fixedSum = cols.slice(1).reduce((s, c) => s + c.w, 0);
  cols[0].w = CONTENT_W - fixedSum;
  const xOf = (idx: number) => MARGIN + cols.slice(0, idx).reduce((s, c) => s + c.w, 0);

  // Header row
  rect(ctx, MARGIN, yTop, CONTENT_W, rowH, { fill: BAND_BG });
  cols.forEach((c, i) => {
    rect(ctx, xOf(i), yTop, c.w, rowH);
    drawText(ctx, c.label, xOf(i) + 4, yTop + (rowH - FONT_SIZE_BODY) / 2 + 1, {
      size: FONT_SIZE_BODY,
      bold: true,
      maxWidth: c.w - 8,
      align: c.align === "left" ? undefined : c.align,
    });
  });

  let y = yTop + rowH;
  const dataRows = d.productRows ?? [];
  const rowsToShow = Math.max(MIN_PRODUCT_ROWS, dataRows.length);
  for (let i = 0; i < rowsToShow; i++) {
    const row = dataRows[i];
    cols.forEach((c, ci) => {
      rect(ctx, xOf(ci), y, c.w, rowH);
    });
    if (row) {
      const cells = [
        row.produkt ?? "",
        String(row.ks ?? ""),
        row.priceAffectingFields?.[0]?.value ?? "",
        row.priceAffectingFields?.[1]?.value ?? "",
        row.cena != null ? String(withVat(row.cena)) : "",
        row.sleva != null ? `${Math.round(row.sleva)} %` : "%",
        row.cenaPoSleve != null ? String(withVat(row.cenaPoSleve)) : "",
      ];
      cells.forEach((cell, ci) => {
        if (cell) {
          drawText(ctx, cell, xOf(ci) + 4, y + (rowH - FONT_SIZE_BODY) / 2 + 1, {
            size: FONT_SIZE_BODY,
            maxWidth: cols[ci].w - 8,
            align: cols[ci].align === "left" ? undefined : cols[ci].align,
          });
        } else if (ci === 5) {
          // Empty sleva column: still render the trailing "%"
          drawText(ctx, "%", xOf(ci) + cols[ci].w - 12, y + (rowH - FONT_SIZE_BODY) / 2 + 1, {
            size: FONT_SIZE_BODY,
            color: MUTED,
          });
        }
      });
    } else {
      // Empty placeholder row: always render the "%" in sleva column
      drawText(ctx, "%", xOf(5) + cols[5].w - 12, y + (rowH - FONT_SIZE_BODY) / 2 + 1, {
        size: FONT_SIZE_BODY,
        color: MUTED,
      });
    }
    y += rowH;
  }

  // Montáž row (always shown; produkt = "M", cena = montáž s DPH).
  cols.forEach((c, ci) => rect(ctx, xOf(ci), y, c.w, rowH));
  drawText(ctx, "M", xOf(0) + 4, y + (rowH - FONT_SIZE_BODY) / 2 + 1, { size: FONT_SIZE_BODY, bold: true });
  const montaz = d.montazCenaBezDph ?? 0;
  if (montaz > 0) {
    const montazSDph = String(withVat(montaz));
    drawText(ctx, montazSDph, xOf(4) + 4, y + (rowH - FONT_SIZE_BODY) / 2 + 1, {
      size: FONT_SIZE_BODY,
      maxWidth: cols[4].w - 8,
      align: "right",
    });
    drawText(ctx, montazSDph, xOf(6) + 4, y + (rowH - FONT_SIZE_BODY) / 2 + 1, {
      size: FONT_SIZE_BODY,
      maxWidth: cols[6].w - 8,
      align: "right",
    });
  }
  y += rowH;

  // Order-level slevy (OVT, MNG) — render between Montáž and Celkem so the
  // customer can reconcile: product rows + montáž − slevy = celkem. Stored
  // s-DPH (the customer-visible amount), so no withVat() conversion here.
  const ovtSlevaSDph = Math.max(0, Math.round(d.ovtSlevaSDph ?? 0));
  const mngSlevaSDph = d.mngSleva ? Math.max(0, Math.round(d.mngSlevaSDph ?? 0)) : 0;
  const drawSlevaRow = (label: string, sDph: number) => {
    cols.forEach((c, ci) => rect(ctx, xOf(ci), y, c.w, rowH));
    drawText(ctx, label, xOf(0) + 4, y + (rowH - FONT_SIZE_BODY) / 2 + 1, { size: FONT_SIZE_BODY });
    const valueText = `-${sDph}`;
    drawText(ctx, valueText, xOf(4) + 4, y + (rowH - FONT_SIZE_BODY) / 2 + 1, {
      size: FONT_SIZE_BODY,
      maxWidth: cols[4].w - 8,
      align: "right",
    });
    drawText(ctx, valueText, xOf(6) + 4, y + (rowH - FONT_SIZE_BODY) / 2 + 1, {
      size: FONT_SIZE_BODY,
      maxWidth: cols[6].w - 8,
      align: "right",
    });
    y += rowH;
  };
  if (ovtSlevaSDph > 0) drawSlevaRow("Sleva (objednávka)", ovtSlevaSDph);
  if (mngSlevaSDph > 0) drawSlevaRow("Sleva (firma)", mngSlevaSDph);

  // Celkem row — merge the last two columns (sleva + cena po slevě) into one
  // wide cell. Per request, shows only s DPH.
  const sumProducts = (d.productRows ?? []).reduce((s, r) => s + (r.cenaPoSleve ?? 0), 0);
  const preDiscountSDph = withVat(sumProducts + montaz);
  const celkemSDph = Math.max(0, preDiscountSDph - ovtSlevaSDph - mngSlevaSDph);
  const celkemH = rowH;
  // Draw cells 0-4 as usual
  for (let ci = 0; ci < 5; ci++) {
    rect(ctx, xOf(ci), y, cols[ci].w, celkemH, { fill: BAND_BG });
  }
  // Single wide cell spanning sleva + cena po slevě columns
  const mergedX = xOf(5);
  const mergedW = cols[5].w + cols[6].w;
  rect(ctx, mergedX, y, mergedW, celkemH, { fill: BAND_BG });
  drawText(ctx, "celkem:", mergedX + 8, y + (celkemH - FONT_SIZE_BODY) / 2 + 1, {
    size: FONT_SIZE_BODY,
    bold: true,
  });
  drawText(ctx, fmtKc(celkemSDph), mergedX + 4, y + (celkemH - FONT_SIZE_BODY) / 2 + 1, {
    size: FONT_SIZE_BODY,
    bold: true,
    maxWidth: mergedW - 8,
    align: "right",
  });
  y += celkemH;

  return y;
}

/**
 * Two-column band: left = doplňující informace blocks, right = A-N toggle column.
 */
function drawDoplnujiciAndToggles(ctx: Ctx, yTop: number, d: AdmfFormData): number {
  const leftW = CONTENT_W * 0.66;
  const rightW = CONTENT_W - leftW;
  const leftX = MARGIN;
  const rightX = MARGIN + leftW;

  const leftBlockH = 50;
  const totalH = leftBlockH * 2; // two stacked blocks

  // Left: two stacked multi-line text blocks
  rect(ctx, leftX, yTop, leftW, leftBlockH);
  drawText(ctx, "doplňující informace pro objednávky:", leftX + 3, yTop + 3, {
    size: FONT_SIZE_LABEL,
    color: MUTED,
  });
  const objText = (d.doplnujiciInformaceObjednavky ?? d.poznamkyVyroba ?? "").trim();
  if (objText) {
    const lines = wrapLines(ctx.fontReg, objText, FONT_SIZE_BODY, leftW - 6).slice(0, 4);
    let ty = yTop + 12;
    for (const line of lines) {
      drawText(ctx, line, leftX + 3, ty, { size: FONT_SIZE_BODY, maxWidth: leftW - 6 });
      ty += FONT_SIZE_BODY + 2;
    }
  }

  rect(ctx, leftX, yTop + leftBlockH, leftW, leftBlockH);
  drawText(ctx, "doplňující informace pro montáž:", leftX + 3, yTop + leftBlockH + 3, {
    size: FONT_SIZE_LABEL,
    color: MUTED,
  });
  const montText = (d.doplnujiciInformaceMontaz ?? d.poznamkyMontaz ?? "").trim();
  if (montText) {
    const lines = wrapLines(ctx.fontReg, montText, FONT_SIZE_BODY, leftW - 6).slice(0, 4);
    let ty = yTop + leftBlockH + 12;
    for (const line of lines) {
      drawText(ctx, line, leftX + 3, ty, { size: FONT_SIZE_BODY, maxWidth: leftW - 6 });
      ty += FONT_SIZE_BODY + 2;
    }
  }

  // Right: 4 A-N toggle cells stacked
  const toggleH = totalH / 4;
  const platceState = d.platceDph == null ? null : d.platceDph ? "A" : "N";
  const fakturaState = d.faktura == null ? null : d.faktura ? "A" : "N";
  const nebytovyState = d.typProstoru ? (d.typProstoru === "nebytovy" ? "A" : "N") : null;
  const bytovyState = d.typProstoru ? (d.typProstoru === "bytovy" ? "A" : "N") : null;
  drawAnCell(ctx, rightX, yTop + 0 * toggleH, rightW, toggleH, "Plátce DPH:", platceState);
  drawAnCell(ctx, rightX, yTop + 1 * toggleH, rightW, toggleH, "Faktura:", fakturaState);
  drawAnCell(ctx, rightX, yTop + 2 * toggleH, rightW, toggleH, "Nebytový prostor:", nebytovyState);
  drawAnCell(ctx, rightX, yTop + 3 * toggleH, rightW, toggleH, "Bytový prostor:", bytovyState);

  return yTop + totalH;
}

/** "K OBJEDNÁNÍ:" row — free-form text (admin types CELÁ ZAKÁZKA / SÍČEK / ETAPY or other). */
function drawKObjednani(ctx: Ctx, yTop: number, d: AdmfFormData): number {
  const h = 22;
  rect(ctx, MARGIN, yTop, CONTENT_W, h);
  drawText(ctx, "K OBJEDNÁNÍ:", MARGIN + 5, yTop + (h - FONT_SIZE_BODY) / 2 + 1, {
    size: FONT_SIZE_BODY,
    bold: true,
  });
  const label = "CELÁ ZAKÁZKA / SÍČEK / ETAPY";
  const labelW = ctx.fontReg.widthOfTextAtSize(label, FONT_SIZE_BODY);
  drawText(ctx, label, MARGIN + 90, yTop + (h - FONT_SIZE_BODY) / 2 + 1, {
    size: FONT_SIZE_BODY,
    color: MUTED,
  });
  // Render the actual value (free text) to the right
  if (d.kObjednani?.trim()) {
    drawText(ctx, d.kObjednani.trim(), MARGIN + 90 + labelW + 12, yTop + (h - FONT_SIZE_BODY) / 2 + 1, {
      size: FONT_SIZE_BODY,
      bold: true,
      maxWidth: CONTENT_W - 90 - labelW - 18,
    });
  }
  return yTop + h;
}

/** CENA row: 0% / 12% / 21% boxes + IČ. Fills the matching VAT cell with celkem s DPH. */
function drawCenaRow(ctx: Ctx, yTop: number, d: AdmfFormData, celkemSDph: number): number {
  const h = 26;
  // Layout: leftmost "CENA:" label cell, then 0%, 12%, 21%, IČ
  const labelW = 70;
  const cellW = (CONTENT_W - labelW - 100) / 3;
  const icW = 100;
  let x = MARGIN;
  rect(ctx, x, yTop, labelW, h, { fill: BAND_BG });
  drawText(ctx, "CENA:", x + 6, yTop + (h - FONT_SIZE_HEADING) / 2 + 1, {
    size: FONT_SIZE_HEADING,
    bold: true,
  });
  x += labelW;
  const rates: Array<0 | 12 | 21> = [0, 12, 21];
  for (const r of rates) {
    drawLabeledCell(ctx, x, yTop, cellW, h, `${r}%`, r === (d.vatRate ?? 12) ? fmtKc(celkemSDph) : "", {
      valueBold: true,
      valueAlign: "right",
    });
    x += cellW;
  }
  drawLabeledCell(ctx, x, yTop, icW, h, "IČ", d.ico ?? "");
  return yTop + h;
}

/** ZÁLOHA row: 4 payment-method cells + ZÁLOHOVÁ FAKTURA. */
function drawZalohaRow(ctx: Ctx, yTop: number, d: AdmfFormData): number {
  const h = 22;
  const labelW = 70;
  const methodW = 60;
  const lastW = CONTENT_W - labelW - methodW * 4;
  let x = MARGIN;
  rect(ctx, x, yTop, labelW, h, { fill: BAND_BG });
  drawText(ctx, "ZÁLOHA:", x + 6, yTop + (h - FONT_SIZE_HEADING) / 2 + 1, {
    size: FONT_SIZE_HEADING,
    bold: true,
  });
  x += labelW;
  // Payment method cells (no data — left blank for handwriting)
  for (const m of ["účet", "terminál", "hotově", "QR"]) {
    drawLabeledCell(ctx, x, yTop, methodW, h, m, "");
    x += methodW;
  }
  // ZÁLOHOVÁ FAKTURA cell — show zalohovaFaktura (s DPH)
  drawLabeledCell(ctx, x, yTop, lastW, h, "ZÁLOHOVÁ FAKTURA", fmtKc(d.zalohovaFaktura), {
    valueBold: true,
    valueAlign: "right",
  });
  return yTop + h;
}

/** DOPLATEK row: doplatek + KONCOVÁ FAKTURA. */
function drawDoplatekRow(ctx: Ctx, yTop: number, d: AdmfFormData, celkemSDph: number): number {
  const h = 22;
  const labelW = 70;
  const middleW = CONTENT_W - labelW - 200;
  const lastW = 200;
  let x = MARGIN;
  rect(ctx, x, yTop, labelW, h, { fill: BAND_BG });
  drawText(ctx, "DOPLATEK:", x + 6, yTop + (h - FONT_SIZE_HEADING) / 2 + 1, {
    size: FONT_SIZE_HEADING,
    bold: true,
  });
  x += labelW;
  const doplatek =
    d.doplatek != null
      ? d.doplatek
      : Math.max(0, Math.round(celkemSDph - (d.zalohovaFaktura ?? 0)));
  drawLabeledCell(ctx, x, yTop, middleW, h, "", fmtKc(doplatek), {
    valueBold: true,
    valueAlign: "right",
  });
  x += middleW;
  drawLabeledCell(ctx, x, yTop, lastW, h, "KONCOVÁ FAKTURA", "");
  return yTop + h;
}

/** PŘEDPOKLÁDANÁ DODACÍ DOBA | KÓD TERMINÁLU | DOBA MONTÁŽE | Vyfocená lamela A-N. */
function drawPredpokladanaRow(ctx: Ctx, yTop: number, d: AdmfFormData): number {
  const h = 22;
  const cells: Array<{ label: string; value: string; w: number }> = [
    { label: "PŘEDPOKLÁDANÁ DODACÍ DOBA", value: d.predpokladanaDodaciDoba ?? "", w: 0 },
    { label: "KÓD TERMINÁLU", value: d.kodTerminalu ?? "", w: 0 },
    {
      label: "DOBA MONTÁŽE",
      value: (d.dobaMontaze ?? d.predpokladanaDobaMontaze ?? ""),
      w: 0,
    },
  ];
  const lamelaCellW = 145;
  const each = (CONTENT_W - lamelaCellW) / cells.length;
  cells.forEach((c) => (c.w = each));
  let x = MARGIN;
  for (const c of cells) {
    drawLabeledCell(ctx, x, yTop, c.w, h, c.label, c.value);
    x += c.w;
  }
  const lamelaState =
    d.maZakaznikVyfocenouLamelu == null ? null : d.maZakaznikVyfocenouLamelu ? "A" : "N";
  drawAnCell(ctx, x, yTop, lamelaCellW, h, "Vyfocená lamela/látka:", lamelaState);
  return yTop + h;
}

/** Legal text block — 8 paragraphs, small font, wrapped. */
function drawLegalText(ctx: Ctx, yTop: number): number {
  const size = FONT_SIZE_LEGAL;
  const lineH = size + 1.5;
  const lines = wrapLines(ctx.fontReg, LEGAL_TEXT, size, CONTENT_W - 4);
  const blockH = lines.length * lineH + 6;
  rect(ctx, MARGIN, yTop, CONTENT_W, blockH);
  let ty = yTop + 3;
  for (const line of lines) {
    drawText(ctx, line, MARGIN + 2, ty, { size, color: FG, maxWidth: CONTENT_W - 4 });
    ty += lineH;
  }
  return yTop + blockH;
}

/** Signature row: DATUM | PODPIS KUPUJÍCÍHO | JMÉNO A PODPIS ZÁSTUPCE PRODÁVAJÍCÍHO. */
function drawSignatureRow(ctx: Ctx, yTop: number, d: AdmfFormData): number {
  const h = 42;
  const cells = [
    { label: "DATUM", value: d.datum ?? "", w: 110 },
    { label: "PODPIS KUPUJÍCÍHO", value: d.podpisZakaznika ?? "", w: 0 },
    {
      label: "JMÉNO A PODPIS ZÁSTUPCE PRODÁVAJÍCÍHO",
      value: d.jmenoPodpisZprostredkovatele ?? "",
      w: 0,
    },
  ];
  const remaining = CONTENT_W - cells[0].w;
  cells[1].w = remaining / 2;
  cells[2].w = remaining - cells[1].w;
  let x = MARGIN;
  for (const c of cells) {
    drawLabeledCell(ctx, x, yTop, c.w, h, c.label, c.value);
    x += c.w;
  }
  return yTop + h;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function generateAdmfPdfBuffer(raw: Record<string, unknown>): Promise<Buffer> {
  const data = raw as AdmfFormData;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const fontReg = await doc.embedFont(await readFile(ROBOTO_REG_PATH));
  const fontBold = await doc.embedFont(await readFile(ROBOTO_BOLD_PATH));

  let logo: PDFImage | null = null;
  try {
    logo = await doc.embedPng(await readFile(LOGO_PATH));
  } catch (e) {
    // Logo asset is optional — keep generating even if missing
    console.warn("[admf-pdf] logo.png missing, continuing without it:", e);
  }

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = { doc, page, fontReg, fontBold, logo };

  let y = MARGIN;
  y = drawHeader(ctx, y);
  y = drawCustomerGrid(ctx, y, data);
  y = drawSectionTitle(ctx, y, "Specifikace zboží");
  y = drawProductTable(ctx, y, data);
  y = drawDoplnujiciAndToggles(ctx, y, data);
  y = drawKObjednani(ctx, y, data);

  // Compute celkem s DPH once for sharing across CENA/DOPLATEK. Slevy are
  // stored s-DPH so we subtract them after the VAT multiplication.
  const sumProducts = (data.productRows ?? []).reduce((s, r) => s + (r.cenaPoSleve ?? 0), 0);
  const ovtSlevaSDph = Math.max(0, Math.round(data.ovtSlevaSDph ?? 0));
  const mngSlevaSDph = data.mngSleva ? Math.max(0, Math.round(data.mngSlevaSDph ?? 0)) : 0;
  const vat = data.vatRate ?? 12;
  const preDiscountSDph = Math.round((sumProducts + (data.montazCenaBezDph ?? 0)) * (1 + vat / 100));
  const celkemSDph = Math.max(0, preDiscountSDph - ovtSlevaSDph - mngSlevaSDph);

  y = drawCenaRow(ctx, y, data, celkemSDph);
  y = drawZalohaRow(ctx, y, data);
  y = drawDoplatekRow(ctx, y, data, celkemSDph);
  y = drawPredpokladanaRow(ctx, y, data);
  y = drawLegalText(ctx, y);
  y = drawSignatureRow(ctx, y, data);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
