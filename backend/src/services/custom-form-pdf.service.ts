/**
 * Server-side PDF generation for step-1 "custom" forms (výrobní list).
 * Renders a readable layout: Czech labels, schema-driven headers, expanded rooms,
 * enum names (not raw codes where possible). Omits empty blocks and internal keys.
 */

import fs from "fs/promises";
import path from "path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const MARGIN = 20;
const CZECH_FONT_NAME = "Roboto";

/** Minimal schema shapes (mirror frontend `ProductPayload` / `JsonSchemaFormData`). */
type PropertyDefinition = {
  Code: string;
  Name: string;
  DataType?: string;
  "label-form"?: string;
};

type SectionBlock = {
  Name?: string;
  Properties?: PropertyDefinition[];
};

type EnumValue = { code: string; name: string; active?: boolean };

type EnumEntry = { default?: EnumValue[]; [groupKey: string]: EnumValue[] | undefined };

type ProductPayload = {
  product_code?: string;
  zahlavi?: SectionBlock;
  form_body?: SectionBlock;
  zapati?: SectionBlock;
  enums?: Record<string, EnumEntry>;
};

type FormRow = Record<string, string | number | boolean>;

type Room = { id?: string; name?: string; rows?: FormRow[] };

/** Font ships with backend in backend/fonts/; at runtime __dirname is dist/services so ../../fonts is alongside dist. */
function fontCandidates(): string[] {
  return [
    path.resolve(__dirname, "../../fonts/Roboto-Regular.ttf"),
    path.resolve(process.cwd(), "fonts/Roboto-Regular.ttf"),
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
  doc.setFont(CZECH_FONT_NAME, "normal");
}

function propertyLabel(p: PropertyDefinition): string {
  return (p["label-form"] ?? p.Name ?? p.Code).trim() || p.Code;
}

/** Collect all enum values for a property (all groups) for code → label lookup. */
function enumValuesForProperty(enums: Record<string, EnumEntry> | undefined, propertyCode: string): EnumValue[] {
  if (!enums?.[propertyCode]) return [];
  const entry = enums[propertyCode];
  const out: EnumValue[] = [];
  for (const k of Object.keys(entry)) {
    const v = entry[k];
    if (Array.isArray(v)) out.push(...v);
  }
  return out;
}

function resolveEnumLabel(
  enums: Record<string, EnumEntry> | undefined,
  propertyCode: string,
  value: unknown
): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Ano" : "Ne";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const s = String(value).trim();
  if (s === "") return "";
  const opts = enumValuesForProperty(enums, propertyCode);
  const hit = opts.find((o) => o.code === s && o.active !== false);
  return hit?.name ?? s;
}

function formatPrimitiveForPdf(
  prop: PropertyDefinition | undefined,
  value: unknown,
  enums: Record<string, EnumEntry> | undefined
): string {
  if (value === null || value === undefined) return "";
  if (prop?.DataType === "boolean" || prop?.DataType === "link") {
    return value ? "Ano" : "Ne";
  }
  if (prop?.DataType === "enum") {
    return resolveEnumLabel(enums, prop.Code, value);
  }
  if (typeof value === "boolean") return value ? "Ano" : "Ne";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value).trim();
}

function isEmptyDisplay(s: string): boolean {
  return s === "" || s === "-";
}

/** Skip section key/value rows where the formatted value is empty (booleans always shown). */
function shouldIncludeSectionRow(prop: PropertyDefinition | undefined, raw: unknown, formatted: string): boolean {
  if (prop?.DataType === "boolean" || prop?.DataType === "link") return true;
  if (typeof raw === "boolean") return true;
  return !isEmptyDisplay(formatted);
}

const CUSTOMER_FIELDS: { key: keyof CustomerBlock; label: string }[] = [
  { key: "name", label: "Jméno / název" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefon" },
  { key: "address", label: "Adresa" },
  { key: "city", label: "Město" },
];

type CustomerBlock = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  city?: unknown;
};

function customerRows(data: Record<string, unknown>): string[][] {
  const rows: string[][] = [];
  const get = (k: string) => {
    const v = data[k];
    if (v === null || v === undefined) return "";
    return String(v).trim();
  };
  for (const { key, label } of CUSTOMER_FIELDS) {
    const val = get(key as string);
    if (val !== "") rows.push([label, val]);
  }
  return rows;
}

const ROW_INTERNAL_KEYS = new Set(["id", "linkGroupId"]);

function formBodyPropertyColumns(schema: ProductPayload): PropertyDefinition[] {
  const props = (schema.form_body?.Properties ?? []) as PropertyDefinition[];
  return props.filter((p) => p?.Code && typeof p.Code === "string");
}

