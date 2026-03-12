/**
 * Client-side utilities for customer search (ERP via dual endpoint).
 */

import { RaynetLead } from "@/types/raynet.types";
import { ErpCustomer } from "@/types/erp.types";

export interface CustomerSearchResult {
  raynet: { customers: RaynetLead[]; totalCount: number };
  erp: { customers: ErpCustomer[]; totalCount: number };
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export async function searchCustomersDual(phone: string): Promise<ApiEnvelope<CustomerSearchResult>> {
  try {
    const res = await fetch("/api/customers/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = (await res.json()) as ApiEnvelope<CustomerSearchResult>;
    if (!res.ok) return { success: false, error: data.error || "Search failed", message: data.message };
    return data;
  } catch (e: any) {
    return { success: false, error: "Network error", message: e?.message };
  }
}

