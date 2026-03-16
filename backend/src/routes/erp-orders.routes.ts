/**
 * API routes for ERP order lookups (read-only replica).
 */

import { Router, Response } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.middleware";
import { ApiError } from "../utils/errors";
import * as erpOrdersService from "../services/erp-orders.service";

const router = Router();

/**
 * GET /api/erp/customers/:customerId/orders
 * Returns ERP orders for a given customer.
 */
router.get(
  "/customers/:customerId/orders",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const raw = Array.isArray(req.params.customerId) ? req.params.customerId[0] : req.params.customerId;
      const customerId = parseInt(raw, 10);
      if (isNaN(customerId) || customerId <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid customer ID. Must be a positive integer.",
        });
      }

      const orders = await erpOrdersService.getOrdersByCustomerId(customerId);
      res.json({ success: true, data: { orders, totalCount: orders.length } });
    } catch (error: any) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
        });
      } else {
        console.error("Unexpected error:", error);
        res.status(500).json({
          success: false,
          error: "Internal server error",
          message: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    }
  }
);

export default router;
