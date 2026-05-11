/**
 * Admin breakage-check routes — used by validation-products' "Kontrola dopadu
 * na existující formuláře" button. Mounted at /api/admin/forms/* in index.ts.
 * Gated by `requireAdminToken`.
 */

import { Router, Request, Response } from "express";
import { getPool, getPricingPool } from "../../config/database";
import { requireAdminToken } from "../../middleware/admin-token.middleware";
import {
  runBreakageCheck,
  type BreakageCheckRequest,
  type ProposedPayload,
} from "../../services/admin-breakage-check.service";
import { getChangeSetWithEntries } from "../../services/admin-change-sets.service";

const router = Router();

router.use(requireAdminToken);

/**
 * POST /api/admin/forms/breakage-check
 *
 * See `admin-breakage-check.service.ts` for the request/response contract.
 */
router.post("/breakage-check", async (req: Request, res: Response) => {
  try {
    const body = req.body as BreakageCheckRequest & { change_set_id?: string };
    if (!body || typeof body !== "object") {
      return res.status(400).json({ success: false, error: "Body is required" });
    }
    if (typeof body.product_code !== "string" || !body.product_code.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "product_code is required" });
    }

    const pricingPool = getPricingPool();
    const mainPool = getPool();

    // change_set_id is an alternative to inline proposed_payload — pull the
    // payload from the change-set's product_pricing entry for any pricing
    // record sharing this product_code.
    if (body.change_set_id && !body.proposed_payload) {
      const cs = await getChangeSetWithEntries(pricingPool, body.change_set_id);
      if (!cs) {
        return res.status(404).json({ success: false, error: "change_set not found" });
      }
      const idsRes = await pricingPool.query(
        `SELECT id FROM product_pricing WHERE product_code = $1`,
        [body.product_code.trim()]
      );
      const matchingIds = new Set(idsRes.rows.map((r) => String(r.id)));
      const productEntry = cs.entries.find(
        (e) =>
          e.entity_kind === "product_pricing" &&
          e.entity_id != null &&
          matchingIds.has(e.entity_id)
      );
      const draftPayload =
        productEntry?.draft_payload && typeof productEntry.draft_payload === "object"
          ? (productEntry.draft_payload as Record<string, unknown>).payload
          : undefined;
      if (!draftPayload || typeof draftPayload !== "object") {
        return res.status(400).json({
          success: false,
          error:
            "change_set has no product_pricing entry with a draft payload for this product_code",
        });
      }
      body.proposed_payload = {
        product_code: body.product_code,
        ...(draftPayload as Record<string, unknown>),
      } as ProposedPayload;
    }

    if (!body.proposed_payload || typeof body.proposed_payload !== "object") {
      return res
        .status(400)
        .json({ success: false, error: "proposed_payload object is required" });
    }

    const result = await runBreakageCheck(mainPool, pricingPool, body);
    return res.json({ success: true, data: result });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "BAD_INPUT"
    ) {
      const message = err instanceof Error ? err.message : "Bad input";
      return res.status(400).json({ success: false, error: message });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/admin/forms/breakage-check] error", err);
    return res.status(500).json({ success: false, error: message });
  }
});

export default router;
