/**
 * Type definitions for ADMF (administrativní formulář) form
 * Product prices and montáž are stored without VAT; VAT is applied for display and záloha/doplatek.
 */

/** Single row in "Záznam o jednání se zákazníkem" table (prices without VAT) */
export interface AdmfProductRow {
  id: string;
  produkt: string;
  ks: number;
  ram: string;
  lamelaLatka: string;
  /** Unit price without VAT */
  cena: number;
  /** Discount % (0–100) */
  sleva: number;
  /** Price after discount, without VAT */
  cenaPoSleve: number;
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
  mesto?: string;
  castMesta?: string;
  ulice?: string;
  jmenoPrijmeni?: string;
  telefon?: string;
  email?: string;
  bytRdFirma?: string;

  /** Product table (prices without VAT) */
  productRows: AdmfProductRow[];

  /** Montáž: price without VAT (default 1339 → 1500 with 12% VAT) */
  montazCenaBezDph?: number;

  /** Doplňující informace */
  doplnujiciInformaceObjednavky?: string;
  doplnujiciInformaceMontaz?: string;

  /** VAT logic – booleans (A/N on paper) */
  platceDph?: boolean;
  faktura?: boolean;
  nebytovyProstor?: boolean;
  bytovyProstor?: boolean;
  /** Selected VAT rate % (default 12) */
  vatRate?: AdmfVatRate;

  /** K OBJEDNÁNÍ – zálohová faktura (amount with VAT, what customer pays as deposit) */
  zalohovaFaktura?: number;
  /** Doplatek = celkem s DPH − zálohová faktura (computed, can be stored for PDF) */
  doplatek?: number;

  predpokladanaDodaciDoba?: string;
  kodTerminalu?: string;
  dobaMontaze?: string;
  maZakaznikVyfocenouLamelu?: string;

  /** Datum (default today, editable) */
  datum?: string;
  podpisZakaznika?: string;
  jmenoPodpisZprostredkovatele?: string;
}
