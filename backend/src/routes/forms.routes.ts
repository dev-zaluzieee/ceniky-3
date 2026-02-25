/**
 * API routes for forms management
 * Handles CRUD operations for forms
 */

import { Router, Response } from "express";
import { getPool, getPricingPool } from "../config/database";
import * as formsService from "../services/forms.service";
import * as pricingFormsService from "../services/pricing-forms.service";
import * as sizeLimitsService from "../services/size-limits.service";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.middleware";
import { ApiError } from "../utils/errors";
import { FormType, ListFormsQuery } from "../types/forms.types";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Form:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Form ID
 *         user_id:
 *           type: string
 *           description: User identifier (email)
 *         form_type:
 *           type: string
 *           enum: [custom, admf]
 *           description: Type of form
 *         form_json:
 *           type: object
 *           description: Form data as JSON object
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Soft delete timestamp
 *     CreateFormRequest:
 *       type: object
 *       required:
 *         - form_type
 *         - form_json
 *       properties:
 *         form_type:
 *           type: string
 *           enum: [custom, admf]
 *         form_json:
 *           type: object
 *     UpdateFormRequest:
 *       type: object
 *       required:
 *         - form_json
 *       properties:
 *         form_json:
 *           type: object
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *         message:
 *           type: string
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 */

/**
 * @swagger
 * /api/forms:
 *   post:
 *     summary: Create a new form
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateFormRequest'
 *     responses:
 *       201:
 *         description: Form created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Form'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId!;
    const body = {
      ...req.body,
      order_id: req.body.order_id != null ? parseInt(req.body.order_id, 10) : undefined,
    };
    if (body.order_id === undefined) {
      return res.status(400).json({ success: false, error: "order_id is required" });
    }
    if (isNaN(body.order_id)) {
      return res.status(400).json({ success: false, error: "Invalid order_id" });
    }

    const form = await formsService.createForm(pool, userId, body);

    res.status(201).json({
      success: true,
      data: form,
    });
  } catch (error: any) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/forms/pricing:
 *   get:
 *     summary: List OVT-available forms from pricing database (manufacturer + product_code search)
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: manufacturer
 *         schema:
 *           type: string
 *         description: Filter by manufacturer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Fulltext/substring search on product_code
 *     responses:
 *       200:
 *         description: List of { id, manufacturer, product_code }
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Pricing database unavailable
 */
router.get("/pricing", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPricingPool();
    const manufacturer = (req.query.manufacturer as string)?.trim() || undefined;
    const search = (req.query.search as string)?.trim() || undefined;
    const list = await pricingFormsService.listOvtForms(pool, { manufacturer, search });
    return res.json({ success: true, data: list });
  } catch (error: any) {
    if (error.message?.includes("PRICING_DATABASE_URL")) {
      return res.status(503).json({ success: false, error: "Pricing database not configured" });
    }
    console.error("List pricing forms error:", error);
    return res.status(500).json({ success: false, error: "Failed to list pricing forms" });
  }
});

/**
 * @swagger
 * /api/forms/pricing/manufacturers:
 *   get:
 *     summary: List distinct manufacturers that have OVT-available forms
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of manufacturer names
 *       503:
 *         description: Pricing database unavailable
 */
router.get("/pricing/manufacturers", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPricingPool();
    const manufacturers = await pricingFormsService.listOvtManufacturers(pool);
    return res.json({ success: true, data: manufacturers });
  } catch (error: any) {
    if (error.message?.includes("PRICING_DATABASE_URL")) {
      return res.status(503).json({ success: false, error: "Pricing database not configured" });
    }
    console.error("List manufacturers error:", error);
    return res.status(500).json({ success: false, error: "Failed to list manufacturers" });
  }
});

/**
 * @swagger
 * /api/forms/pricing/{id}:
 *   get:
 *     summary: Get one OVT form by id (includes ovt_export_json for form generation)
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Form detail with ovt_export_json
 *       404:
 *         description: Not found
 *       503:
 *         description: Pricing database unavailable
 */
