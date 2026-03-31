import type { ProductPayload } from "@/types/json-schema-form.types";

/**
 * Human-readable product title from catalog payload.
 * Treats null/undefined, empty, and whitespace-only `Name` values as missing at each step
 * (unlike raw `??` on strings), so list labels and form `productName` stay aligned with
 * `extractDisplayNameFromOvtExport` on the backend.
 */
export function resolveProductNameFromPayload(payload: ProductPayload): string {
  const pick = (v: unknown): string | undefined => {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    return undefined;
  };
  const code = typeof payload.product_code === "string" ? payload.product_code : "";
  const fallback = code.trim().length > 0 ? code.trim() : "—";
  return (
    pick(payload.form_body?.Name) ??
    pick(payload.zahlavi?.Name) ??
    pick(payload.zapati?.Name) ??
    fallback
  );
}
