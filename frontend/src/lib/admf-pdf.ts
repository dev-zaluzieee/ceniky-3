/**
 * Generate ADMF (administrativní formulář) as PDF for preview / customer.
 * Uses a Czech-capable font (Roboto) so diacritics (ě, š, č, ř, ž, ý, á, í, é, ú, ů, …) display correctly.
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
 * Builds a PDF document from ADMF form data (document-style layout).
 * Uses a Czech-capable font so diacritics render correctly.
 * @param formData - Current ADMF form data
 * @returns jsPDF instance (call .save() or .output('blob') from client)
 */
export async function generateAdmfPdf(formData: AdmfFormData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await loadCzechFont(doc);

  let y = MARGIN;

  /** Use only "normal" so Czech works everywhere (we did not register Roboto-Bold) */
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
    formData.email ||
    formData.telefon ||
    formData.ulice ||
    formData.mesto;
  if (hasCustomer) {
    setFont(FONT_SIZE_HEADING);
    doc.text("Údaje zákazníka", MARGIN, y);
    y += 6;
    setFont(FONT_SIZE_BODY);
    const lines: string[] = [];
    if (formData.jmenoPrijmeni) lines.push(`Jméno: ${formData.jmenoPrijmeni}`);
    if (formData.email) lines.push(`E-mail: ${formData.email}`);
    if (formData.telefon) lines.push(`Telefon: ${formData.telefon}`);
    if (formData.ulice) lines.push(`Adresa: ${formData.ulice}`);
    if (formData.mesto) lines.push(`Město: ${formData.mesto}`);
    lines.forEach((line) => {
      doc.text(line, MARGIN, y);
      y += 5;
    });
    y += 4;
  }

  // ---- Záznam o jednání se zákazníkem (product table) ----
  setFont(FONT_SIZE_HEADING);
  doc.text("Záznam o jednání se zákazníkem", MARGIN, y);
  y += 6;

  const head = [
    "produkt",
    "ks",
    "rám",
    "lamela/látka",
    "cena",
    "sleva %",
    "cena po slevě",
  ];
  const body: string[][] = (formData.productRows || []).map((r: AdmfProductRow) => [
    r.produkt ?? "",
    String(r.ks ?? ""),
    r.ram ?? "",
    r.lamelaLatka ?? "",
    String(r.cena ?? ""),
    String(r.sleva ?? ""),
    String(r.cenaPoSleve ?? ""),
  ]);

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

  // ---- Product total (bez DPH) ----
  const totalProdukty = (formData.productRows || []).reduce(
    (sum, r) => sum + (r.cenaPoSleve ?? 0),
    0
  );
  setFont(FONT_SIZE_BODY);
  doc.text(`Součet produktů (bez DPH): ${totalProdukty} Kč`, MARGIN, y);
  y += 6;

  // ---- Montáž ----
  const montazBezDph = formData.montazCenaBezDph ?? 1339;
  const vatRate = formData.vatRate ?? 12;
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

  // ---- DPH (VAT) ----
  setFont(FONT_SIZE_HEADING);
  doc.text("DPH", MARGIN, y);
  y += 6;
  setFont(FONT_SIZE_BODY);
  doc.text(`Plátce DPH: ${formData.platceDph ? "Ano" : "Ne"}`, MARGIN, y);
  y += 5;
  doc.text(`Faktura: ${formData.faktura ? "Ano" : "Ne"}`, MARGIN, y);
  y += 5;
  doc.text(`Nebytový prostor: ${formData.nebytovyProstor ? "Ano" : "Ne"}`, MARGIN, y);
  y += 5;
  doc.text(`Bytový prostor: ${formData.bytovyProstor ? "Ano" : "Ne"}`, MARGIN, y);
  y += 5;
  doc.text(`Sazba DPH: ${vatRate} %`, MARGIN, y);
  y += 10;

  // ---- K OBJEDNÁNÍ: záloha, doplatek, datum ----
  setFont(FONT_SIZE_HEADING);
  doc.text("K OBJEDNÁNÍ", MARGIN, y);
  y += 6;
  setFont(FONT_SIZE_BODY);
  doc.text(`Zálohová faktura: ${formData.zalohovaFaktura ?? 0} Kč`, MARGIN, y);
  y += 5;
  const doplatek = formData.doplatek ?? Math.max(0, totalSDph - (formData.zalohovaFaktura ?? 0));
  doc.text(`Doplatek: ${doplatek} Kč`, MARGIN, y);
  y += 5;
  if (formData.datum) {
    doc.text(`Datum: ${formData.datum}`, MARGIN, y);
    y += 5;
  }
  y += 6;

  // ---- Doplňující informace ----
  if (
    (formData.doplnujiciInformaceObjednavky ?? "").trim() ||
    (formData.doplnujiciInformaceMontaz ?? "").trim()
  ) {
    setFont(FONT_SIZE_HEADING);
    doc.text("Doplňující informace", MARGIN, y);
    y += 6;
    setFont(FONT_SIZE_BODY);
    if ((formData.doplnujiciInformaceObjednavky ?? "").trim()) {
      doc.text("Doplňující informace pro objednávky:", MARGIN, y);
      y += 5;
      const split = doc.splitTextToSize(
        formData.doplnujiciInformaceObjednavky!.trim(),
        doc.internal.pageSize.getWidth() - 2 * MARGIN
      );
      split.forEach((line: string) => {
        doc.text(line, MARGIN, y);
        y += 5;
      });
      y += 3;
    }
    if ((formData.doplnujiciInformaceMontaz ?? "").trim()) {
      doc.text("Doplňující informace pro montáž:", MARGIN, y);
      y += 5;
      const split = doc.splitTextToSize(
        formData.doplnujiciInformaceMontaz!.trim(),
        doc.internal.pageSize.getWidth() - 2 * MARGIN
      );
      split.forEach((line: string) => {
        doc.text(line, MARGIN, y);
        y += 5;
      });
    }
  }

  return doc;
}
