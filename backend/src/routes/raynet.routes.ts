/**
 * API routes for Raynet integration
 * Handles customer search operations via Raynet API
 */

import { Router, Response } from "express";
import * as raynetService from "../services/raynet.service";
import * as raynetClient from "../services/raynet.client";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.middleware";
import { ApiError } from "../utils/errors";
import { SearchCustomerByPhoneRequest } from "../types/raynet.types";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     SearchCustomerByPhoneRequest:
 *       type: object
 *       required:
 *         - phone
 *       properties:
 *         phone:
 *           type: string
 *           description: Phone number to search for
 *           example: "773705405"
 *     CustomerSearchResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             customers:
 *               type: array
 *               items:
 *                 type: object
 *                 description: Raynet lead record
 *             totalCount:
 *               type: integer
 *               description: Total number of matching customers
 */

/**
 * @swagger
 * /api/raynet/customers/search:
 *   post:
 *     summary: Search for customers in Raynet by phone number
 *     tags: [Raynet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SearchCustomerByPhoneRequest'
 *     responses:
 *       200:
 *         description: Customer search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CustomerSearchResponse'
 *       400:
 *         description: Bad request (invalid phone number)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  "/customers/search",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const request: SearchCustomerByPhoneRequest = req.body;

      // Validate request body
      if (!request || typeof request.phone !== "string") {
        return res.status(400).json({
          success: false,
          error: "Invalid request. 'phone' field is required and must be a string",
        });
      }

      // Search customers
      const result = await raynetService.searchCustomersByPhone(request);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      handleError(error, res);
    }
  }
);

/**
 * @swagger
 * /api/raynet/events:
 *   get:
 *     summary: Get Raynet calendar events for the authenticated user
 *     tags: [Raynet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           example: "2025-08-08"
 *         description: Day for which to load events (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: List of events for the given day
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: Raynet event record
 *                     totalCount:
 *                       type: integer
 *       400:
 *         description: Bad request (missing date or raynet_id)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  "/events",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const date = (req.query.date as string) || "";
      const raynetUserId = req.raynetUserId;

      if (!raynetUserId) {
        return res.status(400).json({
          success: false,
          error: "User is not paired with Raynet (missing raynet_id).",
        });
      }

      const result = await raynetService.getEventsForOwnerAndDate(raynetUserId, date);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      handleError(error, res);
    }
  }
);

/**
 * POST /api/raynet/events/:eventId/description
 * Update a Raynet event's description.
 */
router.post(
  "/events/:eventId/description",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const raw = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
      const eventId = parseInt(raw, 10);
      if (isNaN(eventId) || eventId <= 0) {
        return res.status(400).json({ success: false, error: "Invalid event ID" });
      }

      const { description } = req.body;
      if (typeof description !== "string") {
        return res.status(400).json({ success: false, error: "'description' must be a string" });
      }

      await raynetClient.updateEventDescription(eventId, description);
      res.json({ success: true });
    } catch (error: any) {
      handleError(error, res);
    }
  }
);

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
