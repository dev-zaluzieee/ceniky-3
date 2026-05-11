/**
 * Admin change-sets service. Backs POST/GET/DELETE /api/admin/change-sets/*.
 *
 * A change-set is a named bundle of pricing edits that can be:
 *   - assembled (by adding entries)
 *   - validated as a unit (runs Phase 3 impact-diff + Phase 4 breakage-check
 *     against the live state with all entries merged on top)
 *   - published atomically (all entries applied in a single transaction)
 *   - or discarded
 *
 * v1 scope:
 *   - Single DB (pricing). Cross-DB publish (admin DB / form-structure
 *     entries) deferred to v1.1.
 *   - Entity kinds: `product_pricing` (update only) and `pricing_variant`
 *     (create + update).
 *   - No conflict detection (`base_updated_at` recorded but not enforced).
 *
 * Override conversion:
 *   `entriesToOverridesForProduct(entries, productPricingId)` translates a
 *   change-set's entries into the same `CalculatePriceOverrides` shape that
 *   Phases 1-4 already accept. This is the single bridge that lets every
 *   existing validation tool see "the world as it would be after publish".
 */

import type { Pool, PoolClient } from "pg";
import {
  runImpactDiff,
  type ImpactDiffResponse,
} from "./admin-impact-diff.service";
import {
  runBreakageCheck,
  type BreakageCheckResponse,
} from "./admin-breakage-check.service";
import type { CalculatePriceOverrides } from "./admin-pricing-preview.service";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ChangeSetStatus = "draft" | "published" | "discarded";
export type EntityKind = "product_pricing" | "pricing_variant";
export type EntryAction = "create" | "update";

export interface ChangeSetRecord {
  id: string;
  name: string;
  description: string | null;
  status: ChangeSetStatus;
  created_by: string;
  created_at: string;
  published_at: string | null;
  publish_error: string | null;
}

export interface ChangeSetEntryRecord {
  id: string;
  change_set_id: string;
  entity_kind: EntityKind;
  entity_id: string | null;
  action: EntryAction;
  draft_payload: Record<string, unknown>;
  base_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeSetWithEntries extends ChangeSetRecord {
  entries: ChangeSetEntryRecord[];
}

// ---------------------------------------------------------------------------
// Row → record mappers
// ---------------------------------------------------------------------------

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function rowToChangeSet(r: Record<string, unknown>): ChangeSetRecord {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    description: (r.description as string | null) ?? null,
    status: (r.status as ChangeSetStatus) ?? "draft",
    created_by: String(r.created_by ?? ""),
    created_at: toIso(r.created_at),
    published_at: r.published_at ? toIso(r.published_at) : null,
    publish_error: (r.publish_error as string | null) ?? null,
  };
}

