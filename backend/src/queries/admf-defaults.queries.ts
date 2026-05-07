/**
 * Read office-managed ADMF defaults.
 *
 * Tables `office_admf_defaults` and `office_admf_montaz_tiers` live in the main
 * Ceniky DB (the same one this app's `getPool()` is connected to). Office writes
 * via ceniky-2 admin; OVT only reads.
 */

import type { Pool } from "pg";

export interface AdmfDefaultsRowDb {
  vat_rate_default_percent: string;
  ovt_sleva_default_bez_dph: number;
  mng_sleva_default_active: boolean;
  mng_sleva_default_bez_dph: number;
  montaz_fallback_bez_dph: number;
  bulk_sleva_default_percent: number;
  updated_at: Date;
  updated_by: string | null;
}

export interface MontazTierRowDb {
  id: string;
  ordinal: number;
  min_products_bez_dph: string;
  max_products_bez_dph: string | null;
  montaz_bez_dph: number;
  note: string | null;
}

export async function fetchDefaults(pool: Pool): Promise<AdmfDefaultsRowDb | null> {
  const { rows } = await pool.query<AdmfDefaultsRowDb>(
    `SELECT vat_rate_default_percent, ovt_sleva_default_bez_dph, mng_sleva_default_active,
            mng_sleva_default_bez_dph, montaz_fallback_bez_dph, bulk_sleva_default_percent,
            updated_at, updated_by
       FROM office_admf_defaults
      WHERE id = 1`
  );
  return rows[0] ?? null;
}

export async function fetchMontazTiers(pool: Pool): Promise<MontazTierRowDb[]> {
  const { rows } = await pool.query<MontazTierRowDb>(
    `SELECT id, ordinal, min_products_bez_dph, max_products_bez_dph, montaz_bez_dph, note
       FROM office_admf_montaz_tiers
      ORDER BY ordinal, min_products_bez_dph`
  );
  return rows;
}
