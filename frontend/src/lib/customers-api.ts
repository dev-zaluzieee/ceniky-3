/**
 * Client-side utilities for unified customer search (Raynet + ERP).
 */

import { RaynetLead } from "@/types/raynet.types";
import { ErpCustomer } from "@/types/erp.types";

export interface CustomerSearchResult {
  raynet: { customers: RaynetLead[]; totalCount: number };
  erp: { customers: ErpCustomer[]; totalCount: number };
}

export interface CustomerConflicts {
  name?: { raynet: string | null; erp: string | null };
  email?: { raynet: string | null; erp: string | null };
  phone?: { raynet: string | null; erp: string | null };
  address?: { raynet: string | null; erp: string | null };
  city?: { raynet: string | null; erp: string | null };
  zipcode?: { raynet: string | null; erp: string | null };
}

export interface CustomerPrefill {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  zipcode?: string;
  raynet_id: number;
  erp_customer_id: number;
}

export interface CustomerValidateResult {
  ok: boolean;
  warning?: string;
  conflicts?: CustomerConflicts;
  prefill?: CustomerPrefill;
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

export async function validateCustomerPair(
  raynet: RaynetLead,
  erp: ErpCustomer
): Promise<ApiEnvelope<CustomerValidateResult>> {
  try {
    const res = await fetch("/api/customers/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raynet, erp }),
    });
    const data = (await res.json()) as ApiEnvelope<CustomerValidateResult>;
    if (!res.ok) return { success: false, error: data.error || "Validate failed", message: data.message };
    return data;
  } catch (e: any) {
    return { success: false, error: "Network error", message: e?.message };
  }
}

