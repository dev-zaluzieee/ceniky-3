/**
 * Types for product extraction from step 1 forms (used to prefill ADMF)
 *
 * **Pricing audit (`pricingTrace`):** see `docs/admf-pricing-trace.md` for the full schema and monitoring guidance.
 */

/** Dimension math used for pricing_variant grid lookup (stored on ADMF for audit). */
export interface AdmfPricingTraceDimensionsV1 {
  /** Raw width string from the výrobní row (before numeric parsing). */
  raw_width: string;
  /** Raw height string from the výrobní row. */
  raw_height: string;
  /** Parsed width in mm (rounded), before ceil-to-100. */
  input_width_mm: number;
  /** Parsed height in mm (rounded), before ceil-to-100. */
  input_height_mm: number;
  /** Width after pricing tool convention (ceil to 100 mm). */
  width_mm_ceiled: number;
  /** Height after ceil to 100 mm. */
  height_mm_ceiled: number;
  /** Width used for `prices` key lookup (may equal ceiled or snapped). */
  lookup_width_mm: number;
  /** Height used for `prices` key lookup. */
  lookup_height_mm: number;
  /** True when lookup dimensions differ from ceiled (grid snap). */
  used_dimension_snap: boolean;
  /** Key into `dimension_pricing.prices` (`<height>_<width>`). */
  price_key: string;
}

/**
 * Server-side pricing resolution snapshot (ADMF `pricingTrace.automated`).
 * Written at extract-products time; not shown in OVT UI — carried in form_json for downstream tools.
 */
export interface AdmfPricingTraceAutomatedV1 {
  resolved_at: string;
  product_pricing_id: string;
  /** Custom form id this line was extracted from. */
  source_form_id: number;
  /** Room label from výrobní form data when present. */
  room_name?: string;
  room_index: number;
  row_index: number;
  dimensions: AdmfPricingTraceDimensionsV1;
  pricing_variant_id: string;
  /** Selector field codes → raw values used to match the variant. */
  selector_applied: Record<string, string>;
  /** Unit price from dimension grid (before quantity), without surcharges. */
  unit_price_grid: number;
  ks: number;
  /** `unit_price_grid * ks` before surcharges. */
  line_base: number;
  /** Sum of surcharge amounts for this line. */
  surcharge_total: number;
  surcharges?: Array<{ code: string; label?: string; amount: number }>;
  surcharge_warnings?: string[];
  /** Line totals after surcharges (sleva 0 at extraction). */
  cena: number;
  sleva: number;
  cenaPoSleve: number;
}

/** One user edit to price-related fields in ADMF UI (appended in order). */
export interface AdmfPricingManualEditV1 {
  edited_at: string;
  cena: number;
  sleva: number;
  cenaPoSleve: number;
  ks: number;
  fields_changed: string[];
}

/**
 * Self-contained pricing audit on an ADMF product row (`form_json.productRows[].pricingTrace`).
 * `automated` is set by backend extraction; `manual_edits` appended by frontend when user changes prices/qty/surcharges.
 */
export interface AdmfPricingTraceV1 {
  trace_version: 1;
  automated?: AdmfPricingTraceAutomatedV1;
  manual_edits?: AdmfPricingManualEditV1[];
}

/** Single price-affecting field used in variant selection (for display in ADMF). */
export interface ExtractedPriceAffectingField {
  /** Code of the field as used in schema / price_affecting_enums (e.g. "type", "color"). */
  code: string;
  /** Human-friendly label from JSON schema when available (fallback: code). */
  label: string;
  /** Human-friendly value (e.g. enum Name) when available (fallback: raw code/value as string). */
  value: string;
}

/** Single product row for ADMF "Záznam o jednání se zákazníkem" table */
export interface ExtractedProductLine {
  /** Product label (e.g. "Horizontální žaluzie - PRIM - 80x120") */
  produkt: string;
  /** Quantity (ks) */
  ks: number;
  /** Row price without VAT as computed at extraction (grid × ks + surcharges; before sleva). */
  cena: number;
  /** Discount % (0–100), default 0 */
  sleva: number;
  /** Price after discount (cena * (1 - sleva/100)) */
  cenaPoSleve: number;
  /** Price from dimension grid before surcharges (if available) */
  baseCena?: number;
  /** Per-property surcharges applied to this line (optional breakdown) */
  surcharges?: Array<{
    code: string;
    label?: string;
    amount: number;
  }>;
  /** Optional warnings about surcharges (e.g. missing config); shown in ADMF in Czech */
  surchargeWarnings?: string[];
  /**
   * Fields that directly affected price resolution (selector for pricing_variant).
   * Used on ADMF for the two price-affecting columns (e.g. typ, barva / rám, lamela).
   */
  priceAffectingFields?: ExtractedPriceAffectingField[];
  /** Pricing audit trail for this row (backend fills `automated`; client may append `manual_edits`). */
  pricingTrace?: AdmfPricingTraceV1;
}

/** Response of extract-products endpoint */
export interface ExtractProductsResponse {
  /** Product lines for ADMF (prices resolved from pricing DB). */
  products: ExtractedProductLine[];
  /** Form IDs from which products were extracted (for hover highlight and storage in ADMF) */
  source_form_ids: number[];
}
