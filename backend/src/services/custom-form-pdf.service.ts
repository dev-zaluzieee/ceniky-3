/**
 * Server-side PDF generation for step-1 "custom" forms (výrobní list).
 * The JSON schema for custom forms is flexible; we render a stable summary:
 * - Title (productName when present)
 * - Generic key/value table from form_json.data (flattened)
 *
 * Note: We intentionally do not try to match the full UI layout here — this PDF
 * is meant for exporting an audit-friendly snapshot to Raynet attachments.
 */

import fs from "fs/promises";
import path from "path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const MARGIN = 20;
const CZECH_FONT_NAME = "Roboto";

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

type FlatRow = { key: string; value: string };

function isPrimitive(v: unknown): v is string | number | boolean | null {
  return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function toDisplayString(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NaN";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString();
  return "";
}

function flattenObjectForPdf(
  input: unknown,
  out: FlatRow[],
  prefix = "",
  depth = 0,
  maxDepth = 2
): void {
  if (depth > maxDepth) {
    if (prefix) out.push({ key: prefix, value: "[…]" });
    return;
  }

  if (isPrimitive(input)) {
    if (prefix) out.push({ key: prefix, value: toDisplayString(input) });
    return;
  }

  if (Array.isArray(input)) {
    const primitives = input.filter(isPrimitive);
    if (primitives.length === input.length) {
      if (prefix) out.push({ key: prefix, value: primitives.map(toDisplayString).join(", ") });
      return;
    }
    if (prefix) out.push({ key: prefix, value: `[array:${input.length}]` });
    return;
  }

  if (typeof input === "object" && input) {
    const obj = input as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      if (prefix) out.push({ key: prefix, value: "{}" });
      return;
    }
    for (const k of keys) {
      const nextPrefix = prefix ? `${prefix}.${k}` : k;
      const v = obj[k];
      if (isPrimitive(v)) out.push({ key: nextPrefix, value: toDisplayString(v) });
      else flattenObjectForPdf(v, out, nextPrefix, depth + 1, maxDepth);
    }
  }
}

export async function generateCustomFormPdfBuffer(raw: Record<string, unknown>): Promise<Buffer> {
  const formJson = raw as Record<string, any>;
  const data = (formJson?.data ?? {}) as Record<string, unknown>;

  const title =
    (typeof data.productName === "string" && data.productName.trim() !== "" ? data.productName.trim() : null) ??
    (typeof formJson?.name === "string" && formJson.name.trim() !== "" ? formJson.name.trim() : null) ??
    "Výrobní list";

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await loadCzechFont(doc);

  doc.setFontSize(16);
  doc.text("VÝROBNÍ LIST", MARGIN, MARGIN);

  doc.setFontSize(12);
  doc.text(title, MARGIN, MARGIN + 8);

  // Flatten form_json.data for a stable export
  const rows: FlatRow[] = [];
  flattenObjectForPdf(data, rows);

  const tableBody = rows
    .filter((r) => r.key.trim() !== "")
    .map((r) => [r.key, r.value ?? ""]);

  autoTable(doc, {
    startY: MARGIN + 16,
    head: [["Pole", "Hodnota"]],
    body: tableBody.length > 0 ? tableBody : [["(prázdné)", ""]],
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    styles: { fontSize: 9, font: CZECH_FONT_NAME, fontStyle: "normal", cellPadding: 2 },
    headStyles: { fillColor: [220, 220, 220], font: CZECH_FONT_NAME, fontStyle: "normal" },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 120 },
    },
  });

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

