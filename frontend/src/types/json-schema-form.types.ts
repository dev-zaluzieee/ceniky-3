/**
 * Shared types for JSON-schema-driven dynamic forms (debug tool + order custom forms).
 * Matches the payload structure from the validation tool (product_code, zahlavi, form_body, zapati, enums, dependencies).
 */

export interface PropertyDefinition {
  ID: string;
  Code: string;
  Name: string;
  DataType: "text" | "numeric" | "boolean" | "enum" | "textarea" | "link";
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
  /** Manufacturer name from pricing catalog; used for ERP export */
  _product_manufacturer?: string;
  /** Property codes that are configured as surcharges (příplatky) in pricing */
  surcharge_properties?: string[];
  /** Property codes that affect price resolution (required in form rows) */
  price_affecting_enums?: string[];
  /** Property codes flagged as required by admin (independent of pricing) */
  required_properties?: string[];
}

/**
 * Flat row shape (legacy / helpers): `id` plus dynamic property codes.
 * Multi-product forms use `CatalogFormRow` in persisted `data.rooms`.
 */
export interface FormRow {
  id: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * One line in a room: tied to a catalog product; field values live in `values`.
 * `linkGroupId` couples link-type columns (same semantics as flat FormRow).
 */
export interface CatalogFormRow {
  id: string;
  /** `product_pricing.id` — key into `product_schemas` on the same form_json */
  product_pricing_id: string;
  values: Record<string, string | number | boolean>;
  linkGroupId?: string;
}

export interface Room {
  id: string;
  name: string;
  rows: CatalogFormRow[];
  /**
   * Shared default values per catalog product. Outer key: `product_pricing_id`.
   * Inner key: field code → value. Fields like `ks`, `width`, `height`, and `link`
   * are never shared — always per-row. Setting a value here overwrites that field
   * on every row of the same product in this room.
   */
  sharedValues?: Record<string, Record<string, string | number | boolean>>;
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

/**
 * Stored form_json for custom form type.
 * `schema` — záhlaví/zápatí (and enums for those sections) from the **first** catalog pick; never replaced when adding other products.
 * `product_schemas` — full OVT payload per catalog id, used for row `form_body` + extraction.
 */
export interface CustomFormJson {
  schema: ProductPayload;
  /** Maps `product_pricing_id` → merged catalog payload (same shape as single-product schema before) */
  product_schemas: Record<string, ProductPayload>;
  data: JsonSchemaFormData;
  /** User-editable form name, displayed on order detail. Same pattern as ADMF `form_json.name`. */
  name?: string;
}
