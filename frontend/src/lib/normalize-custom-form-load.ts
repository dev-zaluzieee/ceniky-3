/**
 * Normalize persisted `custom` form_json for the multi-product row model.
 * Older records used flat `FormRow` objects; new shape uses `CatalogFormRow` + `product_schemas`.
 */

import type {
  CatalogFormRow,
  CustomFormJson,
  JsonSchemaFormData,
  ProductPayload,
} from "@/types/json-schema-form.types";

const LEGACY_LOCAL_SCHEMA_PID = "__legacy_local_schema__";

function normalizedRowId(rawId: unknown, roomIndex: number, rowIndex: number): string {
  const existingId = rawId != null ? String(rawId).trim() : "";
  if (existingId) return existingId;
  /** Deterministic fallback keeps legacy rows addressable during this load. */
  return `legacy-row-${roomIndex}-${rowIndex}`;
}

export interface NormalizedCustomLoad {
  schema: ProductPayload;
  product_schemas: Record<string, ProductPayload>;
  data: JsonSchemaFormData;
}

/**
 * @param json - raw `form_json` from API
 */
export function normalizeCustomFormOnLoad(json: CustomFormJson): NormalizedCustomLoad {
  const pid = json.schema._product_pricing_id?.trim() ?? "";
  const fallbackPid = pid || (json.schema.form_body?.Properties?.length ? LEGACY_LOCAL_SCHEMA_PID : "");
  let product_schemas: Record<string, ProductPayload> = { ...(json.product_schemas ?? {}) };
  if (fallbackPid && !product_schemas[fallbackPid]) {
    /**
     * Legacy custom forms could have flat room rows without any catalog pricing id.
     * Keep those rows editable by attaching them to a synthetic local schema id
     * instead of normalizing them into an invalid empty product_pricing_id.
     */
    product_schemas = { ...product_schemas, [fallbackPid]: json.schema };
  }

  const rooms = json.data.rooms.map((room, roomIndex) => ({
    ...room,
    rows: room.rows.map((row, rowIndex): CatalogFormRow => {
      const r = row as unknown as Record<string, unknown>;
      if (
        r &&
        typeof r === "object" &&
        "values" in r &&
        typeof r.values === "object" &&
        r.values !== null &&
        typeof r.product_pricing_id === "string"
      ) {
        return {
          ...(row as CatalogFormRow),
          id: normalizedRowId((row as CatalogFormRow).id, roomIndex, rowIndex),
        };
      }
      const id = normalizedRowId(r.id, roomIndex, rowIndex);
      const linkGroupId = r.linkGroupId != null ? String(r.linkGroupId) : undefined;
      const values: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k === "id" || k === "linkGroupId") continue;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          values[k] = v;
        }
      }
      const rowPid = typeof r.product_pricing_id === "string" ? r.product_pricing_id.trim() : "";
      const usePid = rowPid || fallbackPid;
      return {
        id,
        product_pricing_id: usePid,
        values,
        ...(linkGroupId ? { linkGroupId } : {}),
      };
    }),
  }));

  return {
    schema: json.schema,
    product_schemas,
    data: { ...json.data, rooms },
  };
}
