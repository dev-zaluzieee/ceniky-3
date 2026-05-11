/**
 * Admin change-set routes. Mounted at /api/admin/change-sets/* in index.ts.
 * All routes require the admin token.
 *
 * Endpoint shape (kept REST-ish but pragmatic):
 *   GET    /                  → list
 *   POST   /                  → create
 *   GET    /:id               → fetch with entries
 *   DELETE /:id               → discard (sets status='discarded')
 *   POST   /:id/entries       → add entry
 *   DELETE /:id/entries/:entryId → remove entry
 *   POST   /:id/validate      → run aggregate Phase 3+4 validation
 *   POST   /:id/publish       → atomic publish
 */

import { Router, Request, Response } from "express";
import { getPool, getPricingPool } from "../../config/database";
import { requireAdminToken } from "../../middleware/admin-token.middleware";
import {
  listChangeSets,
  getChangeSetWithEntries,
  createChangeSet,
  discardChangeSet,
  addEntry,
  deleteEntry,
  validateChangeSet,
  publishChangeSet,
  queuePayloadByCode,
  type ChangeSetStatus,
} from "../../services/admin-change-sets.service";

const router = Router();
router.use(requireAdminToken);

/** Pick a single string from a path param (Express types it as string|string[]). */
function paramStr(v: unknown): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return typeof v === "string" ? v : "";
}

// --- list / create ------------------------------------------------------

router.get("/", async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string | undefined)?.trim();
    const allowedStatus: ChangeSetStatus[] = ["draft", "published", "discarded"];
    const filter =
      status && (allowedStatus as string[]).includes(status)
        ? { status: status as ChangeSetStatus }
        : undefined;
    const items = await listChangeSets(getPricingPool(), filter);
    res.json({ success: true, data: { items } });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "list failed",
    });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as { name?: string; description?: string; created_by?: string };
    if (!body?.name || !body.name.trim()) {
      return res.status(400).json({ success: false, error: "name is required" });
    }
    const created = await createChangeSet(getPricingPool(), {
      name: body.name,
      description: body.description ?? null,
      // The admin app will pass the user identity it tracks; for v1 we accept
      // it from the body. Future: derive from a real auth token.
      created_by: body.created_by?.trim() || "admin",
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "create failed",
    });
  }
});

// --- get / discard ------------------------------------------------------

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const cs = await getChangeSetWithEntries(getPricingPool(), paramStr(req.params.id));
    if (!cs) return res.status(404).json({ success: false, error: "not found" });
    res.json({ success: true, data: cs });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "fetch failed",
    });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const ok = await discardChangeSet(getPricingPool(), paramStr(req.params.id));
    if (!ok)
      return res.status(409).json({
        success: false,
        error: "cannot discard (not found or already published)",
      });
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "discard failed",
    });
  }
});

// --- entries -----------------------------------------------------------

router.post("/:id/entries", async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      entity_kind?: string;
      entity_id?: string | null;
      action?: string;
      draft_payload?: Record<string, unknown>;
      base_updated_at?: string | null;
    };
    if (
      body.entity_kind !== "product_pricing" &&
      body.entity_kind !== "pricing_variant"
    ) {
      return res
        .status(400)
        .json({ success: false, error: "entity_kind must be product_pricing or pricing_variant" });
    }
    if (body.action !== "create" && body.action !== "update") {
      return res
        .status(400)
        .json({ success: false, error: "action must be create or update" });
    }
    if (!body.draft_payload || typeof body.draft_payload !== "object") {
      return res
        .status(400)
        .json({ success: false, error: "draft_payload (object) is required" });
    }
    const entry = await addEntry(getPricingPool(), paramStr(req.params.id), {
      entity_kind: body.entity_kind,
      entity_id: body.entity_id ?? null,
      action: body.action,
      draft_payload: body.draft_payload,
      base_updated_at: body.base_updated_at ?? null,
    });
    res.status(201).json({ success: true, data: entry });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    if (code === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: err instanceof Error ? err.message : "not found",
      });
    }
    if (code === "BAD_INPUT" || code === "BAD_STATUS") {
      return res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : "bad input",
      });
    }
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "add entry failed",
    });
  }
});

/**
 * POST /:id/queue-payload-by-code
 * Body: { product_code: string, payload: object }
 *
 * Used by validation-products' "Uložit do sady (pricing)" button so the
 * admin doesn't have to manually paste the validated_payload into the pricing
 * app. Resolves all product_pricing rows with the given product_code and
 * adds one update entry per row in a single transaction.
 */
router.post("/:id/queue-payload-by-code", async (req: Request, res: Response) => {
  try {
    const body = req.body as { product_code?: string; payload?: Record<string, unknown> };
    if (typeof body?.product_code !== "string" || !body.product_code.trim()) {
      return res.status(400).json({ success: false, error: "product_code is required" });
    }
    if (!body.payload || typeof body.payload !== "object") {
      return res.status(400).json({ success: false, error: "payload (object) is required" });
    }
    const result = await queuePayloadByCode(
      getPricingPool(),
      paramStr(req.params.id),
      body.product_code.trim(),
      body.payload
    );
    res.status(201).json({ success: true, data: result });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    if (code === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: err instanceof Error ? err.message : "not found",
      });
    }
    if (code === "BAD_STATUS" || code === "NO_MATCHES") {
      return res.status(409).json({
        success: false,
        error: err instanceof Error ? err.message : "conflict",
      });
    }
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "queue failed",
    });
  }
});

router.delete("/:id/entries/:entryId", async (req: Request, res: Response) => {
  try {
    const ok = await deleteEntry(getPricingPool(), paramStr(req.params.entryId));
    if (!ok) return res.status(404).json({ success: false, error: "not found" });
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "delete entry failed",
    });
  }
});

// --- validate / publish -------------------------------------------------

router.post("/:id/validate", async (req: Request, res: Response) => {
  try {
    const report = await validateChangeSet(
      getPool(),
      getPricingPool(),
      paramStr(req.params.id)
    );
    res.json({ success: true, data: report });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    if (code === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: err instanceof Error ? err.message : "not found",
      });
    }
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "validate failed",
    });
  }
});

router.post("/:id/publish", async (req: Request, res: Response) => {
  try {
    const result = await publishChangeSet(getPricingPool(), paramStr(req.params.id));
    if (!result.ok) {
      return res.status(409).json({ success: false, error: result.error });
    }
    res.json({ success: true, data: result });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "publish failed",
    });
  }
});

export default router;
