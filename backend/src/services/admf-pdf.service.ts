/**
 * Server-side ADMF PDF generation from persisted form_json.
 * Uses local Roboto font file to render Czech diacritics reliably.
 */

import fs from "fs/promises";
import path from "path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const MARGIN = 20;
const FONT_SIZE_TITLE = 16;
const FONT_SIZE_HEADING = 12;
const FONT_SIZE_BODY = 10;
const CZECH_FONT_NAME = "Roboto";

interface AdmfPriceAffectingField {
  label?: string;
  value?: string;
}

interface AdmfProductRow {
  produkt?: string;
  ks?: number;
  ram?: string;
  lamelaLatka?: string;
  cena?: number;
  sleva?: number;
  cenaPoSleve?: number;
  priceAffectingFields?: AdmfPriceAffectingField[];
}

interface AdmfPdfData {
  name?: string;
  jmenoPrijmeni?: string;
  ico?: string;
  email?: string;
  telefon?: string;
  ulice?: string;
  mesto?: string;
  psc?: string;
  typZarizeni?: string;
  parkovani?: boolean;
  zv?: string;
  platceDph?: boolean;
  nebytovyProstor?: boolean;
  bytovyProstor?: boolean;
  maZakaznikVyfocenouLamelu?: boolean;
  vatRate?: number;
  productRows?: AdmfProductRow[];
  montazCenaBezDph?: number;
  poznamkyVyroba?: string;
  poznamkyMontaz?: string;
  kObjednani?: string;
  zalohaZaplacena?: string;
  zalohovaFaktura?: number;
  doplatek?: number;
  predpokladanaDodaciDoba?: string;
  predpokladanaDobaMontaze?: string;
  datum?: string;
  podpisZakaznika?: string;
  jmenoPodpisZprostredkovatele?: string;
}

function fontCandidates(): string[] {
  return [
    path.resolve(process.cwd(), "../frontend/public/fonts/Roboto-Regular.ttf"),
    path.resolve(process.cwd(), "frontend/public/fonts/Roboto-Regular.ttf"),
    path.resolve(__dirname, "../../../frontend/public/fonts/Roboto-Regular.ttf"),
    path.resolve(__dirname, "../../../../frontend/public/fonts/Roboto-Regular.ttf"),
  ];
}

async function loadCzechFont(doc: jsPDF): Promise<void> {
  let fontBase64: string | null = null;

  for (const fontPath of fontCandidates()) {
    try {
      const binary = await fs.readFile(fontPath);
      fontBase64 = binary.toString("base64");
      break;
    } catch {
      continue;
    }
  }

  if (!fontBase64) {
    throw new Error("Roboto font file was not found for server PDF generation.");
  }

  const fileName = "Roboto-Regular.ttf";
  doc.addFileToVFS(fileName, fontBase64);
  doc.addFont(fileName, CZECH_FONT_NAME, "normal");
}

/**
 * Generate PDF binary from ADMF JSON payload persisted in DB.
 */
