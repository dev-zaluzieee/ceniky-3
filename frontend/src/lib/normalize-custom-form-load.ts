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
  let product_schemas: Record<string, ProductPayload> = { ...(json.product_schemas ?? {}) };
  if (pid && !product_schemas[pid]) {
    product_schemas = { ...product_schemas, [pid]: json.schema };
  }

  const rooms = json.data.rooms.map((room) => ({
    ...room,
    rows: room.rows.map((row): CatalogFormRow => {
      const r = row as unknown as Record<string, unknown>;
      if (
        r &&
        typeof r === "object" &&
        "values" in r &&
        typeof r.values === "object" &&
        r.values !== null &&
        typeof r.product_pricing_id === "string"
      ) {
        return row as CatalogFormRow;
      }
      const id = String(r.id ?? "");
      const linkGroupId = r.linkGroupId != null ? String(r.linkGroupId) : undefined;
      const values: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k === "id" || k === "linkGroupId") continue;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          values[k] = v;
        }
      }
      const usePid = pid || (typeof r.product_pricing_id === "string" ? r.product_pricing_id : "");
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
