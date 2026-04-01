/**
 * Server-side ADMF PDF from persisted form_json.
 * Layout: section bands + autoTable blocks (customer-facing; žádný rozpad příplatků).
 */

import fs from "fs/promises";
import path from "path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  computeAdmfCelkemBezDph,
  computeAdmfCelkemSDph,
  effectiveMontazBezDph,
  sumProductRowsBezDph,
} from "../utils/admf-order-totals";

const MARGIN = 20;
const FONT_SIZE_TITLE = 15;
const FONT_SIZE_HEADING = 11;
const FONT_SIZE_BODY = 9;
const FONT_SIZE_SMALL = 8;
const CZECH_FONT_NAME = "Roboto";

/** Section title bar (light gray strip + text). */
const SECTION_BAR: [number, number, number] = [228, 228, 234];
const TABLE_HEAD: [number, number, number] = [210, 210, 218];
const KALK_BOX: [number, number, number] = [245, 250, 252];

interface AdmfPriceAffectingField {
  label?: string;
  value?: string;
}

interface AdmfProductRow {
  produkt?: string;
  ks?: number;
  cena?: number;
  sleva?: number;
  cenaPoSleve?: number;
  priceAffectingFields?: AdmfPriceAffectingField[];
}

interface AdmfPdfData {
  name?: string;
  jmenoPrijmeni?: string;
  ico?: string;
  dic?: string;
  nazevFirmy?: string;
  email?: string;
  telefon?: string;
  ulice?: string;
  mesto?: string;
  psc?: string;
  typOsoby?: "soukroma" | "pravnicka";
  jinaAdresaDodani?: boolean;
  dodaciUlice?: string;
  dodaciMesto?: string;
  dodaciPsc?: string;
  typZarizeni?: string;
  parkovani?: boolean;
  zv?: string;
  platceDph?: boolean;
  typProstoru?: "bytovy" | "nebytovy";
  maZakaznikVyfocenouLamelu?: boolean;
  zvonek?: string;
  patro?: string;
  infoKParkovani?: string;
  vatRate?: number;
  productRows?: AdmfProductRow[];
  montazCenaBezDph?: number;
  montazCenaZpusob?: "auto" | "manual";
  mngSleva?: boolean;
  mngSlevaCastka?: number;
  ovtSlevaCastka?: number;
  poznamkyVyroba?: string;
  poznamkyMontaz?: string;
  kObjednani?: string;
  zalohaZaplacena?: string;
  zalohovaFaktura?: number;
  variabilniSymbol?: number;
  doplatek?: number;
  infoKZaloze?: string;
  infoKFakture?: string;
  predpokladanaDodaciDoba?: string;
  predpokladanaDobaMontaze?: string;
  datum?: string;
  podpisZakaznika?: string;
  jmenoPodpisZprostredkovatele?: string;
}

/** Resolve first path that exists and return base64 TTF payload. */
async function readFontFileBase64(candidatePaths: string[], label: string): Promise<string> {
  for (const fontPath of candidatePaths) {
    try {
      const binary = await fs.readFile(fontPath);
      return binary.toString("base64");
    } catch {
      continue;
    }
  }
  throw new Error(`${label} was not found for server PDF generation (tried: ${candidatePaths.join(", ")}).`);
}

function robotoRegularPaths(): string[] {
  return [
    path.resolve(__dirname, "../../fonts/Roboto-Regular.ttf"),
    path.resolve(process.cwd(), "fonts/Roboto-Regular.ttf"),
  ];
}

function robotoBoldPaths(): string[] {
  return [
    path.resolve(__dirname, "../../fonts/Roboto-Bold.ttf"),
    path.resolve(process.cwd(), "fonts/Roboto-Bold.ttf"),
  ];
}

