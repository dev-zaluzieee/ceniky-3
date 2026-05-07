/**
 * In-process cached read of office-managed ADMF defaults + montáž tiers.
 *
 * Office staff edit these rarely; refetching every form-preview request would
 * be wasteful. We cache for 60 s. After commits on the office side it can take
 * up to a minute for the OVT preview to see the new values — acceptable given
 * the use case.
 *
 * Fallbacks (when the singleton row or the tiers table can't be read for any
 * reason) match the legacy pre-defaults behaviour: 12 % VAT, 1339 Kč montáž,
 * no slevy. So even a fresh database with no data behaves correctly.
 */

import type { Pool } from "pg";
import {
  fetchDefaults,
  fetchMontazTiers,
  type AdmfDefaultsRowDb,
  type MontazTierRowDb,
} from "../queries/admf-defaults.queries";

const LEGACY_FALLBACK_MONTAZ = 1339;
const LEGACY_FALLBACK_VAT_PERCENT = 12;
const TTL_MS = 60_000;

export interface MontazTier {
  id: string;
  ordinal: number;
  minProductsBezDph: number;
  maxProductsBezDph: number | null;
  montazBezDph: number;
  note: string | null;
}

export interface AdmfDefaults {
  vatRateDefaultPercent: number;
  ovtSlevaDefaultBezDph: number;
  mngSlevaDefaultActive: boolean;
  mngSlevaDefaultBezDph: number;
  montazFallbackBezDph: number;
  bulkSlevaDefaultPercent: number;
  montazTiers: MontazTier[];
  /** Whether the singleton row was actually present; if false, all defaults are legacy fallbacks. */
  fromOfficePortal: boolean;
}

interface CachedDefaults {
  value: AdmfDefaults;
  fetchedAt: number;
}

let cache: CachedDefaults | null = null;

function legacyDefaults(): AdmfDefaults {
  return {
    vatRateDefaultPercent: LEGACY_FALLBACK_VAT_PERCENT,
    ovtSlevaDefaultBezDph: 0,
    mngSlevaDefaultActive: false,
    mngSlevaDefaultBezDph: 0,
    montazFallbackBezDph: LEGACY_FALLBACK_MONTAZ,
    bulkSlevaDefaultPercent: 0,
    montazTiers: [],
    fromOfficePortal: false,
  };
}

function fromDb(row: AdmfDefaultsRowDb, tierRows: MontazTierRowDb[]): AdmfDefaults {
  return {
    vatRateDefaultPercent: Number(row.vat_rate_default_percent),
    ovtSlevaDefaultBezDph: row.ovt_sleva_default_bez_dph,
    mngSlevaDefaultActive: row.mng_sleva_default_active,
    mngSlevaDefaultBezDph: row.mng_sleva_default_bez_dph,
    montazFallbackBezDph: row.montaz_fallback_bez_dph,
    bulkSlevaDefaultPercent: row.bulk_sleva_default_percent,
    montazTiers: tierRows.map((t) => ({
      id: t.id,
      ordinal: t.ordinal,
      minProductsBezDph: Number(t.min_products_bez_dph),
      maxProductsBezDph: t.max_products_bez_dph == null ? null : Number(t.max_products_bez_dph),
      montazBezDph: t.montaz_bez_dph,
      note: t.note,
    })),
    fromOfficePortal: true,
  };
}

export async function getAdmfDefaults(pool: Pool): Promise<AdmfDefaults> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) return cache.value;

  try {
    const [defaultsRow, tierRows] = await Promise.all([fetchDefaults(pool), fetchMontazTiers(pool)]);
    const value = defaultsRow ? fromDb(defaultsRow, tierRows) : legacyDefaults();
    cache = { value, fetchedAt: now };
    return value;
  } catch (e) {
    // The tables might not exist yet (migration not applied) — fall back to legacy
    // and log once. Don't throw; price preview shouldn't be blocked by an admin
    // configuration miss.
    console.warn("[admf-defaults] failed to read from DB, using legacy fallback:", e instanceof Error ? e.message : e);
    const value = legacyDefaults();
    cache = { value, fetchedAt: now };
    return value;
  }
}

/** Drop the cache — for tests / explicit invalidation if ever needed. */
export function invalidateAdmfDefaultsCache(): void {
  cache = null;
}

/**
 * Resolve the montáž value for a given products subtotal (bez DPH). If a tier
 * matches, returns its value with `source = 'tier'`; otherwise the fallback
 * with `source = 'fallback'`.
 *
 * Tier picking: lowest `ordinal` among tiers where `min ≤ x AND (max IS NULL OR x < max)`.
 */
export function resolveMontaz(
  defaults: AdmfDefaults,
  productsBezDph: number
): { bezDph: number; source: "tier" | "fallback"; tierId?: string; tierOrdinal?: number } {
  const x = Number.isFinite(productsBezDph) && productsBezDph >= 0 ? productsBezDph : 0;
  const matches = defaults.montazTiers.filter(
    (t) => t.minProductsBezDph <= x && (t.maxProductsBezDph == null || x < t.maxProductsBezDph)
  );
  if (matches.length === 0) {
    return { bezDph: defaults.montazFallbackBezDph, source: "fallback" };
  }
  const winner = matches.reduce((a, b) => (a.ordinal <= b.ordinal ? a : b));
  return {
    bezDph: winner.montazBezDph,
    source: "tier",
    tierId: winner.id,
    tierOrdinal: winner.ordinal,
  };
}
