/**
 * Client-side utilities for orders (zakázky) API
 * Provides functions to interact with the orders API
 */

/**
 * Order record structure from API
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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Customer data for creating/updating an order (all optional; null clears reference)
 */
export interface OrderCustomerData {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zipcode?: string;
  raynet_id?: number | null;
  erp_customer_id?: number | null;
}

/**
 * Pagination information for orders list
 */
export interface OrdersPaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Response for listing orders
 */
export interface ListOrdersResponse {
  success: boolean;
  data?: OrderRecord[];
  pagination?: OrdersPaginationInfo;
  error?: string;
  message?: string;
}

/**
 * Response for single order operations
 */
export interface OrderResponse {
  success: boolean;
  data?: OrderRecord;
  error?: string;
  message?: string;
}

/**
 * Get list of orders for the authenticated user
 * @param query - Optional query parameters (page, limit)
 */
export async function getOrders(
  query: { page?: number; limit?: number } = {}
): Promise<ListOrdersResponse> {
  try {
    const params = new URLSearchParams();
    if (query.page != null) params.append("page", query.page.toString());
    if (query.limit != null) params.append("limit", query.limit.toString());
    const queryString = params.toString();
    const url = `/api/orders${queryString ? `?${queryString}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to fetch orders",
        message: data.message,
      };
    }
    return {
      success: true,
      data: data.data,
      pagination: data.pagination,
    };
  } catch (error: any) {
    console.error("Error fetching orders:", error);
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
}

/**
 * Get a single order by ID
 * @param orderId - Order ID
 */
export async function getOrderById(orderId: number): Promise<OrderResponse> {
  try {
    const response = await fetch(`/api/orders/${orderId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to fetch order",
        message: data.message,
      };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    console.error("Error fetching order:", error);
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
}

/**
 * Create a new order (customer data from prefill)
 * @param customerData - Customer data (name, email, phone, address, city, etc.)
 */
export async function createOrder(
  customerData: OrderCustomerData
): Promise<OrderResponse> {
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customerData),
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to create order",
        message: data.message,
      };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    console.error("Error creating order:", error);
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
}

/**
 * Update an existing order
 * @param orderId - Order ID
 * @param customerData - Updated customer data
 */
export async function updateOrder(
  orderId: number,
  customerData: OrderCustomerData
): Promise<OrderResponse> {
  try {
    const response = await fetch(`/api/orders/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customerData),
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to update order",
        message: data.message,
      };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    console.error("Error updating order:", error);
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
}

/**
 * Delete an order (soft delete)
 * @param orderId - Order ID
 */
export async function deleteOrder(orderId: number): Promise<OrderResponse> {
  try {
    const response = await fetch(`/api/orders/${orderId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to delete order",
        message: data.message,
      };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    console.error("Error deleting order:", error);
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
}
