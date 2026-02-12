/**
 * Types for pricing export from calculation backend
 * GET /api/admin/categories/:id/pricing-export
 */

/** Dimension interval (mm) - may be nested or flat in API response */
export interface DimensionInterval {
  width_min: number;
  width_max: number;
  height_min: number;
  height_max: number;
}

/** Category in pricing export; dimension limits may be nested or flat keys */
export interface PricingExportCategory {
  id: string;
  name: string;
  code: string;
  obchodni_sleva: number | null;
  vat_rate: number | null;
  /** Nested form from API */
  mezni_rozmer_bez_zaruky?: DimensionInterval;
  vyrobni_mezni_rozmer?: DimensionInterval;
  /** Flat form (e.g. mezni_rozmer_bez_zaruky_width_min) */
  [key: string]: unknown;
}

export interface PricingExportData {
  exported_at: string;
  category: PricingExportCategory;
  company_surcharges: unknown[];
  surcharges: unknown[];
  optional_surcharges: unknown[];
  calculation_flow: string;
}

export interface PricingExportResponse {
  success: boolean;
  data?: PricingExportData;
  error?: string;
  message?: string;
}

/**
 * Normalize category from API (nested or flat dimension keys) to a single shape
 * for dimension checks.
 */
export function getDimensionLimits(category: PricingExportCategory): {
  mezni_rozmer_bez_zaruky: DimensionInterval;
  vyrobni_mezni_rozmer: DimensionInterval;
} | null {
  const defaultInterval: DimensionInterval = {
    width_min: 0,
    width_max: 9999,
    height_min: 0,
    height_max: 9999,
  };

  const toNum = (v: unknown): number => {
    if (v == null || v === "") return NaN;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isNaN(n) ? NaN : n;
  };

  // Nested
  let mezni = category.mezni_rozmer_bez_zaruky;
  let vyrobni = category.vyrobni_mezni_rozmer;

  // Flat keys (e.g. from DB export)
  if (!mezni && typeof category["mezni_rozmer_bez_zaruky_width_min"] !== "undefined") {
    mezni = {
      width_min: toNum(category["mezni_rozmer_bez_zaruky_width_min"]) || 0,
      width_max: toNum(category["mezni_rozmer_bez_zaruky_width_max"]) ?? 9999,
      height_min: toNum(category["mezni_rozmer_bez_zaruky_height_min"]) || 0,
      height_max: toNum(category["mezni_rozmer_bez_zaruky_height_max"]) ?? 9999,
    };
  }
  if (!vyrobni && typeof category["vyrobni_mezni_rozmer_width_min"] !== "undefined") {
    vyrobni = {
      width_min: toNum(category["vyrobni_mezni_rozmer_width_min"]) || 0,
      width_max: toNum(category["vyrobni_mezni_rozmer_width_max"]) ?? 9999,
      height_min: toNum(category["vyrobni_mezni_rozmer_height_min"]) || 0,
      height_max: toNum(category["vyrobni_mezni_rozmer_height_max"]) ?? 9999,
    };
  }

  return {
    mezni_rozmer_bez_zaruky: mezni ?? defaultInterval,
    vyrobni_mezni_rozmer: vyrobni ?? defaultInterval,
  };
}

/**
 * Check if (widthMm, heightMm) is inside the given interval (inclusive).
 */
export function isInsideInterval(
  widthMm: number,
  heightMm: number,
  interval: DimensionInterval
): boolean {
  return (
    widthMm >= interval.width_min &&
    widthMm <= interval.width_max &&
    heightMm >= interval.height_min &&
    heightMm <= interval.height_max
  );
}

export type DimensionStatus = "green" | "yellow" | "red" | null;

/**
 * Compute row dimension status for real-time feedback.
 * - green: inside both intervals
 * - yellow: outside mezni_rozmer_bez_zaruky (without guarantee)
 * - red: outside vyrobni_mezni_rozmer (cannot be produced)
 * - null: no pricing data or invalid width/height
 */
export function getDimensionStatus(
  widthStr: string,
  heightStr: string,
  category: PricingExportCategory | null
): DimensionStatus {
  if (!category) return null;
  const limits = getDimensionLimits(category);
  if (!limits) return null;

  const width = parseFloat(widthStr);
  const height = parseFloat(heightStr);
  if (Number.isNaN(width) || Number.isNaN(height)) return null;

  const { mezni_rozmer_bez_zaruky, vyrobni_mezni_rozmer } = limits;

  if (!isInsideInterval(width, height, vyrobni_mezni_rozmer)) {
    return "red"; // outside production limits
  }
  if (!isInsideInterval(width, height, mezni_rozmer_bez_zaruky)) {
    return "yellow"; // outside guarantee limits
  }
  return "green";
}
