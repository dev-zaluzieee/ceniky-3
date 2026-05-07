/**
 * Client wrapper for the form-level (ADMF-shaped) price preview endpoint.
 */

export interface AdmfDefaults {
  vatRateDefaultPercent: number;
  ovtSlevaDefaultBezDph: number;
  mngSlevaDefaultActive: boolean;
  mngSlevaDefaultBezDph: number;
  montazFallbackBezDph: number;
  bulkSlevaDefaultPercent: number;
  montazTiers: Array<{
    id: string;
    ordinal: number;
    minProductsBezDph: number;
    maxProductsBezDph: number | null;
    montazBezDph: number;
    note: string | null;
  }>;
  fromOfficePortal: boolean;
}

export interface FormPreviewParameters {
  vatRatePercent: number;
  ovtSlevaBezDph: number;
  mngSlevaActive: boolean;
  mngSlevaBezDph: number;
  /** Omit / null to let the server resolve the montáž tier from the products subtotal. */
  montazOverrideBezDph?: number | null;
  /** % applied to every product row's `sleva` (mirrors ADMF "Nastavit slevu všem"). */
  bulkSlevaPercent: number;
}

export interface FormPreviewLine {
  rowKey: string;
  roomName?: string;
  produkt: string;
  ks: number;
  cena: number;
  sleva: number;
  cenaPoSleve: number;
  surcharges?: Array<{ code: string; label?: string; amount: number }>;
}

export interface FormPreviewUnpriced {
  rowKey: string;
  roomName?: string;
  reason: string;
}

export interface FormPreviewResponseData {
  lines: FormPreviewLine[];
  unpriced: FormPreviewUnpriced[];
  productsBezDph: number;
  montaz: {
    bezDph: number;
    source: "tier" | "fallback" | "override";
    tierOrdinal?: number;
  };
  ovtSlevaBezDph: number;
  mngSlevaActive: boolean;
  mngSlevaBezDph: number;
  bulkSlevaPercent: number;
  vatRatePercent: number;
  vatAmount: number;
  totalBezDph: number;
  totalSDph: number;
  defaultsSnapshot: {
    fromOfficePortal: boolean;
    montazFallbackBezDph: number;
    tierCount: number;
  };
}

export interface FormPreviewApiResult {
  success: boolean;
  data?: FormPreviewResponseData;
  error?: string;
}

export interface AdmfDefaultsApiResult {
  success: boolean;
  data?: AdmfDefaults;
  error?: string;
}

export async function getAdmfDefaults(): Promise<AdmfDefaultsApiResult> {
  try {
    const res = await fetch("/api/forms/admf-defaults");
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data as AdmfDefaults };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function getFormPricePreview(args: {
  formJson: Record<string, unknown>;
  parameters: FormPreviewParameters;
}): Promise<FormPreviewApiResult> {
  try {
    const res = await fetch("/api/forms/price-preview-form", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error ?? `HTTP ${res.status}` };
    return { success: true, data: json.data as FormPreviewResponseData };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
