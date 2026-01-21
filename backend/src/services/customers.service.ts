/**
 * Service layer for unified customer lookup (Raynet + ERP).
 *
 * Requirements:
 * - Raynet is primary source of truth.
 * - ERP is secondary source (read-only replica).
 * - No caching.
 * - Phone matching against ERP uses LIKE and tolerates formatting differences.
 * - Only valid state: exactly one Raynet and one ERP selected AND no conflicts.
 *   If conflict, return a big warning (and ok=false).
 */

import { BadRequestError } from "../utils/errors";
import * as raynetQueries from "../queries/raynet.queries";
import * as erpCustomersQueries from "../queries/erp-customers.queries";
import { RaynetLead } from "../types/raynet.types";
import { ErpCustomer } from "../types/erp.types";
import {
  CustomerConflicts,
  CustomerPrefill,
  CustomerSearchResult,
  CustomerValidateResult,
} from "../types/customers.types";

/**
 * Validate phone number format (shared rule).
 * @throws BadRequestError when invalid
 */
function validatePhoneNumber(phone: string): void {
  if (!phone || typeof phone !== "string") {
    throw new BadRequestError("Phone number is required");
  }

  const trimmed = phone.trim();
  if (trimmed.length === 0) {
    throw new BadRequestError("Phone number cannot be empty");
  }

  // Allow common phone formats; final ERP matching does its own normalization.
  const phoneRegex = /^[\d\s\-\(\)\+]+$/;
  if (!phoneRegex.test(trimmed)) {
    throw new BadRequestError("Phone number contains invalid characters");
  }

  const digitCount = trimmed.replace(/\D/g, "").length;
  if (digitCount < 6) {
    throw new BadRequestError("Phone number is too short");
  }
  if (digitCount > 20) {
    throw new BadRequestError("Phone number is too long");
  }
}

/** Normalize string for conflict comparison: trim + collapse spaces + lower-case. */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Extract Raynet "prefill" fields for validation. */
function raynetToComparable(lead: RaynetLead): {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  zipcode: string;
} {
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  return {
    name: fullName,
    email: lead.contactInfo?.email ?? "",
    phone: lead.contactInfo?.tel1 ?? "",
    address: lead.address?.street ?? "",
    city: lead.address?.city ?? "",
    zipcode: lead.address?.zipCode ?? "",
  };
}

/** Extract ERP comparable fields. */
function erpToComparable(c: ErpCustomer): {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  zipcode: string;
} {
  return {
    name: c.name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    address: c.address ?? "",
    city: c.city ?? "",
    zipcode: c.zipcode ?? "",
  };
}

/**
 * Perform dual-source search by phone.
 * @param phone - user input phone
 */
export async function searchCustomersDual(phone: string): Promise<CustomerSearchResult> {
  validatePhoneNumber(phone);

  // Parallelize: Raynet + ERP
  const [raynetCustomers, erpCustomers] = await Promise.all([
    raynetQueries.searchCustomersByPhone(phone),
    erpCustomersQueries.searchErpCustomersByPhoneLike(phone),
  ]);

  return {
    raynet: { customers: raynetCustomers, totalCount: raynetCustomers.length },
    erp: { customers: erpCustomers, totalCount: erpCustomers.length },
  };
}

/**
 * Validate the selected Raynet+ERP pair for conflicts.
 * Returns ok=false + warning if any conflicts are found.
 */
export function validateSelectedPair(raynet: RaynetLead, erp: ErpCustomer): CustomerValidateResult {
  const r = raynetToComparable(raynet);
  const e = erpToComparable(erp);

  const conflicts: CustomerConflicts = {};

  if (norm(r.name) !== norm(e.name)) conflicts.name = { raynet: r.name || null, erp: e.name || null };
  if (norm(r.email) !== norm(e.email)) conflicts.email = { raynet: r.email || null, erp: e.email || null };
  if (norm(r.address) !== norm(e.address)) conflicts.address = { raynet: r.address || null, erp: e.address || null };
  if (norm(r.city) !== norm(e.city)) conflicts.city = { raynet: r.city || null, erp: e.city || null };
  if (norm(r.zipcode) !== norm(e.zipcode)) conflicts.zipcode = { raynet: r.zipcode || null, erp: e.zipcode || null };

  // Phone can be in different formats; compare digits-only suffix (CZ: last 9 digits)
  const rd = (r.phone || "").replace(/\D/g, "");
  const ed = (e.phone || "").replace(/\D/g, "");
  const r9 = rd.length > 9 ? rd.slice(-9) : rd;
  const e9 = ed.length > 9 ? ed.slice(-9) : ed;
  if (r9 !== e9) conflicts.phone = { raynet: r.phone || null, erp: e.phone || null };

  const conflictKeys = Object.keys(conflicts);

  /**
   * Conflict resolver:
   * - If a field is 1:1 equal (after normalization), keep it.
   * - Otherwise prefer ERP value (secondary source for filling),
   *   unless ERP is missing and Raynet is present (fallback to Raynet).
   *
   * This does NOT hide conflicts; conflicts still produce a big warning.
   */
  const resolveField = (raynetVal: string, erpVal: string): string => {
    const rn = norm(raynetVal);
    const en = norm(erpVal);

    // 1:1 match: return the more "original" value (prefer ERP if it has content, else Raynet).
    if (rn === en) {
      return erpVal || raynetVal;
    }

    // Conflict: prefer ERP if it has a value; otherwise fall back to Raynet.
    return erpVal || raynetVal;
  };

  const prefill: CustomerPrefill = {
    name: resolveField(r.name, e.name),
    email: resolveField(r.email, e.email),
    phone: resolveField(r.phone, e.phone),
    address: resolveField(r.address, e.address),
    city: resolveField(r.city, e.city),
    zipcode: resolveField(r.zipcode, e.zipcode) || undefined,
    raynet_id: raynet.id,
    erp_customer_id: erp.id,
  };

  if (conflictKeys.length > 0) {
    // Human-readable field labels for warning message.
    const labels: Record<string, string> = {
      name: "Jméno",
      email: "Email",
      phone: "Telefon",
      address: "Adresa",
      city: "Město",
      zipcode: "PSČ",
    };

    const conflictList = conflictKeys
      .map((k) => labels[k] || k)
      .sort()
      .join(", ");

    return {
      ok: false,
      warning: `⚠️ KONFLIKT DAT: Raynet a ERP se neshodují v polích: ${conflictList}.`,
      conflicts,
      prefill,
    };
  }

  return { ok: true, prefill };
}

