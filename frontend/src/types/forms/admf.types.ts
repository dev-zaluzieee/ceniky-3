/**
 * Type definitions for ADMF (administrativní formulář) form
 * Product prices and montáž are stored without VAT; VAT is applied for display and záloha/doplatek.
 */

/** Single price-affecting field used to resolve product price (for display in ADMF). */
export interface AdmfPriceAffectingField {
  /** Code of the field as used in schema / price_affecting_enums (e.g. "type", "color"). */
  code: string;
  /** Human-friendly label from JSON schema when available (fallback: code). */
  label: string;
  /** Human-friendly value (e.g. enum Name) when available (fallback: raw code/value as string). */
  value: string;
}

/** Mirrors backend `AdmfPricingTraceDimensionsV1` — audit only, not shown in OVT UI. */
export interface AdmfPricingTraceDimensionsV1 {
  raw_width: string;
  raw_height: string;
  input_width_mm: number;
  input_height_mm: number;
  width_mm_ceiled: number;
  height_mm_ceiled: number;
  lookup_width_mm: number;
  lookup_height_mm: number;
  used_dimension_snap: boolean;
  price_key: string;
}

/** Mirrors backend `AdmfPricingTraceAutomatedV1`. */
export interface AdmfPricingTraceAutomatedV1 {
  resolved_at: string;
  product_pricing_id: string;
  source_form_id: number;
  room_name?: string;
  room_index: number;
  row_index: number;
  /** Omitted or null when variant is surcharge-only (no width×height grid). */
  dimensions?: AdmfPricingTraceDimensionsV1 | null;
  pricing_variant_id: string;
  /** True when matched pricing_variant has no dimension grid; `unit_price_grid` is 0, line price from příplatky. */
  surcharge_only?: boolean;
  selector_applied: Record<string, string>;
  /** Unit price from grid before quantity, without surcharges; 0 for surcharge-only variants. */
  unit_price_grid: number;
  ks: number;
  line_base: number;
  surcharge_total: number;
  surcharges?: Array<{ code: string; label?: string; amount: number }>;
  surcharge_warnings?: string[];
  cena: number;
  sleva: number;
  cenaPoSleve: number;
}

/** Mirrors backend `AdmfPricingManualEditV1`. */
export interface AdmfPricingManualEditV1 {
  edited_at: string;
  cena: number;
  sleva: number;
  cenaPoSleve: number;
  ks: number;
  fields_changed: string[];
}

/**
 * Carried in `form_json` for downstream tools; OVT UI does not display this.
 * Backend sets `automated` at extract; client appends `manual_edits` on price/qty/surcharge edits.
 */
export interface AdmfPricingTraceV1 {
  trace_version: 1;
  automated?: AdmfPricingTraceAutomatedV1;
  manual_edits?: AdmfPricingManualEditV1[];
}

/** Single row in "Záznam o jednání se zákazníkem" table (prices without VAT) */
export interface AdmfProductRow {
  id: string;
  produkt: string;
  ks: number;
  /** Unit price without VAT */
  cena: number;
  /** Discount % (0–100) */
  sleva: number;
  /** Price after discount, without VAT */
  cenaPoSleve: number;
  /** Price from grid before surcharges (if available) */
  baseCena?: number;
  /** Per-property surcharges applied to this line (editable amounts) */
  surcharges?: Array<{
    code: string;
    label?: string;
    amount: number;
  }>;
  /** Optional warnings about příplatky, shown in Czech under the row */
  surchargeWarnings?: string[];
  /**
   * Fields that directly affected price resolution (selector for pricing_variant).
   * Used in UI/PDF for the two price-affecting columns (e.g. typ, barva / rám, lamela).
   */
  priceAffectingFields?: AdmfPriceAffectingField[];
  /** Pricing audit trail — not shown in UI; preserved on save for external consumers. */
  pricingTrace?: AdmfPricingTraceV1;
}

/** VAT rate in % */
export type AdmfVatRate = 0 | 12 | 21;

/**
 * ADMF form data (form_json)
 */
export interface AdmfFormData {
  name: string;
  source_form_ids: number[];

  /** Customer block (from order) */
  jmenoPrijmeni?: string;
  ico?: string;
  dic?: string;
  nazevFirmy?: string;
  email?: string;
  telefon?: string;
  ulice?: string;
  mesto?: string;
  psc?: string;
  castMesta?: string;
  bytRdFirma?: string;

  /** Invoice override – when true, worker has opted to edit customer/invoice data */
  fakturaOverride?: boolean;
  /** Person type for invoice: "soukroma" (default) or "pravnicka" */
  typOsoby?: "soukroma" | "pravnicka";

  /** Delivery address override – when true, delivery address differs from customer address */
  jinaAdresaDodani?: boolean;
  dodaciUlice?: string;
  dodaciMesto?: string;
  dodaciPsc?: string;

  /** Product table (prices without VAT) */
  productRows: AdmfProductRow[];

  /** Montáž: price without VAT (default 1339 → 1500 with 12% VAT) */
  montazCenaBezDph?: number;
  /**
   * `auto` = vždy výchozí částka montáže (1339 Kč bez DPH), `manual` = použít `montazCenaBezDph`.
   * U starých záznamů bez pole se chová jako `manual`.
   */
  montazCenaZpusob?: "auto" | "manual";

  /** Slevy (total-level, not per-row) */
  /** MNG (manager) discount toggle */
  mngSleva?: boolean;
  /** MNG discount amount in CZK (from total price) */
  mngSlevaCastka?: number;
  /** OVT discount amount in CZK (from total price) */
  ovtSlevaCastka?: number;

  /** Další informace */
  typZarizeni?: string;
  parkovani?: boolean;
  zv?: string;
  maZakaznikVyfocenouLamelu?: boolean;
  /** Informative: name on doorbell / buzzer instructions */
  zvonek?: string;
  /** Informative: floor number */
  patro?: string;
  /** Informative: additional parking info (beyond boolean parkovani) */
  infoKParkovani?: string;

  /** Poznámky */
  poznamkyVyroba?: string;
  poznamkyMontaz?: string;
  /** Montáž / demontáž */
  montaz?: string;
  demontaz?: string;
  /** Legacy field names still used in current ADMF UI/PDF */
  doplnujiciInformaceObjednavky?: string;
  doplnujiciInformaceMontaz?: string;

  /** VAT logic */
  platceDph?: boolean;
  faktura?: boolean;
  /** "bytovy" (default) or "nebytovy" */
  typProstoru?: "bytovy" | "nebytovy";
  /** Selected VAT rate % (default 12) */
  vatRate?: AdmfVatRate;

  /** Platba a montáž */
  kObjednani?: string;
  zalohaZaplacena?: string;
  vybranaCastka?: number;
  castkaDoplatku?: number;
  /** K OBJEDNÁNÍ – zálohová faktura (amount with VAT, what customer pays as deposit) */
  zalohovaFaktura?: number;
  /** Variabilní symbol (typically customer phone number as a number) */
  variabilniSymbol?: number;
  /** Doplatek = celkem s DPH − zálohová faktura (computed, can be stored for PDF) */
  doplatek?: number;
  /** Info k záloze (reason/details about deposit) */
  infoKZaloze?: string;
  /** Info k faktuře (additional invoice info) */
  infoKFakture?: string;
  predpokladanaDodaciDoba?: string;
  predpokladanaDobaMontaze?: string;
  kodTerminalu?: string;
  dobaMontaze?: string;

  /** Datum (default today, editable) */
  datum?: string;
  podpisZakaznika?: string;
  jmenoPodpisZprostredkovatele?: string;
}
