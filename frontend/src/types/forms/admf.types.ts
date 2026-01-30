/**
 * Type definitions for ADMF (administrativní formulář) form
 * Matches the administrative form layout; product table prefilled from step 1 forms.
 */

/** Single row in "Záznam o jednání se zákazníkem" table */
export interface AdmfProductRow {
  id: string;
  produkt: string;
  ks: number;
  ram: string;
  lamelaLatka: string;
  cena: number;
  sleva: number;
  cenaPoSleve: number;
}

/**
 * ADMF form data (form_json)
 * source_form_ids: form IDs from which this ADMF was generated (for hover highlight on order page)
 */
export interface AdmfFormData {
  /** Display name (e.g. "Varianta 1", "Varianta 2"); editable */
  name: string;
  /** Form IDs from step 1 used to generate this ADMF (for hover highlight) */
  source_form_ids: number[];

  /** Customer/order block (from order, read-only on form when under order) */
  mesto?: string;
  castMesta?: string;
  ulice?: string;
  jmenoPrijmeni?: string;
  telefon?: string;
  email?: string;
  bytRdFirma?: string;

  /** Product table */
  productRows: AdmfProductRow[];

  /** Doplňující informace */
  doplnujiciInformaceObjednavky?: string;
  doplnujiciInformaceMontaz?: string;

  /** K OBJEDNÁNÍ */
  platceDph?: string;
  faktura?: string;
  nebytovyProstor?: string;
  bytovyProstor?: string;
  cena0?: boolean;
  cena12?: boolean;
  cena21?: boolean;
  celaZakazkaSicekEtapy?: string;
  ic?: string;
  zaloha?: string;
  zalohovaFaktura?: string;
  doplatek?: string;
  koncovaFaktura?: string;

  /** Dodací lhůta, montáž */
  predpokladanaDodaciDoba?: string;
  kodTerminalu?: string;
  dobaMontaze?: string;
  maZakaznikVyfocenouLamelu?: string;

  /** Podpisy */
  datum?: string;
  podpisZakaznika?: string;
  jmenoPodpisZprostredkovatele?: string;
}
