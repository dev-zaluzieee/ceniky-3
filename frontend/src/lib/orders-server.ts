/**
 * Server-side utilities for fetching orders
 * Used in Server Components to fetch data directly from backend
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import jwt from "jsonwebtoken";
import type { OrderRecord, OrdersPaginationInfo } from "./orders-api";

function getBackendUrl(): string {
  return (
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    "http://localhost:3001"
  );
}

async function createAuthToken(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return null;
    const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
    if (!secret) return null;
    return jwt.sign(
      { email: session.user.email, id: session.user.email },
      secret,
      { expiresIn: "1h" }
    );
  } catch (error) {
    console.error("Error creating auth token:", error);
    return null;
  }
}

export interface ServerOrdersResponse {
  success: boolean;
  data?: OrderRecord[];
  pagination?: OrdersPaginationInfo;
  error?: string;
}

/**
 * Fetch orders list from backend (server-side)
 * @param query - Optional page, limit
 */
export async function fetchOrdersServer(
  query: { page?: number; limit?: number } = {}
): Promise<ServerOrdersResponse> {
  try {
    const authToken = await createAuthToken();
    if (!authToken) {
      return { success: false, error: "Unauthorized" };
    }

    const params = new URLSearchParams();
    if (query.page != null) params.append("page", query.page.toString());
    if (query.limit != null) params.append("limit", query.limit.toString());
    const queryString = params.toString();
    const url = `${getBackendUrl()}/api/orders${queryString ? `?${queryString}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      cache: "no-store",
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to fetch orders",
      };
    }
    return {
      success: true,
      data: data.data,
      pagination: data.pagination,
    };
  } catch (error) {
    console.error("Error fetching orders:", error);
    return { success: false, error: "Failed to fetch orders from server" };
  }
}

export interface ServerOrderResponse {
  success: boolean;
  data?: OrderRecord;
  error?: string;
}

/**
 * Fetch a single order by ID from backend (server-side)
 * @param orderId - Order ID
 */
export async function fetchOrderByIdServer(
  orderId: number
): Promise<ServerOrderResponse> {
  try {
    const authToken = await createAuthToken();
    if (!authToken) {
      return { success: false, error: "Unauthorized" };
    }

    const url = `${getBackendUrl()}/api/orders/${orderId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      cache: "no-store",
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: "Order not found" };
      }
      return { success: false, error: data.error || "Failed to fetch order" };
    }
    return { success: true, data: data.data };
  } catch (error) {
    console.error("Error fetching order:", error);
    return { success: false, error: "Failed to fetch order from server" };
  }
}
