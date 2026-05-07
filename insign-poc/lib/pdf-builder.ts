/**
 * Generates a single-page A4 PDF with placeholder ADMF data, mirroring the
 * sections from `backend/src/services/admf-image.service.ts` (in ceniky-3).
 *
 * Two text markers are placed where signatures should go:
 *   __SIG_CUSTOMER__   — customer signature
 *   __SIG_MEDIATOR__   — mediator signature
 *
 * inSign's `ConfigureSignature.textsearch` finds the marker, replaces it with
 * the signature field, and re-flows positions automatically.
 *
 * NOTE: This file is deliberately self-contained. It does not import anything
 * from ceniky-3 — keeping the POC portable. We can swap in the real form_json
 * later by wiring `buildAdmfPdf` to read from the DB instead of using sample data.
 */

import { PDFDocument, PDFFont, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const SIG_MARKER_CUSTOMER = "__SIG_CUSTOMER__";
export const SIG_MARKER_MEDIATOR = "__SIG_MEDIATOR__";

export interface DemoAdmfData {
  name: string;
  jmenoPrijmeni: string;
  email: string;
  telefon: string;
  ulice: string;
  mesto: string;
  psc: string;
  typZarizeni: string;
  parkovani: boolean;
  vatRate: number;
  productRows: Array<{ produkt: string; ks: number; cena: number; sleva: number; cenaPoSleve: number }>;
  montazCenaBezDph: number;
  ovtSlevaCastka: number;
  zalohovaFaktura: number;
  doplatek: number;
  kObjednani: string;
  zalohaZaplacena: string;
  datum: string;
  poznamkyVyroba: string;
  poznamkyMontaz: string;
}

export const DEMO_ADMF_DATA: DemoAdmfData = {
  name: "Varianta 1",
  jmenoPrijmeni: "Jan Novák",
  email: "jan.novak@example.cz",
  telefon: "+420 123 456 789",
  ulice: "Hlavní 1",
  mesto: "Praha",
  psc: "120 00",
  typZarizeni: "Byt",
  parkovani: true,
  vatRate: 12,
  productRows: [
    { produkt: "Horizontální žaluzie PRIM 800×1200", ks: 2, cena: 5000, sleva: 10, cenaPoSleve: 4500 },
    { produkt: "Vertikální žaluzie ALU 1500×2000", ks: 1, cena: 8200, sleva: 0, cenaPoSleve: 8200 },
  ],
  montazCenaBezDph: 1339,
  ovtSlevaCastka: 0,
  zalohovaFaktura: 5000,
  doplatek: 14_117,
  kObjednani: "Celá zakázka",
  zalohaZaplacena: "Hotově",
  datum: "2026-05-05",
  poznamkyVyroba: "Standardní provedení, barva bílá.",
  poznamkyMontaz: "Montáž po dohodě se zákazníkem, vstup z ulice.",
};

interface PageState {
  pdf: PDFDocument;
  page: PDFPage;
  fontReg: PDFFont;
  fontBold: PDFFont;
  margin: number;
  width: number;
  height: number;
  y: number;
}

const FG = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const BORDER = rgb(0.86, 0.87, 0.9);
const BAND = rgb(0.93, 0.94, 0.97);

function newPage(state: PageState): PageState {
  const page = state.pdf.addPage([state.width, state.height]);
  return { ...state, page, y: state.height - state.margin };
}

function ensureSpace(s: PageState, needed: number): PageState {
  if (s.y - needed < s.margin) return newPage(s);
  return s;
}

function drawText(s: PageState, text: string, opts: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}): void {
  const size = opts.size ?? 10;
  const font = opts.bold ? s.fontBold : s.fontReg;
  const x = opts.x ?? s.margin;
  const color = opts.color ?? FG;
  const lines = wrap(font, text, size, opts.maxWidth ?? s.width - 2 * s.margin - (x - s.margin));
  for (const line of lines) {
    s.page.drawText(line, { x, y: s.y - size, size, font, color });
    s.y -= size + 3;
  }
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
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
  return lines.length ? lines : [""];
}