function sectionRowsFromValues(
  section: SectionBlock | undefined,
  values: Record<string, unknown> | undefined,
  enums: Record<string, EnumEntry> | undefined
): string[][] {
  if (!section?.Properties?.length || !values) return [];
  const rows: string[][] = [];
  for (const prop of section.Properties) {
    const raw = values[prop.Code];
    const formatted = formatPrimitiveForPdf(prop, raw, enums);
    if (!shouldIncludeSectionRow(prop, raw, formatted)) continue;
    rows.push([propertyLabel(prop), formatted]);
  }
  return rows;
}

function roomTableIsNonEmpty(
  columns: PropertyDefinition[],
  row: FormRow,
  enums: Record<string, EnumEntry> | undefined
): boolean {
  for (const col of columns) {
    const raw = row[col.Code];
    const formatted = formatPrimitiveForPdf(col, raw, enums);
    if (!isEmptyDisplay(formatted)) return true;
  }
  return false;
}

function getLastTableBottom(doc: jsPDF): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return last?.finalY ?? MARGIN;
}

/** Human-readable generation time for the PDF footer/header (Czech locale). */
function formatPdfGeneratedAt(d: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Prague",
  }).format(d);
}

export async function generateCustomFormPdfBuffer(raw: Record<string, unknown>): Promise<Buffer> {
  const formJson = raw as Record<string, unknown>;
  const schema = (formJson.schema ?? {}) as ProductPayload;
  const data = (formJson.data ?? formJson) as Record<string, unknown>;

  const productNameRaw = data.productName;
  const productName =
    typeof productNameRaw === "string" && productNameRaw.trim() !== ""
      ? productNameRaw.trim()
      : typeof formJson.name === "string" && formJson.name.trim() !== ""
        ? formJson.name.trim()
        : "Výrobní list";

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await loadCzechFont(doc);

  let startY = MARGIN;
  const pageWidth = doc.internal.pageSize.getWidth();

  /** Right-aligned stamp (same line as main title). */
  doc.setFontSize(9);
  doc.text(`Vygenerováno: ${formatPdfGeneratedAt(new Date())}`, pageWidth - MARGIN, startY, { align: "right" });

  doc.setFontSize(16);
  doc.text("VÝROBNÍ LIST", MARGIN, startY);
  startY += 8;

  doc.setFontSize(12);
  doc.text(productName, MARGIN, startY);
  startY += 7;

  const productCode =
    typeof data.productCode === "string" && data.productCode.trim() !== ""
      ? data.productCode.trim()
      : typeof schema.product_code === "string"
        ? schema.product_code.trim()
        : "";
  if (productCode) {
    doc.setFontSize(10);
    doc.text(`Kód produktu: ${productCode}`, MARGIN, startY);
    startY += 6;
  }

  const enums = schema.enums ?? {};

  const cust = customerRows(data);
  if (cust.length > 0) {
    doc.setFontSize(11);
    doc.text("Zákazník", MARGIN, startY);
    startY += 5;
    autoTable(doc, {
      startY,
      head: [["Údaj", "Hodnota"]],
      body: cust,
      margin: { left: MARGIN, right: MARGIN },
      theme: "grid",
      styles: { fontSize: 9, font: CZECH_FONT_NAME, fontStyle: "normal", cellPadding: 2 },
      headStyles: { fillColor: [230, 230, 230], font: CZECH_FONT_NAME, fontStyle: "normal" },
      columnStyles: {
        /** Keep normal weight: only Roboto Regular is embedded — bold would fall back to Helvetica and break Czech glyphs (e.g. „ě“). */
        0: { cellWidth: 45, fontStyle: "normal" },
        1: { cellWidth: 130 },
      },
    });
    startY = getLastTableBottom(doc) + 8;
  }

  const zahlaviTitle = (schema.zahlavi?.Name ?? "Hlavička").trim() || "Hlavička";
  const zahlaviValues = (data.zahlaviValues ?? {}) as Record<string, unknown>;
  const zahlaviBody = sectionRowsFromValues(schema.zahlavi, zahlaviValues, enums);
  if (zahlaviBody.length > 0) {
    doc.setFontSize(11);
    doc.text(zahlaviTitle, MARGIN, startY);
    startY += 5;
    autoTable(doc, {
      startY,
      head: [["Položka", "Hodnota"]],
      body: zahlaviBody,
      margin: { left: MARGIN, right: MARGIN },
      theme: "grid",
      styles: { fontSize: 9, font: CZECH_FONT_NAME, fontStyle: "normal", cellPadding: 2 },
      headStyles: { fillColor: [220, 235, 250], font: CZECH_FONT_NAME, fontStyle: "normal" },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 120 },
      },
    });
    startY = getLastTableBottom(doc) + 8;
  }

  const columns = formBodyPropertyColumns(schema);
  const rooms = Array.isArray(data.rooms) ? (data.rooms as Room[]) : [];

  /** True if at least one room row has any non-empty form_body cell. */
  const hasRenderableRoomRows =
    columns.length > 0 &&
    rooms.some((room) =>
      (room.rows ?? []).some((row) => roomTableIsNonEmpty(columns, row as FormRow, enums))
    );

  /** Rooms with data but no form_body in schema — fallback layout. */
  const hasSchemaLessContent =
    columns.length === 0 &&
    rooms.some((room) =>
      (room.rows ?? []).some((row) => {
        const keys = Object.keys(row).filter((k) => !ROW_INTERNAL_KEYS.has(k));
        return keys.some((k) => !isEmptyDisplay(formatPrimitiveForPdf(undefined, row[k], enums)));
      })
    );

  if (columns.length > 0 && rooms.length > 0 && hasRenderableRoomRows) {
    doc.setFontSize(11);
    doc.text("Místnosti a položky", MARGIN, startY);
    startY += 6;

    const head = columns.map((c) => propertyLabel(c));

    rooms.forEach((room, idx) => {
      const roomLabel = (room.name && String(room.name).trim() !== "" ? String(room.name).trim() : null) ?? `Místnost ${idx + 1}`;
      const rows = room.rows ?? [];
      const body: string[][] = [];

      for (const row of rows) {
        if (!roomTableIsNonEmpty(columns, row as FormRow, enums)) continue;
        const line = columns.map((col) => formatPrimitiveForPdf(col, row[col.Code], enums));
        body.push(line);
      }

      if (body.length === 0) return;

      doc.setFontSize(10);
      doc.text(roomLabel, MARGIN, startY);
      startY += 5;

      autoTable(doc, {
        startY,
        head: [head],
        body,
        margin: { left: MARGIN, right: MARGIN },
        theme: "grid",
        styles: { fontSize: 8, font: CZECH_FONT_NAME, fontStyle: "normal", cellPadding: 1.5, overflow: "linebreak" },
        headStyles: { fillColor: [220, 220, 220], font: CZECH_FONT_NAME, fontStyle: "normal" },
      });
      startY = getLastTableBottom(doc) + 8;
    });
  } else if (rooms.length > 0 && hasSchemaLessContent) {
    /** Schema missing form_body: list rooms as compact key: value lines (no schema labels). */
    doc.setFontSize(11);
    doc.text("Místnosti (bez definice sloupců ve schématu)", MARGIN, startY);
    startY += 6;
    rooms.forEach((room, idx) => {
      const roomLabel =
        (room.name && String(room.name).trim() !== "" ? String(room.name).trim() : null) ?? `Místnost ${idx + 1}`;
      const rows = room.rows ?? [];
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => !ROW_INTERNAL_KEYS.has(k));
        const parts = keys
          .map((k) => {
            const v = formatPrimitiveForPdf(undefined, row[k], enums);
            return isEmptyDisplay(v) ? null : `${k}: ${v}`;
          })
          .filter((p): p is string => p !== null);
        if (parts.length === 0) continue;
        autoTable(doc, {
          startY,
          head: [[roomLabel]],
          body: [[parts.join("  |  ")]],
          margin: { left: MARGIN, right: MARGIN },
          theme: "grid",
          styles: { fontSize: 8, font: CZECH_FONT_NAME, cellPadding: 2 },
          headStyles: { fillColor: [240, 240, 240], font: CZECH_FONT_NAME },
        });
        startY = getLastTableBottom(doc) + 6;
      }
    });
  }

  const zapatiTitle = (schema.zapati?.Name ?? "Patička").trim() || "Patička";
  const zapatiValues = (data.zapatiValues ?? {}) as Record<string, unknown>;
  const zapatiBody = sectionRowsFromValues(schema.zapati, zapatiValues, enums);
  if (zapatiBody.length > 0) {
    doc.setFontSize(11);
    doc.text(zapatiTitle, MARGIN, startY);
    startY += 5;
    autoTable(doc, {
      startY,
      head: [["Položka", "Hodnota"]],
      body: zapatiBody,
      margin: { left: MARGIN, right: MARGIN },
      theme: "grid",
      styles: { fontSize: 9, font: CZECH_FONT_NAME, fontStyle: "normal", cellPadding: 2 },
      headStyles: { fillColor: [220, 235, 250], font: CZECH_FONT_NAME, fontStyle: "normal" },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 120 },
      },
    });
    startY = getLastTableBottom(doc) + 8;
  }

  const hasAnyPdfContent =
    cust.length > 0 ||
    zahlaviBody.length > 0 ||
    zapatiBody.length > 0 ||
    hasRenderableRoomRows ||
    (columns.length === 0 && rooms.length > 0 && hasSchemaLessContent);

  /** Nothing beyond title / kód produktu */
  if (!hasAnyPdfContent) {
    doc.setFontSize(9);
    doc.text("Žádná vyplněná data k zobrazení.", MARGIN, startY);
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