export async function generateAdmfPdfBuffer(raw: Record<string, unknown>): Promise<Buffer> {
  const formData = raw as AdmfPdfData;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await loadCzechFont(doc);

  let y = MARGIN;
  const setFont = (size: number) => {
    doc.setFontSize(size);
    doc.setFont(CZECH_FONT_NAME, "normal");
  };

  setFont(FONT_SIZE_TITLE);
  doc.text("ADMINISTRATIVNÍ FORMULÁŘ", MARGIN, y);
  y += 10;

  if (formData.name) {
    setFont(FONT_SIZE_BODY);
    doc.text(formData.name, MARGIN, y);
    y += 8;
  }

  const hasCustomer =
    formData.jmenoPrijmeni ||
    formData.ico ||
    formData.email ||
    formData.telefon ||
    formData.ulice ||
    formData.mesto ||
    formData.psc;
  if (hasCustomer) {
    setFont(FONT_SIZE_HEADING);
    doc.text("Údaje zákazníka", MARGIN, y);
    y += 6;
    setFont(FONT_SIZE_BODY);
    const lines: string[] = [];
    if (formData.jmenoPrijmeni) lines.push(`Jméno: ${formData.jmenoPrijmeni}`);
    if (formData.ico) lines.push(`IČO: ${formData.ico}`);
    if (formData.email) lines.push(`E-mail: ${formData.email}`);
    if (formData.telefon) lines.push(`Telefon: ${formData.telefon}`);
    if (formData.ulice) lines.push(`Adresa: ${formData.ulice}`);
    if (formData.mesto) lines.push(`Město: ${formData.mesto}`);
    if (formData.psc) lines.push(`PSČ: ${formData.psc}`);
    lines.forEach((line) => {
      doc.text(line, MARGIN, y);
      y += 5;
    });
    y += 4;
  }

  setFont(FONT_SIZE_HEADING);
  doc.text("Další informace", MARGIN, y);
  y += 6;
  setFont(FONT_SIZE_BODY);
  if (formData.typZarizeni) {
    doc.text(`Typ zařízení: ${formData.typZarizeni}`, MARGIN, y);
    y += 5;
  }
  doc.text(`Parkování: ${formData.parkovani ? "OK" : "Špatné"}`, MARGIN, y);
  y += 5;
  if (formData.zv) {
    doc.text(`ZV: ${formData.zv}`, MARGIN, y);
    y += 5;
  }
  doc.text(`Plátce DPH: ${formData.platceDph ? "Ano" : "Ne"}`, MARGIN, y);
  y += 5;
  doc.text(`Nebytový prostor: ${formData.nebytovyProstor ? "Ano" : "Ne"}`, MARGIN, y);
  y += 5;
  doc.text(`Bytový prostor: ${formData.bytovyProstor ? "Ano" : "Ne"}`, MARGIN, y);
  y += 5;
  doc.text(`Vyfocená lamela: ${formData.maZakaznikVyfocenouLamelu ? "Ano" : "Ne"}`, MARGIN, y);
  y += 8;

  setFont(FONT_SIZE_HEADING);
  doc.text("DPH", MARGIN, y);
  y += 6;
  setFont(FONT_SIZE_BODY);
  const vatRate = formData.vatRate ?? 12;
  doc.text(`Plátce DPH: ${formData.platceDph ? "Ano" : "Ne"}`, MARGIN, y);
  y += 5;
  doc.text(`Sazba DPH: ${vatRate} %`, MARGIN, y);
  y += 8;

  setFont(FONT_SIZE_HEADING);
  doc.text("Záznam o jednání se zákazníkem", MARGIN, y);
  y += 6;

  const productRows = formData.productRows || [];
  const firstRowWithPriceFields = productRows.find((r) => (r.priceAffectingFields?.length ?? 0) > 0);
  const priceField1Label = firstRowWithPriceFields?.priceAffectingFields?.[0]?.label ?? "rám";
  const priceField2Label = firstRowWithPriceFields?.priceAffectingFields?.[1]?.label ?? "lamela/látka";
  const head = ["produkt", "ks", priceField1Label, priceField2Label, "cena", "sleva %", "cena po slevě"];
  const body: string[][] = productRows.map((r) => {
    const hasPriceFields = (r.priceAffectingFields?.length ?? 0) > 0;
    const field1Value = r.priceAffectingFields?.[0]?.value ?? r.ram ?? "";
    const field2Value = r.priceAffectingFields?.[1]?.value ?? r.lamelaLatka ?? "";
    return [
      r.produkt ?? "",
      String(r.ks ?? ""),
      hasPriceFields ? field1Value : r.ram ?? "",
      hasPriceFields ? field2Value : r.lamelaLatka ?? "",
      String(r.cena ?? ""),
      String(r.sleva ?? ""),
      String(r.cenaPoSleve ?? ""),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { left: MARGIN },
    theme: "grid",
    styles: { fontSize: 9, font: CZECH_FONT_NAME, fontStyle: "normal" },
    headStyles: { fillColor: [220, 220, 220], font: CZECH_FONT_NAME, fontStyle: "normal" },
  });

  y = ((doc as unknown) as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  const totalProdukty = productRows.reduce((sum, r) => sum + (r.cenaPoSleve ?? 0) * (r.ks ?? 1), 0);
  setFont(FONT_SIZE_BODY);
  doc.text(`Součet produktů (bez DPH): ${totalProdukty} Kč`, MARGIN, y);
  y += 6;

  const montazBezDph = formData.montazCenaBezDph ?? 1339;
  const montazSDph = Math.round(montazBezDph * (1 + vatRate / 100));
  doc.text(`Montáž: ${montazBezDph} Kč (bez DPH), ${montazSDph} Kč (s DPH ${vatRate}%)`, MARGIN, y);
  y += 6;

  const totalBezDph = totalProdukty + montazBezDph;
  const totalSDph = Math.round(totalBezDph * (1 + vatRate / 100));
  doc.text(`Celkem bez DPH: ${totalBezDph} Kč`, MARGIN, y);
  y += 5;
  doc.text(`Celkem s DPH (${vatRate}%): ${totalSDph} Kč`, MARGIN, y);
  y += 10;

  const poznamkyVyroba = (formData.poznamkyVyroba ?? "").trim();
  const poznamkyMontaz = (formData.poznamkyMontaz ?? "").trim();
  if (poznamkyVyroba || poznamkyMontaz) {
    setFont(FONT_SIZE_HEADING);
    doc.text("Poznámky", MARGIN, y);
    y += 6;
    setFont(FONT_SIZE_BODY);
    if (poznamkyVyroba) {
      doc.text("Poznámky pro výrobu:", MARGIN, y);
      y += 5;
      const split = doc.splitTextToSize(poznamkyVyroba, doc.internal.pageSize.getWidth() - 2 * MARGIN);
      split.forEach((line: string) => {
        doc.text(line, MARGIN, y);
        y += 5;
      });
      y += 3;
    }
    if (poznamkyMontaz) {
      doc.text("Poznámky pro montáž:", MARGIN, y);
      y += 5;
      const split = doc.splitTextToSize(poznamkyMontaz, doc.internal.pageSize.getWidth() - 2 * MARGIN);
      split.forEach((line: string) => {
        doc.text(line, MARGIN, y);
        y += 5;
      });
    }
    y += 6;
  }

  setFont(FONT_SIZE_HEADING);
  doc.text("Platba a montáž", MARGIN, y);
  y += 6;
  setFont(FONT_SIZE_BODY);
  if (formData.kObjednani) {
    doc.text(`K objednání: ${formData.kObjednani}`, MARGIN, y);
    y += 5;
  }
  if (formData.zalohaZaplacena) {
    doc.text(`Záloha zaplacena: ${formData.zalohaZaplacena}`, MARGIN, y);
    y += 5;
  }
  doc.text(`Vybraná částka: ${formData.zalohovaFaktura ?? 0} Kč`, MARGIN, y);
  y += 5;
  const doplatek = formData.doplatek ?? Math.max(0, totalSDph - (formData.zalohovaFaktura ?? 0));
  doc.text(`Částka doplatku: ${doplatek} Kč`, MARGIN, y);
  y += 5;
  if (formData.predpokladanaDodaciDoba) {
    doc.text(`Předpokládaná dodací doba: ${formData.predpokladanaDodaciDoba}`, MARGIN, y);
    y += 5;
  }
  if (formData.predpokladanaDobaMontaze) {
    doc.text(`Předpokládaná doba montáže: ${formData.predpokladanaDobaMontaze}`, MARGIN, y);
    y += 5;
  }
  if (formData.datum) {
    doc.text(`Datum: ${formData.datum}`, MARGIN, y);
    y += 5;
  }
  if (formData.podpisZakaznika) {
    doc.text(`Podpis zákazníka: ${formData.podpisZakaznika}`, MARGIN, y);
    y += 5;
  }
  if (formData.jmenoPodpisZprostredkovatele) {
    doc.text(`Zprostředkovatel: ${formData.jmenoPodpisZprostredkovatele}`, MARGIN, y);
    y += 5;
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
