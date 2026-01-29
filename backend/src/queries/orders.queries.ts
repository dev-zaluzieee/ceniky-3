/**
 * Raw SQL queries for orders (zakázky) operations
 * All queries use parameterized statements to prevent SQL injection
 */

import { Pool } from "pg";
import {
  OrderRecord,
  CreateOrderRequest,
  UpdateOrderRequest,
  ListOrdersQuery,
} from "../types/orders.types";
import { DatabaseError } from "../utils/errors";

/**
 * Create a new order record
 * @param pool - Database connection pool
 * @param userId - User ID (email)
 * @param data - Order customer data
 * @returns Created order record
 */
export async function createOrder(
  pool: Pool,
  userId: string,
  data: CreateOrderRequest
): Promise<OrderRecord> {
  const query = `
    INSERT INTO orders (user_id, name, email, phone, address, city, zipcode, raynet_id, erp_customer_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, user_id, name, email, phone, address, city, zipcode, raynet_id, erp_customer_id, created_at, updated_at, deleted_at
  `;

  const params = [
    userId,
    data.name ?? null,
    data.email ?? null,
    data.phone ?? null,
    data.address ?? null,
    data.city ?? null,
    data.zipcode ?? null,
    data.raynet_id ?? null,
    data.erp_customer_id ?? null,
  ];

  try {
    const result = await pool.query(query, params);
    return mapRowToOrderRecord(result.rows[0]);
  } catch (error: any) {
    throw new DatabaseError(`Failed to create order: ${error.message}`, error);
  }
}

/**
 * Get an order by ID (only if not deleted and belongs to user)
 */
export async function getOrderById(
  pool: Pool,
  id: number,
  userId: string
): Promise<OrderRecord | null> {
  const query = `
    SELECT id, user_id, name, email, phone, address, city, zipcode, raynet_id, erp_customer_id, created_at, updated_at, deleted_at
    FROM orders
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
  `;

  try {
    const result = await pool.query(query, [id, userId]);
    if (result.rows.length === 0) return null;
    return mapRowToOrderRecord(result.rows[0]);
  } catch (error: any) {
    throw new DatabaseError(`Failed to get order: ${error.message}`, error);
  }
}

/**
 * Get orders for a user with pagination
 */
export async function getOrdersByUserId(
  pool: Pool,
  userId: string,
  options: ListOrdersQuery = {}
): Promise<{ orders: OrderRecord[]; total: number }> {
  const { page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const whereClause = "user_id = $1 AND deleted_at IS NULL";

  const countQuery = `SELECT COUNT(*) as total FROM orders WHERE ${whereClause}`;
  const countResult = await pool.query(countQuery, [userId]);
  const total = parseInt(countResult.rows[0].total, 10);

  const dataQuery = `
    SELECT id, user_id, name, email, phone, address, city, zipcode, raynet_id, erp_customer_id, created_at, updated_at, deleted_at
    FROM orders
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;

  try {
    const result = await pool.query(dataQuery, [userId, limit, offset]);
    const orders = result.rows.map(mapRowToOrderRecord);
    return { orders, total };
  } catch (error: any) {
    throw new DatabaseError(`Failed to get orders: ${error.message}`, error);
  }
}

/**
 * Update an order (only if not deleted and belongs to user)
 */
export async function updateOrder(
  pool: Pool,
  id: number,
  userId: string,
  data: UpdateOrderRequest
): Promise<OrderRecord | null> {
  /* raynet_id and erp_customer_id use direct assignment so null can clear the reference */
  const query = `
    UPDATE orders
    SET name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        address = COALESCE($4, address),
        city = COALESCE($5, city),
        zipcode = COALESCE($6, zipcode),
        raynet_id = $7,
        erp_customer_id = $8,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $9 AND user_id = $10 AND deleted_at IS NULL
    RETURNING id, user_id, name, email, phone, address, city, zipcode, raynet_id, erp_customer_id, created_at, updated_at, deleted_at
  `;

  const params = [
    data.name ?? null,
    data.email ?? null,
    data.phone ?? null,
    data.address ?? null,
    data.city ?? null,
    data.zipcode ?? null,
    data.raynet_id,
    data.erp_customer_id,
    id,
    userId,
  ];

  try {
    const result = await pool.query(query, params);
    if (result.rows.length === 0) return null;
    return mapRowToOrderRecord(result.rows[0]);
  } catch (error: any) {
    throw new DatabaseError(`Failed to update order: ${error.message}`, error);
  }
}

/**
 * Soft delete an order
 */
export async function deleteOrder(
  pool: Pool,
  id: number,
  userId: string
): Promise<boolean> {
  const query = `
    UPDATE orders
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    RETURNING id
  `;

  try {
    const result = await pool.query(query, [id, userId]);
    return result.rows.length > 0;
  } catch (error: any) {
    throw new DatabaseError(`Failed to delete order: ${error.message}`, error);
  }
}

/**
 * Map database row to OrderRecord
 */
function mapRowToOrderRecord(row: any): OrderRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    zipcode: row.zipcode,
    raynet_id: row.raynet_id,
    erp_customer_id: row.erp_customer_id,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}
