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
