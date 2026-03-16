/**
 * Type definitions for ERP read-only replica.
 */

/**
 * ERP customer row (customers table).
 * Mirrors the fields we care about for matching/prefill/validation.
 */
export interface ErpCustomer {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  city_part: string | null;
  region: string | null;
  zipcode: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * ERP order row (orders table).
 * Used for pairing a local order with its ERP counterpart.
 */
export interface ErpOrder {
  id: number;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  customer_id: number | null;
  priority: string;
  order_type: string;
  parent_order_id: number | null;
}

