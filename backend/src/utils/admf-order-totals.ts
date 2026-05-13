/**
 * Single source of truth for ADMF order subtotals (bez DPH) and celkem s DPH.
 * Aligns UI, PDF, ERP and Raynet exports with montáž režim + OVT/MNG slevy (částky bez DPH).
 */

export const ADMF_DEFAULT_MONTAZ_BEZ_DPH = 1339;

/** DPH sazba v % z `form_json`; výchozí 12 jen při chybějící nebo nečíselné hodnotě (0 % je platné). */
export function parseAdmfVatRatePercent(raw: unknown): number {
  if (raw === null || raw === undefined) return 12;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 12;
  return n;
}

/** Montáž částka used in totals: auto = fixed default, manual = stored `montazCenaBezDph`. */
export function effectiveMontazBezDph(formJson: Record<string, unknown>): number {
  if (formJson.montazCenaZpusob === "auto") return ADMF_DEFAULT_MONTAZ_BEZ_DPH;
  const n = formJson.montazCenaBezDph;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  return ADMF_DEFAULT_MONTAZ_BEZ_DPH;
}

/**
 * Součet řádků produktů (bez DPH, po řádkové slevě).
 *
 * `cenaPoSleve` je **line total per row** (cena za celý řádek včetně všech
 * kusů a příplatků). Extract z výrobního formuláře produkuje
 *   `cenaBase = unitPrice × ks`, `cenaPoSleve = round(cenaBase × (1 - sleva/100))`
 * a AdmfFormClient.recalcCenaPoSleve drží stejný tvar. Proto v součtu
 * **NEnásobíme** `ks` znovu — dělalo by to dvojí započtení (před opravou
 * `cenaPoSleve × ks` vracelo `ks² × unit_price`, latentní bug viditelný od
 * `ks > 1`).
 */
export function sumProductRowsBezDph(formJson: Record<string, unknown>): number {
  const rows = (formJson.productRows as Array<{ cenaPoSleve?: number }> | undefined) ?? [];
  return rows.reduce((sum, r) => sum + (r.cenaPoSleve ?? 0), 0);
}

/**
 * OVT/MNG slevy z form_json (s DPH, jak je rep s zákazníkem dohodl).
 * Pro účetní bez-DPH derivace viz `slevySDphToBezDph` níže.
 */
function ovtSlevaSDphFromForm(formJson: Record<string, unknown>): number {
  return Math.max(0, Number(formJson.ovtSlevaSDph) || 0);
}
function mngSlevaSDphFromForm(formJson: Record<string, unknown>): number {
  if (formJson.mngSleva !== true) return 0;
  return Math.max(0, Number(formJson.mngSlevaSDph) || 0);
}

/** Per-line s-DPH conversion (ceil → whole Kč), so sum of displayed lines = Celkem. */
function lineSDphCeil(bezDph: number, vatRate: number): number {
  if (!Number.isFinite(bezDph) || bezDph <= 0) return 0;
  return Math.ceil(bezDph * (1 + vatRate / 100));
}

/**
 * Součet produktových řádků v s-DPH: každý řádek zvlášť převedený na s-DPH
 * stropem (ceil), pak sčítáme. Tím se zaručí, že displayed rows + montáž
 * vždycky sednou s Celkem (bug ze sumy-zaokrouhlení vs zaokrouhlení-sumy).
 */
export function sumProductRowsSDph(formJson: Record<string, unknown>): number {
  const vatRate = parseAdmfVatRatePercent(formJson.vatRate);
  const rows = (formJson.productRows as Array<{ cenaPoSleve?: number }> | undefined) ?? [];
  return rows.reduce((sum, r) => sum + lineSDphCeil(r.cenaPoSleve ?? 0, vatRate), 0);
}

/**
 * Celkem s DPH = (Σ per-line ceil) + ceil(montaz × VAT) − slevy_s_DPH.
 * Slevy jsou uložené v s-DPH prostoru (mental model: rep typed "3000 Kč off"
 * a zákazník přesně tolik vidí odečteno z celkové ceny).
 */
export function computeAdmfCelkemSDph(formJson: Record<string, unknown>): number {
  const vatRate = parseAdmfVatRatePercent(formJson.vatRate);
  const produktySDph = sumProductRowsSDph(formJson);
  const montazSDph = lineSDphCeil(effectiveMontazBezDph(formJson), vatRate);
  const ovtSDph = ovtSlevaSDphFromForm(formJson);
  const mngSDph = mngSlevaSDphFromForm(formJson);
  return Math.max(0, produktySDph + montazSDph - ovtSDph - mngSDph);
}

/**
 * Celkem bez DPH — derivace z celkem s DPH zpět do bez-DPH prostoru.
 * Používá se pro účetnictví; přesný haléřový rozpad může lehce driftovat od
 * (suma bez DPH řádků) × (1+VAT) o ±1 Kč kvůli zaokrouhlení slev — to je
 * akceptované (s-DPH je teď zdrojem pravdy).
 */
export function computeAdmfCelkemBezDph(formJson: Record<string, unknown>): number {
  const vatRate = parseAdmfVatRatePercent(formJson.vatRate);
  const celkemSDph = computeAdmfCelkemSDph(formJson);
  return Math.round((celkemSDph * 100) / (100 + vatRate));
}

/**
 * Pro Raynet a další bez-DPH consumery: zpětně převedená sleva.
 * `Math.round` aby se předešlo systematickému zaokrouhlovacímu posunu.
 */
export function slevaSDphToBezDph(slevaSDph: number, vatRatePercent: number): number {
  if (!Number.isFinite(slevaSDph) || slevaSDph <= 0) return 0;
  return Math.round((slevaSDph * 100) / (100 + vatRatePercent));
}
