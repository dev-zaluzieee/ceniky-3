/**
 * Unified customer search + validation types.
 * Raynet is primary (source of truth), ERP is secondary (read-only replica).
 */

import { RaynetLead } from "./raynet.types";
import { ErpCustomer } from "./erp.types";

/** Request payload for dual-source customer search. */
export interface CustomerSearchRequest {
  phone: string;
}

/** Response payload returned from dual-source search endpoint. */
export interface CustomerSearchResult {
  raynet: {
    customers: RaynetLead[];
    totalCount: number;
  };
  erp: {
    customers: ErpCustomer[];
    totalCount: number;
  };
}

/** Request payload for validating the selected pair. */
export interface CustomerValidateRequest {
  /** Selected Raynet customer (returned from our search endpoint). */
  raynet: RaynetLead;
  /** Selected ERP customer (returned from our search endpoint). */
  erp: ErpCustomer;
}

/** Field-level conflicts between Raynet and ERP. */
export interface CustomerConflicts {
  name?: { raynet: string | null; erp: string | null };
  email?: { raynet: string | null; erp: string | null };
  phone?: { raynet: string | null; erp: string | null };
  address?: { raynet: string | null; erp: string | null };
  city?: { raynet: string | null; erp: string | null };
  zipcode?: { raynet: string | null; erp: string | null };
}

/** Prefill payload used by frontend forms. */
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

/** Validation response enforcing "exactly one + one + no conflicts". */
export interface CustomerValidateResult {
  ok: boolean;
  warning?: string;
  conflicts?: CustomerConflicts;
  prefill?: CustomerPrefill;
}

