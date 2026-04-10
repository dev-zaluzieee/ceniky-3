/**
 * Build a `ProductPayload` from pricing API detail (catalog row) — same merge as custom form creation.
 */

import type { PricingFormDetail } from "@/lib/pricing-forms-api";
import type { ProductPayload } from "@/types/json-schema-form.types";

/**
 * @param pricingId - `product_pricing.id` (UUID)
 * @param detail - response from `getPricingFormById`
 */
export function productPayloadFromPricingDetail(
  pricingId: string,
  detail: PricingFormDetail
): ProductPayload {
  const payload = detail.ovt_export_json as ProductPayload;
  return {
    ...payload,
    _product_pricing_id: pricingId.trim(),
    _product_manufacturer: detail.manufacturer,
    price_affecting_enums: detail.price_affecting_enums ?? [],
  };
}