function sectionBar(s: PageState, title: string): void {
  const h = 20;
  s.page.drawRectangle({
    x: s.margin,
    y: s.y - h,
    width: s.width - 2 * s.margin,
    height: h,
    color: BAND,
  });
  s.page.drawText(title, {
    x: s.margin + 8,
    y: s.y - h + 6,
    size: 11,
    font: s.fontBold,
    color: FG,
  });
  s.y -= h + 6;
}

interface TableOpts {
  head?: string[];
  body: string[][];
  cols: number[]; // column widths (sum = drawable width)
  fontSize?: number;
}

function table(s: PageState, opts: TableOpts): void {
  const fs = opts.fontSize ?? 9;
  const padX = 5;
  const rowH = fs + 8;
  const drawable = s.width - 2 * s.margin;
  const totalW = opts.cols.reduce((a, b) => a + b, 0);
  const scale = drawable / totalW;
  const widths = opts.cols.map((c) => c * scale);

  if (opts.head) {
    s.page.drawRectangle({
      x: s.margin,
      y: s.y - rowH,
      width: drawable,
      height: rowH,
      color: BAND,
    });
    let cx = s.margin;
    for (let i = 0; i < opts.head.length; i++) {
      const text = clipToWidth(s.fontBold, opts.head[i] ?? "", fs, widths[i]! - 2 * padX);
      s.page.drawText(text, { x: cx + padX, y: s.y - rowH + 5, size: fs, font: s.fontBold, color: FG });
      cx += widths[i]!;
    }
    s.y -= rowH;
  }

  for (const row of opts.body) {
    let cx = s.margin;
    for (let i = 0; i < row.length; i++) {
      const text = clipToWidth(s.fontReg, row[i] ?? "", fs, widths[i]! - 2 * padX);
      s.page.drawText(text, { x: cx + padX, y: s.y - rowH + 5, size: fs, font: s.fontReg, color: FG });
      cx += widths[i]!;
    }
    s.page.drawLine({
      start: { x: s.margin, y: s.y - rowH },
      end: { x: s.margin + drawable, y: s.y - rowH },
      thickness: 0.5,
      color: BORDER,
    });
    s.y -= rowH;
  }
}

