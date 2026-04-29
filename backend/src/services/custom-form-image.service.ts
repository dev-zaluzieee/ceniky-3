/**
 * Server-side PNG generation for step-1 "custom" forms (výrobní list).
 * Width is computed from content so columns never wrap unless they exceed the configured cap.
 */

import { ImagePage, STYLE, formatGeneratedAt } from "./image-rendering.utils";

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

type CustomerBlock = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  city?: unknown;
};

const CUSTOMER_FIELDS: { key: keyof CustomerBlock; label: string }[] = [
  { key: "name", label: "Jméno / název" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefon" },
  { key: "address", label: "Adresa" },
  { key: "city", label: "Město" },
];

const ROW_INTERNAL_KEYS = new Set(["id", "linkGroupId", "product_pricing_id", "values"]);

function propertyLabel(p: PropertyDefinition): string {
  return (p["label-form"] ?? p.Name ?? p.Code).trim() || p.Code;
}

function enumValuesForProperty(
  enums: Record<string, EnumEntry> | undefined,
  propertyCode: string
): EnumValue[] {
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

function formatPrimitive(
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

function shouldIncludeSectionRow(
  prop: PropertyDefinition | undefined,
  raw: unknown,
  formatted: string
): boolean {
  if (prop?.DataType === "boolean" || prop?.DataType === "link") return true;
  if (typeof raw === "boolean") return true;
  return !isEmptyDisplay(formatted);
}

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
    const formatted = formatPrimitive(prop, raw, enums);
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
    const formatted = formatPrimitive(col, raw, enums);
    if (!isEmptyDisplay(formatted)) return true;
  }
  return false;
}

function flattenDataRow(row: Record<string, unknown>): FormRow {
  const values = row.values;
  if (values && typeof values === "object" && !Array.isArray(values)) {
    const out: FormRow = { ...(values as FormRow) };
    if (row.linkGroupId !== undefined) {
      (out as Record<string, unknown>).linkGroupId = row.linkGroupId as string | boolean;
    }
    return out;
  }
  return row as FormRow;
}

function rowSchemaForRow(
  rawRow: Record<string, unknown>,
  productSchemas: Record<string, ProductPayload>,
  topSchema: ProductPayload
): ProductPayload | null {
  const pid = typeof rawRow.product_pricing_id === "string" ? rawRow.product_pricing_id.trim() : "";
  if (pid && productSchemas[pid]) return productSchemas[pid];
  const topPid =
    typeof (topSchema as { _product_pricing_id?: string })._product_pricing_id === "string"
      ? (topSchema as { _product_pricing_id?: string })._product_pricing_id?.trim()
      : undefined;
  if (pid && topPid === pid) return topSchema;
  if (!pid && formBodyPropertyColumns(topSchema).length > 0) return topSchema;
  return null;
}

export async function generateCustomFormImageBuffer(raw: Record<string, unknown>): Promise<Buffer> {
  const formJson = raw as Record<string, unknown>;
  const schema = (formJson.schema ?? {}) as ProductPayload;
  const data = (formJson.data ?? formJson) as Record<string, unknown>;
  const productSchemas =
    formJson.product_schemas && typeof formJson.product_schemas === "object"
      ? (formJson.product_schemas as Record<string, ProductPayload>)
      : {};

  const productNameRaw = data.productName;
  const productName =
    typeof productNameRaw === "string" && productNameRaw.trim() !== ""
      ? productNameRaw.trim()
      : typeof formJson.name === "string" && formJson.name.trim() !== ""
        ? formJson.name.trim()
        : "Výrobní list";

  const productCode =
    typeof data.productCode === "string" && data.productCode.trim() !== ""
      ? data.productCode.trim()
      : typeof schema.product_code === "string"
        ? schema.product_code.trim()
        : "";

  const enums = schema.enums ?? {};
  const page = new ImagePage();

  page.titleLine(
    { text: "VÝROBNÍ LIST", fontSize: STYLE.titleFontSize, bold: true },
    { text: `Vygenerováno: ${formatGeneratedAt(new Date())}`, fontSize: STYLE.smallFontSize }
  );
  page.text(productName, { fontSize: STYLE.headingFontSize });
  if (productCode) {
    page.text(`Kód produktu: ${productCode}`, { fontSize: STYLE.bodyFontSize, color: STYLE.muted });
  }
  page.spacer(8);

  const cust = customerRows(data);
  if (cust.length > 0) {
    page.text("Zákazník", { fontSize: STYLE.headingFontSize, bold: true });
    page.spacer(2);
    page.table({
      head: ["Údaj", "Hodnota"],
      body: cust,
      columns: [{}, { maxWidth: STYLE.defaultValueColumnMaxWidth }],
    });
  }

  const zahlaviTitle = (schema.zahlavi?.Name ?? "Hlavička").trim() || "Hlavička";
  const zahlaviValues = (data.zahlaviValues ?? {}) as Record<string, unknown>;
  const zahlaviBody = sectionRowsFromValues(schema.zahlavi, zahlaviValues, enums);
  if (zahlaviBody.length > 0) {
    page.spacer(6);
    page.text(zahlaviTitle, { fontSize: STYLE.headingFontSize, bold: true });
    page.spacer(2);
    page.table({
      head: ["Položka", "Hodnota"],
      body: zahlaviBody,
      headFill: "#dceaf6",
      columns: [{}, { maxWidth: STYLE.defaultValueColumnMaxWidth }],
    });
  }

  const rooms = Array.isArray(data.rooms) ? (data.rooms as Room[]) : [];

  const hasRenderableRoomRows = rooms.some((room) =>
    (room.rows ?? []).some((rawRow) => {
      const rowObj = rawRow as Record<string, unknown>;
      const rowSchema = rowSchemaForRow(rowObj, productSchemas, schema);
      if (!rowSchema) return false;
      const cols = formBodyPropertyColumns(rowSchema);
      if (cols.length === 0) return false;
      const flat = flattenDataRow(rowObj);
      const rowEnums = rowSchema.enums ?? {};
      return roomTableIsNonEmpty(cols, flat, rowEnums);
    })
  );

  const hasSchemaLessContent =
    formBodyPropertyColumns(schema).length === 0 &&
    rooms.some((room) =>
      (room.rows ?? []).some((row) => {
        const flat = flattenDataRow(row as Record<string, unknown>);
        const keys = Object.keys(flat).filter((k) => !ROW_INTERNAL_KEYS.has(k));
        return keys.some((k) => !isEmptyDisplay(formatPrimitive(undefined, flat[k], enums)));
      })
    );

  if (rooms.length > 0 && hasRenderableRoomRows) {
    page.spacer(6);
    page.text("Místnosti a položky", { fontSize: STYLE.headingFontSize, bold: true });
    page.spacer(2);

    rooms.forEach((room, idx) => {
      const roomLabel =
        (room.name && String(room.name).trim() !== "" ? String(room.name).trim() : null) ??
        `Místnost ${idx + 1}`;
      const rows = room.rows ?? [];
      if (rows.length === 0) return;

      page.spacer(4);
      page.text(roomLabel, { fontSize: STYLE.bodyFontSize, bold: true });

      rows.forEach((rawRow, ri) => {
        const rowObj = rawRow as Record<string, unknown>;
        const rowSchema = rowSchemaForRow(rowObj, productSchemas, schema);
        if (!rowSchema) return;
        const columns = formBodyPropertyColumns(rowSchema);
        if (columns.length === 0) return;
        const flat = flattenDataRow(rowObj);
        const rowEnums = rowSchema.enums ?? {};
        if (!roomTableIsNonEmpty(columns, flat, rowEnums)) return;

        const fbName = (rowSchema.form_body?.Name ?? "").trim();
        const rowTitle = fbName || rowSchema.product_code || `Řádek ${ri + 1}`;
        page.spacer(2);
        page.text(rowTitle, { fontSize: STYLE.smallFontSize, color: STYLE.muted });
        page.table({
          head: columns.map((c) => propertyLabel(c)),
          body: [columns.map((col) => formatPrimitive(col, flat[col.Code], rowEnums))],
          columns: columns.map(() => ({ maxWidth: STYLE.defaultValueColumnMaxWidth })),
        });
      });
    });
  } else if (rooms.length > 0 && hasSchemaLessContent) {
    page.spacer(6);
    page.text("Místnosti (bez definice sloupců ve schématu)", {
      fontSize: STYLE.headingFontSize,
      bold: true,
    });
    page.spacer(2);
    rooms.forEach((room, idx) => {
      const roomLabel =
        (room.name && String(room.name).trim() !== "" ? String(room.name).trim() : null) ??
        `Místnost ${idx + 1}`;
      const rows = room.rows ?? [];
      for (const row of rows) {
        const flat = flattenDataRow(row as Record<string, unknown>);
        const keys = Object.keys(flat).filter((k) => !ROW_INTERNAL_KEYS.has(k));
        const parts = keys
          .map((k) => {
            const v = formatPrimitive(undefined, flat[k], enums);
            return isEmptyDisplay(v) ? null : `${k}: ${v}`;
          })
          .filter((p): p is string => p !== null);
        if (parts.length === 0) continue;
        page.table({
          head: [roomLabel],
          body: [[parts.join("  |  ")]],
          headFill: "#f0f0f0",
          columns: [{ maxWidth: STYLE.defaultValueColumnMaxWidth }],
        });
        page.spacer(2);
      }
    });
  }

  const zapatiTitle = (schema.zapati?.Name ?? "Patička").trim() || "Patička";
  const zapatiValues = (data.zapatiValues ?? {}) as Record<string, unknown>;
  const zapatiBody = sectionRowsFromValues(schema.zapati, zapatiValues, enums);
  if (zapatiBody.length > 0) {
    page.spacer(6);
    page.text(zapatiTitle, { fontSize: STYLE.headingFontSize, bold: true });
    page.spacer(2);
    page.table({
      head: ["Položka", "Hodnota"],
      body: zapatiBody,
      headFill: "#dceaf6",
      columns: [{}, { maxWidth: STYLE.defaultValueColumnMaxWidth }],
    });
  }

  const hasAnyContent =
    cust.length > 0 ||
    zahlaviBody.length > 0 ||
    zapatiBody.length > 0 ||
    hasRenderableRoomRows ||
    (formBodyPropertyColumns(schema).length === 0 && rooms.length > 0 && hasSchemaLessContent);

  if (!hasAnyContent) {
    page.spacer(8);
    page.text("Žádná vyplněná data k zobrazení.", { fontSize: STYLE.bodyFontSize, color: STYLE.muted });
  }

  return page.toPng();
}
