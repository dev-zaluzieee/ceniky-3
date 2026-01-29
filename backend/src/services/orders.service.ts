/**
 * Service layer for orders (zakázky) business logic
 * Handles validation and coordinates between routes and queries
 */

import { Pool } from "pg";
import {
  OrderRecord,
  CreateOrderRequest,
  UpdateOrderRequest,
  ListOrdersQuery,
} from "../types/orders.types";
import { PaginatedResponse } from "../types/forms.types"; // reuse pagination shape
import * as ordersQueries from "../queries/orders.queries";
import { validatePagination } from "../utils/validation";
import { NotFoundError } from "../utils/errors";

/**
 * Create a new order
 * @param pool - Database connection pool
 * @param userId - User ID
 * @param request - Order creation request (customer data)
 * @returns Created order record
 */
export async function createOrder(
  pool: Pool,
  userId: string,
  request: CreateOrderRequest
): Promise<OrderRecord> {
  return await ordersQueries.createOrder(pool, userId, request);
}

/**
 * Get an order by ID
 * @param pool - Database connection pool
 * @param id - Order ID
 * @param userId - User ID for authorization
 * @returns Order record
 * @throws NotFoundError if order not found
 */
export async function getOrderById(
  pool: Pool,
  id: number,
  userId: string
): Promise<OrderRecord> {
  const order = await ordersQueries.getOrderById(pool, id, userId);
  if (!order) {
    throw new NotFoundError("Order not found");
  }
  return order;
}

/**
 * Get paginated list of orders for a user
 */
export async function getOrdersByUserId(
  pool: Pool,
  userId: string,
  query: ListOrdersQuery = {}
): Promise<PaginatedResponse<OrderRecord>> {
  const { page, limit } = validatePagination(query.page, query.limit);
  const { orders, total } = await ordersQueries.getOrdersByUserId(pool, userId, {
    ...query,
    page,
    limit,
  });
  const totalPages = Math.ceil(total / limit);
  return {
    data: orders,
    pagination: { page, limit, total, totalPages },
  };
}

/**
 * Update an order
 * When raynet_id/erp_customer_id are undefined in request, preserve existing values (null clears).
 * @throws NotFoundError if order not found
 */
export async function updateOrder(
  pool: Pool,
  id: number,
  userId: string,
  request: UpdateOrderRequest
): Promise<OrderRecord> {
  const existing = await ordersQueries.getOrderById(pool, id, userId);
  if (!existing) {
    throw new NotFoundError("Order not found");
  }
  const merged: UpdateOrderRequest = {
    ...request,
    raynet_id: request.raynet_id !== undefined ? request.raynet_id : existing.raynet_id,
    erp_customer_id: request.erp_customer_id !== undefined ? request.erp_customer_id : existing.erp_customer_id,
  };
  const order = await ordersQueries.updateOrder(pool, id, userId, merged);
  if (!order) {
    throw new NotFoundError("Order not found");
  }
  return order;
}

/**
 * Delete an order (soft delete)
 * @throws NotFoundError if order not found
 */
export async function deleteOrder(
  pool: Pool,
  id: number,
  userId: string
): Promise<void> {
  const deleted = await ordersQueries.deleteOrder(pool, id, userId);
  if (!deleted) {
    throw new NotFoundError("Order not found");
  }
}
