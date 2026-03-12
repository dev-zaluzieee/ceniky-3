/**
 * Type definitions for orders API (zakázky)
 * Order = one customer; forms belong to an order.
 */

/**
 * Order record as stored in database
 */
export interface OrderRecord {
  id: number;
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  zipcode: string | null;
  raynet_id: number | null;
  erp_customer_id: number | null;
  source_raynet_event_id: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * Request body for creating an order (customer data from prefill)
 */
export interface CreateOrderRequest {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zipcode?: string;
  raynet_id?: number;
  erp_customer_id?: number;
  source_raynet_event_id?: number;
  notes?: string;
}

/**
 * Request body for updating an order.
 * raynet_id / erp_customer_id: undefined = keep existing, null = clear reference.
 */
export interface UpdateOrderRequest {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zipcode?: string;
  raynet_id?: number | null;
  erp_customer_id?: number | null;
  source_raynet_event_id?: number | null;
  notes?: string | null;
}

/**
 * Query parameters for listing orders
 */
export interface ListOrdersQuery {
  page?: number;
  limit?: number;
}

/** Input for bulk lookup of orders by Raynet event ids. */
export interface FindOrdersByRaynetEventsRequest {
  eventIds: number[];
}

/** Mapping entry returned for a linked Raynet event. */
export interface RaynetEventOrderLink {
  eventId: number;
  orderId: number;
}
