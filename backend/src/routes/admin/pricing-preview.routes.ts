/**
 * Admin pricing preview routes — used by the validation-products-pricing app's
 * Kalkulačka panel and (later) the impact-diff flow. Mounted at
 * /api/admin/pricing/* in index.ts. All routes are gated by
 * `requireAdminToken`.
 */

import { Router, Request, Response } from "express";
import { getPool, getPricingPool } from "../../config/database";
import { requireAdminToken } from "../../middleware/admin-token.middleware";
import {
  calculatePricePreview,
  ADMIN_PRICING_PREVIEW_ERRORS,
  type CalculatePriceRequest,
} from "../../services/admin-pricing-preview.service";
import {
  runImpactDiff,
  type ImpactDiffRequest,
} from "../../services/admin-impact-diff.service";
import {
  getChangeSetWithEntries,
  entriesToOverridesForProduct,
} from "../../services/admin-change-sets.service";

const router = Router();

router.use(requireAdminToken);

/**
 * POST /api/admin/pricing/calculate-price
 *
 * See `admin-pricing-preview.service.ts` for the request/response contract.
 */
router.post("/calculate-price", async (req: Request, res: Response) => {
  try {
    const body = req.body as CalculatePriceRequest & { change_set_id?: string };
    if (!body || typeof body !== "object") {
      return res.status(400).json({ success: false, error: "Body is required" });
    }
    if (typeof body.product_pricing_id !== "string" || !body.product_pricing_id.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "product_pricing_id is required" });
    }

    // change_set_id is an alternative to inline overrides — load the
    // change-set's entries and convert to the per-product override shape.
    if (body.change_set_id && !body.overrides) {
      const cs = await getChangeSetWithEntries(getPricingPool(), body.change_set_id);
      if (!cs) {
        return res.status(404).json({ success: false, error: "change_set not found" });
      }
      body.overrides = entriesToOverridesForProduct(cs.entries, body.product_pricing_id);
    }
    if (
      !body.dimensions ||
      typeof body.dimensions !== "object" ||
      typeof body.dimensions.width_mm !== "number" ||
      typeof body.dimensions.height_mm !== "number"
    ) {
      return res
        .status(400)
        .json({ success: false, error: "dimensions.width_mm/height_mm (numbers) are required" });
    }
    if (!body.enum_selections || typeof body.enum_selections !== "object") {
      return res
        .status(400)
        .json({ success: false, error: "enum_selections object is required (may be empty)" });
    }

    const pricingPool = getPricingPool();
    const result = await calculatePricePreview(pricingPool, body);
    return res.json({ success: true, data: result });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === ADMIN_PRICING_PREVIEW_ERRORS.NOT_FOUND
    ) {
      return res
        .status(404)
        .json({ success: false, error: "Product pricing not found" });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/admin/pricing/calculate-price] error", err);
    return res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/admin/pricing/impact-diff
 *
 * See `admin-impact-diff.service.ts` for request/response contract. Returns
 * which **custom** forms touch the given product within the time window and
 * what their per-row prices would shift to under the proposed overrides.
 * ADMFs are intentionally excluded — they're frozen at generation time.
 */
router.post("/impact-diff", async (req: Request, res: Response) => {
  try {
    const body = req.body as ImpactDiffRequest & { change_set_id?: string };
    if (!body || typeof body !== "object") {
      return res.status(400).json({ success: false, error: "Body is required" });
    }
    if (typeof body.product_pricing_id !== "string" || !body.product_pricing_id.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "product_pricing_id is required" });
    }

    if (body.change_set_id && !body.overrides) {
      const cs = await getChangeSetWithEntries(getPricingPool(), body.change_set_id);
      if (!cs) {
        return res.status(404).json({ success: false, error: "change_set not found" });
      }
      body.overrides = entriesToOverridesForProduct(cs.entries, body.product_pricing_id);
    }

    const mainPool = getPool();
    const pricingPool = getPricingPool();
    const result = await runImpactDiff(mainPool, pricingPool, body);
    return res.json({ success: true, data: result });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "PRODUCT_PRICING_NOT_FOUND"
    ) {
      return res
        .status(404)
        .json({ success: false, error: "Product pricing not found" });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/admin/pricing/impact-diff] error", err);
    return res.status(500).json({ success: false, error: message });
  }
});

export default router;
