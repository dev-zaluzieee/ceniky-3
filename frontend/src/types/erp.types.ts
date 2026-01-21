/**
 * ERP read-only replica types (frontend).
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

