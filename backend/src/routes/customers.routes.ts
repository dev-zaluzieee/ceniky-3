/**
 * API routes for unified customer lookup (Raynet + ERP).
 * Enforces selection + conflict validation rules.
 */

import { Router, Response } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.middleware";
import { ApiError } from "../utils/errors";
import * as customersService from "../services/customers.service";
import { CustomerSearchRequest, CustomerValidateRequest } from "../types/customers.types";

const router = Router();

/**
 * POST /api/customers/search
 * Returns Raynet + ERP candidates by phone number.
 */
router.post("/search", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body: CustomerSearchRequest = req.body;
    if (!body || typeof body.phone !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid request. 'phone' field is required and must be a string",
      });
    }

    const result = await customersService.searchCustomersDual(body.phone);
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(error, res);
  }
});

/**
 * POST /api/customers/validate
 * Validates selected Raynet+ERP pair for conflicts.
 */
router.post("/validate", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body: CustomerValidateRequest = req.body;

    if (!body || !body.raynet || !body.erp) {
      return res.status(400).json({
        success: false,
        error: "Invalid request. 'raynet' and 'erp' objects are required",
      });
    }

    const result = customersService.validateSelectedPair(body.raynet, body.erp);
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(error, res);
  }
});

/** Error handler for routes */
function handleError(error: any, res: Response): void {
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

export default router;