function clipToWidth(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 0 && font.widthOfTextAtSize(out + "…", size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + "…";
}

async function loadFont(file: string): Promise<Buffer> {
  const fontPath = path.join(process.cwd(), "lib", "fonts", file);
  return await readFile(fontPath);
}

export async function buildAdmfPdf(data: DemoAdmfData = DEMO_ADMF_DATA): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`ADMF — ${data.name}`);
  pdf.setSubject("Administrativní formulář (POC, podpis přes inSign)");
  const [regBytes, boldBytes] = await Promise.all([
    loadFont("NotoSans-Regular.ttf"),
    loadFont("NotoSans-Bold.ttf"),
  ]);
  const fontReg = await pdf.embedFont(regBytes, { subset: true });
  const fontBold = await pdf.embedFont(boldBytes, { subset: true });

  let s: PageState = {
    pdf,
    page: pdf.addPage([595.28, 841.89]),
    fontReg,
    fontBold,
    margin: 36,
    width: 595.28,
    height: 841.89,
    y: 841.89 - 36,
  };

  // Title
  drawText(s, "ADMINISTRATIVNÍ FORMULÁŘ", { size: 16, bold: true });
  drawText(s, `Vygenerováno: ${new Date().toLocaleString("cs-CZ")}`, { size: 9, color: MUTED });
  if (data.name) drawText(s, data.name, { size: 12, bold: true });
  s.y -= 6;

  // Údaje zákazníka
  s = ensureSpace(s, 140);
  sectionBar(s, "Údaje zákazníka");
  table(s, {
    head: ["Položka", "Hodnota"],
    body: [
      ["Jméno", data.jmenoPrijmeni],
      ["E-mail", data.email],
      ["Telefon", data.telefon],
      ["Adresa", data.ulice],
      ["Město", data.mesto],
      ["PSČ", data.psc],
    ],
    cols: [1, 2.5],
  });
  s.y -= 6;

  // Další informace a DPH
  s = ensureSpace(s, 90);
  sectionBar(s, "Další informace a DPH");
  table(s, {
    head: ["Údaj", "Hodnota"],
    body: [
      ["Typ zařízení", data.typZarizeni],
      ["Parkování", data.parkovani ? "OK" : "Špatné"],
      ["Sazba DPH", `${data.vatRate} %`],
    ],
    cols: [1, 2.5],
  });
  s.y -= 6;

  // Záznam o jednání se zákazníkem
  s = ensureSpace(s, 120);
  sectionBar(s, "Záznam o jednání se zákazníkem");
  const productBody = data.productRows.map((r) => [
    r.produkt,
    String(r.ks),
    `${r.cena}`,
    `${r.sleva}`,
    `${r.cenaPoSleve}`,
    `${Math.round(r.cenaPoSleve * (1 + data.vatRate / 100))}`,
  ]);
  table(s, {
    head: ["Produkt", "Ks", "Cena bez DPH", "Sleva %", "Po slevě bez DPH", "Po slevě s DPH"],
    body: productBody,
    cols: [3, 0.6, 1.2, 0.7, 1.4, 1.4],
    fontSize: 8,
  });
  s.y -= 6;

  // Kalkulace — `cenaPoSleve` is a LINE TOTAL (already includes ks); see
  // ceniky-3/backend/src/utils/admf-order-totals.ts. Do not multiply by ks.
  const produktyBezDph = data.productRows.reduce((sum, r) => sum + r.cenaPoSleve, 0);
  const totalBezDph = Math.max(0, produktyBezDph + data.montazCenaBezDph - data.ovtSlevaCastka);
  const totalSDph = Math.round(totalBezDph * (1 + data.vatRate / 100));

  s = ensureSpace(s, 140);
  sectionBar(s, "Kalkulace objednávky");
  table(s, {
    head: ["Položka", "Částka"],
    body: [
      ["Produkty bez DPH", `${produktyBezDph} Kč`],
      ["Montáž bez DPH", `${data.montazCenaBezDph} Kč`],
      ["Celkem bez DPH", `${totalBezDph} Kč`],
      [`DPH (${data.vatRate} %)`, `${totalSDph - totalBezDph} Kč`],
      ["Celkem s DPH", `${totalSDph} Kč`],
    ],
    cols: [2.5, 1.2],
  });
  s.y -= 6;

  // Poznámky
  if (data.poznamkyVyroba || data.poznamkyMontaz) {
    s = ensureSpace(s, 80);
    sectionBar(s, "Poznámky");
    table(s, {
      head: ["Kategorie", "Text"],
      body: [
        ["Pro výrobu", data.poznamkyVyroba],
        ["Pro montáž", data.poznamkyMontaz],
      ],
      cols: [1, 3.5],
    });
    s.y -= 6;
  }

  // Platba a montáž
  s = ensureSpace(s, 130);
  sectionBar(s, "Platba a montáž");
  table(s, {
    head: ["Položka", "Hodnota"],
    body: [
      ["K objednání", data.kObjednani],
      ["Záloha zaplacena", data.zalohaZaplacena],
      ["Zálohová faktura (s DPH)", `${data.zalohovaFaktura} Kč`],
      ["Doplatek (s DPH)", `${data.doplatek} Kč`],
      ["Datum", data.datum],
    ],
    cols: [1.5, 2],
  });
  s.y -= 12;

  // Signature markers
  s = ensureSpace(s, 100);
  sectionBar(s, "Podpisy");

  drawText(s, "Podpis zákazníka:", { size: 10, bold: true });
  s.y -= 4;
  // Marker on its own line so inSign's textsearch will find it cleanly.
  drawText(s, SIG_MARKER_CUSTOMER, { size: 9, color: MUTED });
  s.y -= 18;

  drawText(s, "Podpis zprostředkovatele:", { size: 10, bold: true });
  s.y -= 4;
  drawText(s, SIG_MARKER_MEDIATOR, { size: 9, color: MUTED });

  return await pdf.save();
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
