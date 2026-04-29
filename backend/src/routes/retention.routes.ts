/**
 * Retention pipeline routes — "Poslat na retence" submissions and status lookup.
 */

import { Router, Response } from "express";
import { getPool } from "../config/database";
import * as retentionService from "../services/retention.service";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.middleware";
import { ApiError } from "../utils/errors";

const router = Router();

function handleError(error: any, res: Response): void {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }
  console.error("Unexpected error in retention route:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
}

function parseOrderId(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const id = parseInt(value, 10);
  if (Number.isNaN(id) || id <= 0) return null;
  return id;
}

/**
 * POST /api/retention/orders/:orderId/send
 * Body: { reason: string, testMode: boolean }
 * Chunk 1: writes a retention_logs row. In test mode → SUCCESS with stub payload.
 * In production → FAILED with RETENCE_PRODUCTION_NOT_AVAILABLE and 400.
 */
router.post(
  "/orders/:orderId/send",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orderId = parseOrderId(req.params.orderId);
      if (orderId == null) {
        return res.status(400).json({ success: false, error: "Invalid order ID" });
      }

      const userId = req.userId!;
      const ovtName = req.raynetUserName ?? null;
      const { reason, testMode } = (req.body ?? {}) as { reason?: unknown; testMode?: unknown };

      const pool = getPool();
      const result = await retentionService.sendOrderToRetention({
        pool,
        orderId,
        userId,
        ovtName,
        rawReason: reason,
        testMode: testMode === true,
      });

      res.json({
        success: true,
        data: {
          logId: result.logId,
          status: result.status,
          testMode: testMode === true,
          submittedAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      handleError(error, res);
    }
  }
);

/**
 * GET /api/retention/orders/:orderId/status
 * Returns the latest retention log + whether the order is currently in retention.
 */
router.get(
  "/orders/:orderId/status",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orderId = parseOrderId(req.params.orderId);
      if (orderId == null) {
        return res.status(400).json({ success: false, error: "Invalid order ID" });
      }

      const userId = req.userId!;
      const pool = getPool();
      const status = await retentionService.getOrderRetentionStatus(pool, orderId, userId);

      res.json({ success: true, data: status });
    } catch (error: any) {
      handleError(error, res);
    }
  }
);

export default router;