function rowToEntry(r: Record<string, unknown>): ChangeSetEntryRecord {
  return {
    id: String(r.id),
    change_set_id: String(r.change_set_id),
    entity_kind: r.entity_kind as EntityKind,
    entity_id: (r.entity_id as string | null) ?? null,
    action: r.action as EntryAction,
    draft_payload:
      r.draft_payload && typeof r.draft_payload === "object"
        ? (r.draft_payload as Record<string, unknown>)
        : {},
    base_updated_at: r.base_updated_at ? toIso(r.base_updated_at) : null,
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listChangeSets(
  pricingPool: Pool,
  filters?: { status?: ChangeSetStatus }
): Promise<ChangeSetRecord[]> {
  const params: unknown[] = [];
  let where = "";
  if (filters?.status) {
    params.push(filters.status);
    where = `WHERE status = $${params.length}`;
  }
  const { rows } = await pricingPool.query(
    `SELECT id, name, description, status, created_by, created_at, published_at, publish_error
     FROM change_set
     ${where}
     ORDER BY created_at DESC
     LIMIT 200`,
    params
  );
  return rows.map(rowToChangeSet);
}

export async function getChangeSetWithEntries(
  pricingPool: Pool,
  id: string
): Promise<ChangeSetWithEntries | null> {
  const setRes = await pricingPool.query(
    `SELECT id, name, description, status, created_by, created_at, published_at, publish_error
     FROM change_set WHERE id = $1`,
    [id]
  );
  if (setRes.rows.length === 0) return null;
  const cs = rowToChangeSet(setRes.rows[0]);

  const entriesRes = await pricingPool.query(
    `SELECT id, change_set_id, entity_kind, entity_id, action, draft_payload, base_updated_at, created_at, updated_at
     FROM change_set_entry
     WHERE change_set_id = $1
     ORDER BY created_at ASC`,
    [id]
  );
  return { ...cs, entries: entriesRes.rows.map(rowToEntry) };
}

export async function createChangeSet(
  pricingPool: Pool,
  input: { name: string; description?: string | null; created_by: string }
): Promise<ChangeSetRecord> {
  const { rows } = await pricingPool.query(
    `INSERT INTO change_set (name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, name, description, status, created_by, created_at, published_at, publish_error`,
    [input.name.trim(), input.description?.trim() || null, input.created_by]
  );
  return rowToChangeSet(rows[0]);
}

export async function discardChangeSet(
  pricingPool: Pool,
  id: string
): Promise<boolean> {
  const result = await pricingPool.query(
    `UPDATE change_set SET status = 'discarded' WHERE id = $1 AND status = 'draft'`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function addEntry(
  pricingPool: Pool,
  changeSetId: string,
  input: {
    entity_kind: EntityKind;
    entity_id: string | null;
    action: EntryAction;
    draft_payload: Record<string, unknown>;
    base_updated_at?: string | null;
  }
): Promise<ChangeSetEntryRecord> {
  // Sanity: change-set must be a draft
  const setRes = await pricingPool.query(
    `SELECT status FROM change_set WHERE id = $1`,
    [changeSetId]
  );
  if (setRes.rows.length === 0) {
    throw Object.assign(new Error(`Change-set not found: ${changeSetId}`), {
      code: "NOT_FOUND",
    });
  }
  if (setRes.rows[0].status !== "draft") {
    throw Object.assign(new Error(`Cannot add entries to a ${setRes.rows[0].status} change-set`), {
      code: "BAD_STATUS",
    });
  }

  if (input.action === "update" && !input.entity_id) {
    throw Object.assign(new Error("entity_id is required for update entries"), {
      code: "BAD_INPUT",
    });
  }
  if (input.action === "create" && input.entity_kind === "product_pricing") {
    throw Object.assign(
      new Error("Creating product_pricing rows via change-sets is not supported in v1"),
      { code: "BAD_INPUT" }
    );
  }

  const { rows } = await pricingPool.query(
    `INSERT INTO change_set_entry
       (change_set_id, entity_kind, entity_id, action, draft_payload, base_updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id, change_set_id, entity_kind, entity_id, action, draft_payload, base_updated_at, created_at, updated_at`,
    [
      changeSetId,
      input.entity_kind,
      input.entity_id,
      input.action,
      JSON.stringify(input.draft_payload),
      input.base_updated_at ?? null,
    ]
  );
  return rowToEntry(rows[0]);
}

export async function deleteEntry(
  pricingPool: Pool,
  entryId: string
): Promise<boolean> {
  const result = await pricingPool.query(
    `DELETE FROM change_set_entry WHERE id = $1`,
    [entryId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Queue-by-code (UX shortcut for the validation-products → pricing hand-off)
// ---------------------------------------------------------------------------

/**
 * Queue one entry per `product_pricing` row matching the given product_code.
 * Used by validation-products' "Uložit do sady (pricing)" button so the admin
 * doesn't have to manually paste the validated_payload into the pricing app.
 *
 * The same product_code can map to multiple manufacturers (UNIQUE is on
 * `(manufacturer, product_code)`); all matching rows get the same payload
 * update, since the validated_payload is product-code-scoped, not
 * manufacturer-scoped.
 *
 * Inserts are wrapped in one transaction so admin sees either all-or-nothing.
 */
export async function queuePayloadByCode(
  pricingPool: Pool,
  changeSetId: string,
  productCode: string,
  payload: Record<string, unknown>
): Promise<{ entries: ChangeSetEntryRecord[]; matched_pricing_ids: string[] }> {
  const setRes = await pricingPool.query(
    `SELECT status FROM change_set WHERE id = $1`,
    [changeSetId]
  );
  if (setRes.rows.length === 0) {
    throw Object.assign(new Error(`Change-set not found: ${changeSetId}`), {
      code: "NOT_FOUND",
    });
  }
  if (setRes.rows[0].status !== "draft") {
    throw Object.assign(
      new Error(`Cannot add entries to a ${setRes.rows[0].status} change-set`),
      { code: "BAD_STATUS" }
    );
  }

  const lookup = await pricingPool.query(
    `SELECT id, updated_at FROM product_pricing WHERE product_code = $1`,
    [productCode]
  );
  if (lookup.rows.length === 0) {
    throw Object.assign(
      new Error(
        `No product_pricing rows for product_code "${productCode}". Create the pricing record first in the pricing app.`
      ),
      { code: "NO_MATCHES" }
    );
  }
  const matchedIds = lookup.rows.map((r) => String(r.id));

  // Carry the latest payload onto every matching row's product_pricing entry.
  // Surcharges and price_affecting_enums are NOT touched — those are
  // pricing-side authoring concerns and shouldn't be reset by a payload-only
  // hand-off from validation-products.
  const draftPayload: Record<string, unknown> = { payload };

  const client = await pricingPool.connect();
  const inserted: ChangeSetEntryRecord[] = [];
  try {
    await client.query("BEGIN");
    for (const row of lookup.rows) {
      const ins = await client.query(
        `INSERT INTO change_set_entry
           (change_set_id, entity_kind, entity_id, action, draft_payload, base_updated_at)
         VALUES ($1, 'product_pricing', $2, 'update', $3::jsonb, $4)
         RETURNING id, change_set_id, entity_kind, entity_id, action, draft_payload, base_updated_at, created_at, updated_at`,
        [
          changeSetId,
          String(row.id),
          JSON.stringify(draftPayload),
          row.updated_at ?? null,
        ]
      );
      inserted.push(rowToEntry(ins.rows[0]));
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  return { entries: inserted, matched_pricing_ids: matchedIds };
}

// ---------------------------------------------------------------------------
// Override conversion — the bridge to Phases 1-4
// ---------------------------------------------------------------------------

interface ProductPricingDraft {
  payload?: Record<string, unknown>;
  price_affecting_enums?: string[];
  surcharges?: Record<string, unknown> | null;
}

interface PricingVariantDraft {
  product_pricing_id?: string;
  /** Required on create; optional on update (omit = keep existing). */
  selector?: Record<string, string[]>;
  dimension_pricing?: { prices?: Record<string, number> } | null;
  surcharge_only?: boolean;
  /** Optional human-readable name (e.g. "25 mm — Classic"). */
  name?: string | null;
}

/**
 * Build a `CalculatePriceOverrides` payload from a change-set's entries,
 * filtered to the entries that affect the given product_pricing_id.
 */
export function entriesToOverridesForProduct(
  entries: ChangeSetEntryRecord[],
  productPricingId: string
): CalculatePriceOverrides {
  const overrides: CalculatePriceOverrides = {};

  // product_pricing override (at most one per product)
  const productEntry = entries.find(
    (e) => e.entity_kind === "product_pricing" && e.entity_id === productPricingId
  );
  if (productEntry) {
    const draft = productEntry.draft_payload as ProductPricingDraft;
    overrides.product_pricing = {
      payload: draft.payload,
      price_affecting_enums: draft.price_affecting_enums,
      surcharges: draft.surcharges,
    };
  }

  // pricing_variant overrides (any number)
  const variantEntries = entries.filter((e) => {
    if (e.entity_kind !== "pricing_variant") return false;
    const draft = e.draft_payload as PricingVariantDraft;
    if (e.action === "update") return e.entity_id !== null;
    if (e.action === "create") return draft.product_pricing_id === productPricingId;
    return false;
  });
  if (variantEntries.length > 0) {
    const usable: NonNullable<CalculatePriceOverrides["pricing_variants"]> = [];
    for (const e of variantEntries) {
      const draft = e.draft_payload as PricingVariantDraft;
      // selector is required for the override array — by convention, drafts
      // capture the full post-change state. Skip entries that lack it (the
      // live variant remains in effect).
      if (!draft.selector) continue;
      usable.push({
        id: e.action === "update" ? (e.entity_id ?? undefined) : undefined,
        selector: draft.selector,
        dimension_pricing: draft.dimension_pricing,
        surcharge_only: draft.surcharge_only === true,
      });
    }
    if (usable.length > 0) overrides.pricing_variants = usable;
  }

  return overrides;
}

/** Distinct product_pricing_ids touched by the change-set (for fan-out validation). */
export function productPricingIdsFromEntries(entries: ChangeSetEntryRecord[]): string[] {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.entity_kind === "product_pricing" && e.entity_id) {
      out.add(e.entity_id);
    } else if (e.entity_kind === "pricing_variant") {
      const draft = e.draft_payload as PricingVariantDraft;
      if (draft.product_pricing_id) {
        out.add(draft.product_pricing_id);
      }
    }
  }
  return Array.from(out);
}

// ---------------------------------------------------------------------------
// Validate (aggregate Phase 3 + Phase 4 across all touched products)
// ---------------------------------------------------------------------------

export interface ChangeSetValidationReport {
  per_product: Array<{
    product_pricing_id: string;
    product_code: string | null;
    impact: ImpactDiffResponse | null;
    impact_error?: string;
    breakage: BreakageCheckResponse | null;
    breakage_error?: string;
  }>;
  summary: {
    products_touched: number;
    forms_with_price_change: number;
    total_price_delta_kc: number;
    forms_with_breakage: number;
    total_breakage_failures: number;
  };
}

/** Look up product_code per product_pricing_id (one round trip, batched). */
async function fetchProductCodes(
  pricingPool: Pool,
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { rows } = await pricingPool.query(
    `SELECT id, product_code FROM product_pricing WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return new Map(rows.map((r) => [String(r.id), String(r.product_code)]));
}

export async function validateChangeSet(
  mainPool: Pool,
  pricingPool: Pool,
  changeSetId: string
): Promise<ChangeSetValidationReport> {
  const cs = await getChangeSetWithEntries(pricingPool, changeSetId);
  if (!cs) {
    throw Object.assign(new Error(`Change-set not found: ${changeSetId}`), {
      code: "NOT_FOUND",
    });
  }

  const ids = productPricingIdsFromEntries(cs.entries);
  const codeByPid = await fetchProductCodes(pricingPool, ids);

  const perProduct: ChangeSetValidationReport["per_product"] = [];
  let formsWithPriceChange = 0;
  let totalPriceDelta = 0;
  let formsWithBreakage = 0;
  let totalBreakageFailures = 0;

  for (const pid of ids) {
    const overrides = entriesToOverridesForProduct(cs.entries, pid);
    const productCode = codeByPid.get(pid) ?? null;

    let impact: ImpactDiffResponse | null = null;
    let impactErr: string | undefined;
    try {
      impact = await runImpactDiff(mainPool, pricingPool, {
        product_pricing_id: pid,
        overrides,
      });
      formsWithPriceChange += impact.summary.affected_form_count;
      totalPriceDelta += impact.summary.total_delta_kc;
    } catch (e) {
      impactErr = e instanceof Error ? e.message : "impact-diff failed";
    }

    let breakage: BreakageCheckResponse | null = null;
    let breakageErr: string | undefined;
    if (productCode) {
      // Build proposed payload for breakage check from the override
      const productEntry = cs.entries.find(
        (e) => e.entity_kind === "product_pricing" && e.entity_id === pid
      );
      const draft = productEntry?.draft_payload as ProductPricingDraft | undefined;
      const proposedPayload = (draft?.payload as Record<string, unknown> | undefined) ?? {};
      // Only run breakage check when the change-set actually edits the payload —
      // otherwise we'd be checking the live payload against itself, which is noise.
      if (productEntry && draft?.payload) {
        try {
          breakage = await runBreakageCheck(mainPool, pricingPool, {
            product_code: productCode,
            proposed_payload: {
              product_code: productCode,
              ...proposedPayload,
            },
          });
          formsWithBreakage += breakage.summary.affected_form_count;
          totalBreakageFailures += breakage.summary.total_failures;
        } catch (e) {
          breakageErr = e instanceof Error ? e.message : "breakage-check failed";
        }
      }
    }

    perProduct.push({
      product_pricing_id: pid,
      product_code: productCode,
      impact,
      ...(impactErr && { impact_error: impactErr }),
      breakage,
      ...(breakageErr && { breakage_error: breakageErr }),
    });
  }

  return {
    per_product: perProduct,
    summary: {
      products_touched: ids.length,
      forms_with_price_change: formsWithPriceChange,
      total_price_delta_kc: totalPriceDelta,
      forms_with_breakage: formsWithBreakage,
      total_breakage_failures: totalBreakageFailures,
    },
  };
}

// ---------------------------------------------------------------------------
// Publish (transactional)
// ---------------------------------------------------------------------------

async function applyEntry(
  client: PoolClient,
  entry: ChangeSetEntryRecord
): Promise<void> {
  if (entry.entity_kind === "product_pricing") {
    if (entry.action !== "update" || !entry.entity_id) {
      throw new Error(`Invalid product_pricing entry (id=${entry.id})`);
    }
    const draft = entry.draft_payload as ProductPricingDraft;
    // Only update fields that are present in the draft payload — partial update.
    const sets: string[] = [];
    const params: unknown[] = [];
    if (draft.payload !== undefined) {
      params.push(JSON.stringify(draft.payload));
      sets.push(`payload = $${params.length}::jsonb`);
    }
    if (draft.price_affecting_enums !== undefined) {
      params.push(JSON.stringify(draft.price_affecting_enums));
      sets.push(`price_affecting_enums = $${params.length}::jsonb`);
    }
    if (draft.surcharges !== undefined) {
      if (draft.surcharges === null) {
        sets.push(`surcharges = NULL`);
      } else {
        params.push(JSON.stringify(draft.surcharges));
        sets.push(`surcharges = $${params.length}::jsonb`);
      }
    }
    if (sets.length === 0) return; // nothing to apply
    sets.push(`updated_at = timezone('utc', now())`);
    params.push(entry.entity_id);
    await client.query(
      `UPDATE product_pricing SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params
    );
    return;
  }

  if (entry.entity_kind === "pricing_variant") {
    const draft = entry.draft_payload as PricingVariantDraft;
    if (entry.action === "create") {
      if (!draft.product_pricing_id) {
        throw new Error(`pricing_variant create entry missing product_pricing_id (id=${entry.id})`);
      }
      const ins = await client.query(
        `INSERT INTO pricing_variant
           (product_pricing_id, name, selector, dimension_pricing, surcharge_only)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
         RETURNING id`,
        [
          draft.product_pricing_id,
          draft.name ?? null,
          JSON.stringify(draft.selector ?? {}),
          draft.dimension_pricing == null ? null : JSON.stringify(draft.dimension_pricing),
          draft.surcharge_only === true,
        ]
      );
      const newId = String(ins.rows[0].id);
      await client.query(
        `UPDATE change_set_entry SET entity_id = $1, updated_at = timezone('utc', now())
         WHERE id = $2`,
        [newId, entry.id]
      );
      return;
    }

    if (entry.action === "update") {
      if (!entry.entity_id) {
        throw new Error(`pricing_variant update entry missing entity_id (id=${entry.id})`);
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      if (draft.name !== undefined) {
        params.push(draft.name);
        sets.push(`name = $${params.length}`);
      }
      if (draft.selector !== undefined) {
        params.push(JSON.stringify(draft.selector));
        sets.push(`selector = $${params.length}::jsonb`);
      }
      if (draft.dimension_pricing !== undefined) {
        if (draft.dimension_pricing === null) {
          sets.push(`dimension_pricing = NULL`);
        } else {
          params.push(JSON.stringify(draft.dimension_pricing));
          sets.push(`dimension_pricing = $${params.length}::jsonb`);
        }
      }
      if (draft.surcharge_only !== undefined) {
        params.push(draft.surcharge_only === true);
        sets.push(`surcharge_only = $${params.length}`);
      }
      if (sets.length === 0) return;
      sets.push(`updated_at = timezone('utc', now())`);
      params.push(entry.entity_id);
      await client.query(
        `UPDATE pricing_variant SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params
      );
      return;
    }
  }

  throw new Error(`Unsupported entry: kind=${entry.entity_kind} action=${entry.action}`);
}

/**
 * Publish a change-set: apply all entries inside one pricing-DB transaction.
 * On any failure: rollback, mark the change-set with publish_error, leave it
 * in 'draft' status so admin can fix and retry.
 */
export async function publishChangeSet(
  pricingPool: Pool,
  changeSetId: string
): Promise<{ ok: true; published_at: string } | { ok: false; error: string }> {
  const cs = await getChangeSetWithEntries(pricingPool, changeSetId);
  if (!cs) {
    return { ok: false, error: `Change-set not found: ${changeSetId}` };
  }
  if (cs.status !== "draft") {
    return { ok: false, error: `Change-set is ${cs.status}, cannot publish` };
  }
  if (cs.entries.length === 0) {
    return { ok: false, error: "Change-set has no entries" };
  }

  const client = await pricingPool.connect();
  try {
    await client.query("BEGIN");
    for (const entry of cs.entries) {
      await applyEntry(client, entry);
    }
    const pubRes = await client.query(
      `UPDATE change_set
       SET status = 'published',
           published_at = timezone('utc', now()),
           publish_error = NULL
       WHERE id = $1
       RETURNING published_at`,
      [changeSetId]
    );
    await client.query("COMMIT");
    return { ok: true, published_at: toIso(pubRes.rows[0].published_at) };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const message = e instanceof Error ? e.message : String(e);
    // Record the failure on the change-set so admin can see it.
    await pricingPool
      .query(`UPDATE change_set SET publish_error = $2 WHERE id = $1`, [
        changeSetId,
        message.slice(0, 1000),
      ])
      .catch(() => {});
    return { ok: false, error: message };
  } finally {
    client.release();
  }
}