/** Embed Roboto Regular + Bold so autotable `fontStyle: bold` matches real metrics (no fake-bold spacing bugs). */
async function loadCzechFont(doc: jsPDF): Promise<void> {
  const regularB64 = await readFontFileBase64(robotoRegularPaths(), "Roboto-Regular.ttf");
  const boldB64 = await readFontFileBase64(robotoBoldPaths(), "Roboto-Bold.ttf");
  doc.addFileToVFS("Roboto-Regular.ttf", regularB64);
  doc.addFileToVFS("Roboto-Bold.ttf", boldB64);
  doc.addFont("Roboto-Regular.ttf", CZECH_FONT_NAME, "normal");
  doc.addFont("Roboto-Bold.ttf", CZECH_FONT_NAME, "bold");
}

function getLastAutoTableBottom(doc: jsPDF): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return last?.finalY ?? MARGIN;
}

/** Vygenerováno — stejná logika jako u custom výrobního listu. */
function formatPdfGeneratedAt(d: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Prague",
  }).format(d);
}

/** Kreslí pruh s názvem sekce; vrací Y pod pruhem pro autoTable startY. */
function drawSectionBar(doc: jsPDF, y: number, title: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  const h = 6.5;
  doc.setFillColor(...SECTION_BAR);
  doc.rect(MARGIN, y, pageW - 2 * MARGIN, h, "F");
  doc.setFont(CZECH_FONT_NAME, "normal");
  doc.setFontSize(FONT_SIZE_HEADING);
  doc.setTextColor(35, 35, 45);
  doc.text(title, MARGIN + 1.5, y + 4.5);
  doc.setTextColor(0, 0, 0);
  return y + h + 2;
}

const baseTableOpts = {
  theme: "grid" as const,
  styles: {
    fontSize: FONT_SIZE_BODY,
    font: CZECH_FONT_NAME,
    fontStyle: "normal" as const,
    cellPadding: 1.8,
    textColor: [20, 20, 25] as [number, number, number],
  },
  headStyles: {
    fillColor: TABLE_HEAD,
    font: CZECH_FONT_NAME,
    fontStyle: "normal" as const,
    textColor: [40, 40, 50] as [number, number, number],
  },
  margin: { left: MARGIN, right: MARGIN },
};

/**
 * Generate PDF binary from ADMF JSON payload persisted in DB.
 * Příplatky se v PDF neuvádějí — zákazník vidí jen souhrnné ceny řádku (bez rozpadu).
 */
