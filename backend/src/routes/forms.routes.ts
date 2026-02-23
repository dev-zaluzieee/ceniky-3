/**
 * API routes for forms management
 * Handles CRUD operations for forms
 */

import { Router, Response } from "express";
import { getPool } from "../config/database";
import * as formsService from "../services/forms.service";
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
