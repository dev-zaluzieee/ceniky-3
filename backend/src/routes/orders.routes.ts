/**
 * API routes for orders (zakázky) management
 * Handles CRUD operations for orders
 */

import { Router, Response } from "express";
import { getPool } from "../config/database";
import * as ordersService from "../services/orders.service";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.middleware";
import { ApiError } from "../utils/errors";
import { ListOrdersQuery } from "../types/orders.types";

const router = Router();

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

/**
 * POST /api/orders - Create a new order (customer data from prefill)
 */
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId!;
    const order = await ordersService.createOrder(pool, userId, req.body);
    res.status(201).json({ success: true, data: order });
  } catch (error: any) {
    handleError(error, res);
  }
});

/**
 * GET /api/orders - List orders for authenticated user
 */
router.get("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId!;
    const query: ListOrdersQuery = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };
    const result = await ordersService.getOrdersByUserId(pool, userId, query);
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error: any) {
    handleError(error, res);
  }
});

/**
 * GET /api/orders/:id - Get order by ID
 */
router.get("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId!;
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: "Invalid order ID" });
    }
    const order = await ordersService.getOrderById(pool, id, userId);
    res.json({ success: true, data: order });
  } catch (error: any) {
    handleError(error, res);
  }
});

/**
 * PUT /api/orders/:id - Update order
 */
router.put("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId!;
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: "Invalid order ID" });
    }
    const order = await ordersService.updateOrder(pool, id, userId, req.body);
    res.json({ success: true, data: order });
  } catch (error: any) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/orders/:id - Soft delete order
 */
router.delete("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId!;
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: "Invalid order ID" });
    }
    await ordersService.deleteOrder(pool, id, userId);
    res.json({ success: true, message: "Order deleted successfully" });
  } catch (error: any) {
    handleError(error, res);
  }
});

export default router;