export async function generateAdmfPdfBuffer(raw: Record<string, unknown>): Promise<Buffer> {
  const formData = raw as AdmfPdfData;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await loadCzechFont(doc);

  const pageW = doc.internal.pageSize.getWidth();
  let y = MARGIN;

  doc.setFont(CZECH_FONT_NAME, "normal");
  doc.setFontSize(FONT_SIZE_TITLE);
  doc.text("ADMINISTRATIVNÍ FORMULÁŘ", MARGIN, y);
  doc.setFontSize(FONT_SIZE_SMALL);
  doc.text(`Vygenerováno: ${formatPdfGeneratedAt(new Date())}`, pageW - MARGIN, y, { align: "right" });
  y += 8;

  if (formData.name) {
    doc.setFontSize(FONT_SIZE_BODY + 1);
    doc.text(formData.name, MARGIN, y);
    y += 7;
  }

  const vatRate = formData.vatRate ?? 12;
  const fd = formData as Record<string, unknown>;

  const hasCustomer =
    formData.jmenoPrijmeni ||
    formData.nazevFirmy ||
    formData.ico ||
    formData.dic ||
    formData.email ||
    formData.telefon ||
    formData.ulice ||
    formData.mesto ||
    formData.psc;

  if (hasCustomer) {
    const isPravnicka = formData.typOsoby === "pravnicka";
    y = drawSectionBar(doc, y, isPravnicka ? "Údaje firmy" : "Údaje zákazníka");
    const rows: string[][] = [];
    if (isPravnicka && formData.nazevFirmy) rows.push(["Název firmy", formData.nazevFirmy]);
    if (formData.jmenoPrijmeni) rows.push(["Jméno", formData.jmenoPrijmeni]);
    if (formData.ico) rows.push(["IČO", formData.ico]);
    if (formData.dic) rows.push(["DIČ", formData.dic]);
    if (formData.email) rows.push(["E-mail", formData.email]);
    if (formData.telefon) rows.push(["Telefon", formData.telefon]);
    if (formData.ulice) rows.push(["Adresa", formData.ulice]);
    if (formData.mesto) rows.push(["Město", formData.mesto]);
    if (formData.psc) rows.push(["PSČ", formData.psc]);
    if (rows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Položka", "Hodnota"]],
        body: rows,
        ...baseTableOpts,
        columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: pageW - 2 * MARGIN - 42 - 4 } },
      });
      y = getLastAutoTableBottom(doc) + 6;
    }
  }

  if (formData.jinaAdresaDodani && (formData.dodaciUlice || formData.dodaciMesto || formData.dodaciPsc)) {
    y = drawSectionBar(doc, y, "Adresa dodání");
    const dRows: string[][] = [];
    if (formData.dodaciUlice) dRows.push(["Adresa", formData.dodaciUlice]);
    if (formData.dodaciMesto) dRows.push(["Město", formData.dodaciMesto]);
    if (formData.dodaciPsc) dRows.push(["PSČ", formData.dodaciPsc]);
    autoTable(doc, {
      startY: y,
      head: [["Položka", "Hodnota"]],
      body: dRows,
      ...baseTableOpts,
      columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: pageW - 2 * MARGIN - 42 - 4 } },
    });
    y = getLastAutoTableBottom(doc) + 6;
  }

  const infoRows: string[][] = [];
  if (formData.typZarizeni) infoRows.push(["Typ zařízení", formData.typZarizeni]);
  infoRows.push(["Parkování", formData.parkovani ? "OK" : "Špatné"]);
  if (formData.zv) infoRows.push(["ZV", formData.zv]);
  infoRows.push(["Plátce DPH", formData.platceDph ? "Ano" : "Ne"]);
  infoRows.push(["Typ prostoru", (formData.typProstoru ?? "bytovy") === "bytovy" ? "Bytový" : "Nebytový"]);
  infoRows.push(["Vyfocená lamela", formData.maZakaznikVyfocenouLamelu ? "Ano" : "Ne"]);
  if (formData.zvonek) infoRows.push(["Jméno na zvonku", formData.zvonek]);
  if (formData.patro) infoRows.push(["Patro", formData.patro]);
  if (formData.infoKParkovani) infoRows.push(["Info k parkování", formData.infoKParkovani]);
  infoRows.push(["Sazba DPH", `${vatRate} %`]);

  y = drawSectionBar(doc, y, "Další informace a DPH");
  autoTable(doc, {
    startY: y,
    head: [["Údaj", "Hodnota"]],
    body: infoRows,
    ...baseTableOpts,
    columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: pageW - 2 * MARGIN - 48 - 4 } },
  });
  y = getLastAutoTableBottom(doc) + 6;

  const productRows = formData.productRows || [];
  const firstRowWithPriceFields = productRows.find((r) => (r.priceAffectingFields?.length ?? 0) > 0);
  const priceField1Label = firstRowWithPriceFields?.priceAffectingFields?.[0]?.label ?? "Parametr 1";
  const priceField2Label = firstRowWithPriceFields?.priceAffectingFields?.[1]?.label ?? "Parametr 2";

  y = drawSectionBar(doc, y, "Záznam o jednání se zákazníkem");

  const head = [
    "Produkt",
    "Počet ks",
    priceField1Label,
    priceField2Label,
    "Cena (bez DPH)",
    "Sleva %",
    "Cena po slevě (bez DPH)",
    "Cena po slevě (s DPH)",
  ];

  const body: string[][] = productRows.map((r) => {
    const field1Value = r.priceAffectingFields?.[0]?.value ?? "";
    const field2Value = r.priceAffectingFields?.[1]?.value ?? "";
    const cenaPoSleve = r.cenaPoSleve ?? 0;
    const cenaSDph = Math.round(cenaPoSleve * (1 + vatRate / 100));
    return [
      r.produkt ?? "",
      String(r.ks ?? ""),
      field1Value,
      field2Value,
      String(r.cena ?? ""),
      String(r.sleva ?? ""),
      String(cenaPoSleve),
      String(cenaSDph),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [head],
    body: body.length > 0 ? body : [["—", "—", "", "", "", "", "", ""]],
    ...baseTableOpts,
    styles: { ...baseTableOpts.styles, fontSize: FONT_SIZE_SMALL },
    headStyles: { ...baseTableOpts.headStyles, fontSize: FONT_SIZE_SMALL },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { halign: "center", cellWidth: 14 },
      2: { cellWidth: 22 },
      3: { cellWidth: 22 },
      4: { halign: "right", cellWidth: 20 },
      5: { halign: "right", cellWidth: 14 },
      6: { halign: "right", cellWidth: 22 },
      7: { halign: "right", cellWidth: 22 },
    },
  });
  y = getLastAutoTableBottom(doc) + 4;

  const totalProdukty = sumProductRowsBezDph(fd);
  const produktySDph = Math.round(totalProdukty * (1 + vatRate / 100));
  const produktyDphCastka = produktySDph - totalProdukty;

  autoTable(doc, {
    startY: y,
    body: [
      ["Produkty bez DPH", `${totalProdukty} Kč`],
      [`DPH z produktů (${vatRate}%)`, `${produktyDphCastka} Kč`],
      ["Produkty s DPH", `${produktySDph} Kč`],
    ],
    theme: "plain",
    styles: {
      fontSize: FONT_SIZE_BODY,
      font: CZECH_FONT_NAME,
      cellPadding: 1.2,
    },
    columnStyles: {
      0: { fontStyle: "normal", textColor: [80, 80, 90] },
      1: { halign: "right", fontStyle: "normal", textColor: [20, 20, 25] },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = getLastAutoTableBottom(doc) + 2;

  doc.setFontSize(FONT_SIZE_SMALL);
  doc.setTextColor(100, 100, 110);
  const footSplit = doc.splitTextToSize(
    "Součty za produkty neobsahují montáž",
    pageW - 2 * MARGIN
  );
  footSplit.forEach((line: string, i: number) => {
    doc.text(line, MARGIN, y + i * 3.5);
  });
  doc.setTextColor(0, 0, 0);
  y += footSplit.length * 3.5 + 6;

  const montazBezDph = effectiveMontazBezDph(fd);
  const montazSDph = Math.round(montazBezDph * (1 + vatRate / 100));
  const totalBezDph = computeAdmfCelkemBezDph(fd);
  const totalSDph = computeAdmfCelkemSDph(fd);
  const dphCelkem = totalSDph - totalBezDph;

  y = drawSectionBar(doc, y, "Kalkulace objednávky");

  const kalkBody: string[][] = [
    ["Produkty bez DPH", `${totalProdukty} Kč`],
    ["Montáž bez DPH", `${montazBezDph} Kč`],
  ];
  if ((formData.ovtSlevaCastka ?? 0) > 0) {
    kalkBody.push(["OVT sleva (bez DPH)", `−${formData.ovtSlevaCastka} Kč`]);
  }
  if (formData.mngSleva && (formData.mngSlevaCastka ?? 0) > 0) {
    kalkBody.push(["MNG sleva (bez DPH)", `−${formData.mngSlevaCastka} Kč`]);
  }
  kalkBody.push(
    ["Celkem bez DPH", `${totalBezDph} Kč`],
    [`DPH (${vatRate}%)`, `${dphCelkem} Kč`],
    ["Celkem s DPH", `${totalSDph} Kč`]
  );

  autoTable(doc, {
    startY: y,
    head: [["Položka", "Částka"]],
    body: kalkBody,
    ...baseTableOpts,
    tableLineColor: [190, 195, 205],
    tableLineWidth: 0.2,
    columnStyles: {
      0: { cellWidth: pageW - 2 * MARGIN - 52 },
      1: { halign: "right", cellWidth: 48, font: CZECH_FONT_NAME },
    },
    bodyStyles: {
      fillColor: KALK_BOX,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    didParseCell: (data) => {
      const row = data.row.index;
      const label = kalkBody[row]?.[0] ?? "";
      if (label === "Celkem bez DPH" || label === "Celkem s DPH") {
        data.cell.styles.fontStyle = "bold";
      }
      if (label.startsWith("OVT") || label.startsWith("MNG")) {
        data.cell.styles.textColor = [160, 50, 50];
      }
    },
  });
  y = getLastAutoTableBottom(doc) + 6;

  const poznamkyVyroba = (formData.poznamkyVyroba ?? "").trim();
  const poznamkyMontaz = (formData.poznamkyMontaz ?? "").trim();
  if (poznamkyVyroba || poznamkyMontaz) {
    y = drawSectionBar(doc, y, "Poznámky");
    const noteRows: string[][] = [];
    if (poznamkyVyroba) noteRows.push(["Pro výrobu", poznamkyVyroba]);
    if (poznamkyMontaz) noteRows.push(["Pro montáž", poznamkyMontaz]);
    autoTable(doc, {
      startY: y,
      head: [["Kategorie", "Text"]],
      body: noteRows,
      ...baseTableOpts,
      columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: pageW - 2 * MARGIN - 28 - 4 } },
    });
    y = getLastAutoTableBottom(doc) + 6;
  }

  y = drawSectionBar(doc, y, "Platba a montáž");
  const doplatek = formData.doplatek ?? Math.max(0, totalSDph - (formData.zalohovaFaktura ?? 0));
  const platbaRows: string[][] = [];
  if (formData.kObjednani) platbaRows.push(["K objednání", formData.kObjednani]);
  if (formData.zalohaZaplacena) platbaRows.push(["Záloha zaplacena", formData.zalohaZaplacena]);
  platbaRows.push(["Zálohová faktura (s DPH)", `${formData.zalohovaFaktura ?? 0} Kč`]);
  platbaRows.push(["Doplatek (s DPH)", `${doplatek} Kč`]);
  if (formData.variabilniSymbol) platbaRows.push(["Variabilní symbol", String(formData.variabilniSymbol)]);
  if (formData.infoKZaloze) platbaRows.push(["Info k záloze", formData.infoKZaloze]);
  if (formData.infoKFakture) platbaRows.push(["Info k faktuře", formData.infoKFakture]);
  if (formData.predpokladanaDodaciDoba) {
    platbaRows.push(["Předpokládaná dodací doba", formData.predpokladanaDodaciDoba]);
  }
  if (formData.predpokladanaDobaMontaze) {
    platbaRows.push(["Předpokládaná doba montáže", formData.predpokladanaDobaMontaze]);
  }
  if (formData.datum) platbaRows.push(["Datum", formData.datum]);
  if (formData.podpisZakaznika) platbaRows.push(["Podpis zákazníka", formData.podpisZakaznika]);
  if (formData.jmenoPodpisZprostredkovatele) {
    platbaRows.push(["Zprostředkovatel", formData.jmenoPodpisZprostredkovatele]);
  }

  autoTable(doc, {
    startY: y,
    head: [["Položka", "Hodnota"]],
    body: platbaRows,
    ...baseTableOpts,
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: pageW - 2 * MARGIN - 55 - 4 } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const lab = platbaRows[data.row.index]?.[0];
        if (lab === "Zálohová faktura (s DPH)" || lab === "Doplatek (s DPH)") {
          data.cell.styles.halign = "right";
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
