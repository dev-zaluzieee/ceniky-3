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

/** Součet řádků produktů (bez DPH, po řádkové slevě). */
export function sumProductRowsBezDph(formJson: Record<string, unknown>): number {
  const rows = (formJson.productRows as Array<{ cenaPoSleve?: number; ks?: number }> | undefined) ?? [];
  return rows.reduce((sum, r) => sum + (r.cenaPoSleve ?? 0) * (r.ks ?? 1), 0);
}

/**
 * Celková částka bez DPH po přičtení montáže a odečtení OVT/MNG slev (slevy jsou bez DPH).
 * Minimálně 0 Kč.
 */
export function computeAdmfCelkemBezDph(formJson: Record<string, unknown>): number {
  const produkty = sumProductRowsBezDph(formJson);
  const montaz = effectiveMontazBezDph(formJson);
  const ovt = Math.max(0, Number(formJson.ovtSlevaCastka) || 0);
  const mng =
    formJson.mngSleva === true && (Number(formJson.mngSlevaCastka) || 0) > 0
      ? Math.max(0, Number(formJson.mngSlevaCastka) || 0)
      : 0;
  return Math.max(0, produkty + montaz - ovt - mng);
}

export function computeAdmfCelkemSDph(formJson: Record<string, unknown>): number {
  const vatRate = parseAdmfVatRatePercent(formJson.vatRate);
  const bez = computeAdmfCelkemBezDph(formJson);
  return Math.round(bez * (1 + vatRate / 100));
}
