/**
 * Types for product extraction from step 1 forms (used to prefill ADMF)
 */

/** Single product row for ADMF "Záznam o jednání se zákazníkem" table */
export interface ExtractedProductLine {
  /** Product label (e.g. "Horizontální žaluzie - PRIM - 80x120") */
  produkt: string;
  /** Quantity (ks) */
  ks: number;
  /** Frame (rám) */
  ram?: string;
  /** Slat/fabric (lamela/látka) */
  lamelaLatka?: string;
  /** Unit price – from pricing service (mocked until external API) */
  cena: number;
  /** Discount % (0–100), default 0 */
  sleva: number;
  /** Price after discount (cena * (1 - sleva/100)) */
  cenaPoSleve: number;
}

/** Response of extract-products endpoint */
export interface ExtractProductsResponse {
  /** Product lines for ADMF table (with mocked prices) */
  products: ExtractedProductLine[];
  /** Form IDs from which products were extracted (for hover highlight and storage in ADMF) */
  source_form_ids: number[];
}