router.get("/pricing/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPricingPool();
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const form = await pricingFormsService.getOvtFormById(pool, id);
    if (!form) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }
    return res.json({ success: true, data: form });
  } catch (error: any) {
    if (error.message?.includes("PRICING_DATABASE_URL")) {
      return res.status(503).json({ success: false, error: "Pricing database not configured" });
    }
    console.error("Get pricing form error:", error);
    return res.status(500).json({ success: false, error: "Failed to get pricing form" });
  }
});

/**
 * POST /api/forms/size-limits – resolve manufacturing/warranty ranges for a row.
 * Body: { product_pricing_id, width, height, row_values: Record<string, string> }.
 * Backend uses price_affecting_enums to build selector from row_values.
 */
router.post("/size-limits", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPricingPool();
    const body = req.body as {
      product_pricing_id?: string;
      width?: number;
      height?: number;
      row_values?: Record<string, string>;
    };
    const productPricingId = body.product_pricing_id;
    const width = body.width != null ? Number(body.width) : NaN;
    const height = body.height != null ? Number(body.height) : NaN;
    const rowValues = body.row_values ?? {};
    if (!productPricingId || typeof productPricingId !== "string") {
      return res.status(400).json({ success: false, error: "product_pricing_id is required" });
    }
    if (Number.isNaN(width) || Number.isNaN(height)) {
      return res.status(400).json({ success: false, error: "width and height must be numbers" });
    }
    const product = await pricingFormsService.getProductPricingForResolve(pool, productPricingId);
    const selectorValues: Record<string, string> = {};
    if (product?.price_affecting_enums?.length) {
      for (const key of product.price_affecting_enums) {
        const v = rowValues[key];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          selectorValues[key] = String(v).trim();
        }
      }
    }
    const data = await sizeLimitsService.resolveSizeLimits(
      pool,
      productPricingId,
      selectorValues,
      width,
      height
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.message?.includes("PRICING_DATABASE_URL")) {
      return res.status(503).json({ success: false, error: "Pricing database not configured" });
    }
    console.error("Size limits resolve error:", error);
    return res.status(500).json({ success: false, error: "Failed to resolve size limits" });
  }
});

/**
 * @swagger
 * /api/forms:
 *   get:
 *     summary: Get list of forms for authenticated user
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: form_type
 *         schema:
 *           type: string
 *           enum: [custom, admf]
 *         description: Filter by form type
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of forms with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Form'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId!;

    const query: ListFormsQuery = {
      form_type: req.query.form_type as FormType | undefined,
      order_id: req.query.order_id ? parseInt(req.query.order_id as string, 10) : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const result = await formsService.getFormsByUserId(pool, userId, query);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: any) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/forms/{id}:
 *   get:
 *     summary: Get a form by ID
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Form ID
 *     responses:
 *       200:
 *         description: Form details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Form'
 *       404:
 *         description: Form not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId!;
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid form ID",
      });
    }

    const form = await formsService.getFormById(pool, id, userId);

    res.json({
      success: true,
      data: form,
    });
  } catch (error: any) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/forms/{id}:
 *   put:
 *     summary: Update a form
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Form ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateFormRequest'
 *     responses:
 *       200:
 *         description: Form updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Form'
 *       400:
 *         description: Bad request
 *       404:
 *         description: Form not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId!;
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid form ID",
      });
    }

    const form = await formsService.updateForm(pool, id, userId, req.body);

    res.json({
      success: true,
      data: form,
    });
  } catch (error: any) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/forms/{id}:
 *   delete:
 *     summary: Delete a form (soft delete)
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Form ID
 *     responses:
 *       200:
 *         description: Form deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Form not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const userId = req.userId!;
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid form ID",
      });
    }

    await formsService.deleteForm(pool, id, userId);

    res.json({
      success: true,
      message: "Form deleted successfully",
    });
  } catch (error: any) {
    handleError(error, res);
  }
});

/**
 * Error handler for routes
 * Converts errors to appropriate HTTP responses
 */
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
