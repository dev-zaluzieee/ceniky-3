/**
 * Shared types for JSON-schema-driven dynamic forms (debug tool + order custom forms).
 * Matches the payload structure from the validation tool (product_code, zahlavi, form_body, zapati, enums, dependencies).
 */

export interface PropertyDefinition {
  ID: string;
  Code: string;
  Name: string;
  DataType: "text" | "numeric" | "boolean" | "enum" | "textarea";
  Value?: string | number | boolean;
  "label-form"?: string;
}

export interface SectionBlock {
  Code: string;
  Name: string;
  Properties: PropertyDefinition[];
}

export interface EnumValue {
  code: string;
  name: string;
  groups: string[];
  active?: boolean;
  note?: string;
}

export type EnumEntry = { default: EnumValue[]; [groupKey: string]: EnumValue[] | undefined };

export interface PayloadDependency {
  source_enum: string;
  source_value: string;
  target_property: string;
  allowed_values?: string[];
  field_disabled?: boolean;
}

export interface ProductPayload {
  product_code: string;
  zahlavi?: SectionBlock;
  form_body?: SectionBlock;
  zapati?: SectionBlock;
  enums: Record<string, EnumEntry>;
  dependencies?: PayloadDependency[];
  downloaded_at?: string;
  _metadata?: Record<string, unknown>;
  /** Set when form is created from catalog; used by backend to resolve prices from pricing DB */
  _product_pricing_id?: string;
}

export interface FormRow {
  id: string;
  [key: string]: string | number | boolean;
}

export interface Room {
  id: string;
  name: string;
  rows: FormRow[];
}

export interface JsonSchemaFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  productCode: string;
  productName: string;
  zahlaviValues: Record<string, string | number | boolean>;
  zapatiValues: Record<string, string | number | boolean>;
  rooms: Room[];
}

/** Stored form_json for custom form type: schema + filled data */
export interface CustomFormJson {
  schema: ProductPayload;
  data: JsonSchemaFormData;
}
