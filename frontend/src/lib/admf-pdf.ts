/**
 * Generate ADMF (administrativni formular) as PDF for preview / customer.
 * Uses a Czech-capable font (Roboto) so diacritics display correctly.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AdmfFormData, AdmfProductRow } from "@/types/forms/admf.types";

const MARGIN = 20;
const FONT_SIZE_TITLE = 16;
const FONT_SIZE_HEADING = 12;
const FONT_SIZE_BODY = 10;

/** Font name used for all text (Czech-capable); registered by loadCzechFont */
const CZECH_FONT_NAME = "Roboto";

/**
 * Load Roboto TTF (supports Czech) and register it on the doc.
 * Tries /fonts/Roboto-Regular.ttf first, then CDN fallback.
 */
async function loadCzechFont(doc: jsPDF): Promise<void> {
  const urls = [
    "/fonts/Roboto-Regular.ttf",
    "https://cdn.jsdelivr.net/gh/google/fonts@main/apache/roboto/static/Roboto-Regular.ttf",
  ];
  let base64: string | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const dataUrl = r.result as string;
          resolve(dataUrl.slice(dataUrl.indexOf("base64,") + 7));
        };
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      break;
    } catch {
      continue;
    }
  }
  if (!base64) {
    throw new Error("Nepodařilo se načíst font pro české znaky. Přidejte Roboto-Regular.ttf do složky public/fonts.");
  }
  const fileName = "Roboto-Regular.ttf";
  doc.addFileToVFS(fileName, base64);
  doc.addFont(fileName, CZECH_FONT_NAME, "normal");
}

/**
 * Builds a PDF document from ADMF form data.
 */
export async function generateAdmfPdf(formData: AdmfFormData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await loadCzechFont(doc);

  let y = MARGIN;

  const setFont = (size: number) => {
    doc.setFontSize(size);
    doc.setFont(CZECH_FONT_NAME, "normal");
  };

  // ---- Title ----
  setFont(FONT_SIZE_TITLE);
  doc.text("ADMINISTRATIVNÍ FORMULÁŘ", MARGIN, y);
  y += 10;

  // ---- Variant name ----
  if (formData.name) {
    setFont(FONT_SIZE_BODY);
    doc.text(formData.name, MARGIN, y);
    y += 8;
  }

  // ---- Customer block ----
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

  // ---- Další informace ----
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

  // ---- DPH ----
  setFont(FONT_SIZE_HEADING);
  doc.text("DPH", MARGIN, y);
  y += 6;
  setFont(FONT_SIZE_BODY);
  const vatRate = formData.vatRate ?? 12;
  doc.text(`Plátce DPH: ${formData.platceDph ? "Ano" : "Ne"}`, MARGIN, y);
  y += 5;
  doc.text(`Sazba DPH: ${vatRate} %`, MARGIN, y);
  y += 8;

  // ---- Záznam o jednání (product table) ----
  setFont(FONT_SIZE_HEADING);
  doc.text("Záznam o jednání se zákazníkem", MARGIN, y);
  y += 6;

  const firstRowWithPriceFields = (formData.productRows || []).find(
    (r) => (r.priceAffectingFields?.length ?? 0) > 0
  );
  const priceField1Label =
    firstRowWithPriceFields?.priceAffectingFields?.[0]?.label ?? "rám";
  const priceField2Label =
    firstRowWithPriceFields?.priceAffectingFields?.[1]?.label ?? "lamela/látka";

  const head = [
    "produkt",
    "ks",
    priceField1Label,
    priceField2Label,
    "cena",
    "sleva %",
    "cena po slevě",
  ];
  const body: string[][] = (formData.productRows || []).map((r: AdmfProductRow) => {
    const hasPriceFields = (r.priceAffectingFields?.length ?? 0) > 0;
    const field1Value =
      r.priceAffectingFields?.[0]?.value ?? r.ram ?? "";
    const field2Value =
      r.priceAffectingFields?.[1]?.value ?? r.lamelaLatka ?? "";
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

  // ---- Product total ----
  const totalProdukty = (formData.productRows || []).reduce(
    (sum, r) => sum + (r.cenaPoSleve ?? 0) * (r.ks ?? 1),
    0
  );
  setFont(FONT_SIZE_BODY);
  doc.text(`Součet produktů (bez DPH): ${totalProdukty} Kč`, MARGIN, y);
  y += 6;

  // ---- Montáž ----
  const montazBezDph = formData.montazCenaBezDph ?? 1339;
  const montazSDph = Math.round(montazBezDph * (1 + vatRate / 100));
  doc.text(`Montáž: ${montazBezDph} Kč (bez DPH), ${montazSDph} Kč (s DPH ${vatRate}%)`, MARGIN, y);
  y += 6;

  // ---- Celkem ----
  const totalBezDph = totalProdukty + montazBezDph;
  const totalSDph = Math.round(totalBezDph * (1 + vatRate / 100));
  doc.text(`Celkem bez DPH: ${totalBezDph} Kč`, MARGIN, y);
  y += 5;
  doc.text(`Celkem s DPH (${vatRate}%): ${totalSDph} Kč`, MARGIN, y);
  y += 10;

  // ---- Poznámky ----
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
      const split = doc.splitTextToSize(
        poznamkyVyroba,
        doc.internal.pageSize.getWidth() - 2 * MARGIN
      );
      split.forEach((line: string) => {
        doc.text(line, MARGIN, y);
        y += 5;
      });
      y += 3;
    }
    if (poznamkyMontaz) {
      doc.text("Poznámky pro montáž:", MARGIN, y);
      y += 5;
      const split = doc.splitTextToSize(
        poznamkyMontaz,
        doc.internal.pageSize.getWidth() - 2 * MARGIN
      );
      split.forEach((line: string) => {
        doc.text(line, MARGIN, y);
        y += 5;
      });
    }
    y += 6;
  }

  // ---- Platba a montáž ----
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

  return doc;
}
