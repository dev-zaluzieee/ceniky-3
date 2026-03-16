/**
 * Type definitions for ERP export pipeline
 */

export type ErpExportLogStatus = "PENDING" | "MAPPING" | "SENDING" | "SUCCESS" | "FAILED";

export type ErpExportErrorCode =
  | "MISSING_ERP_ORDER_ID"
  | "FORM_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "MAPPING_ERROR"
  | "ERP_ORDER_NOT_FOUND"
  | "ERP_ORDER_LOCKED"
  | "ERP_VALIDATION_ERROR"
  | "ERP_AUTH_FAILED"
  | "ERP_SERVER_ERROR"
  | "ERP_TIMEOUT"
  | "ERP_CONFIG_MISSING"
  | "ERP_COMMENT_FAILED"
  | "UNKNOWN_ERROR";

export interface ErpExportWarning {
  code: "FIELD_SKIPPED" | "FIELD_EMPTY" | "ENUM_MISMATCH" | "PRODUCTS_SKIPPED";
  field: string;
  reason: string;
}

export interface ErpExportLogRecord {
  id: number;
  form_id: number;
  order_id: number;
  erp_order_id: number;
  user_id: string;
  export_batch_id: string | null;
  status: ErpExportLogStatus;
  test_mode: boolean;
  request_payload: Record<string, unknown> | null;
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  error_message: string | null;
  error_code: string | null;
  warnings: ErpExportWarning[] | null;
  duration_ms: number | null;
  created_at: Date;
  completed_at: Date | null;
}

export interface CreateErpExportLogParams {
  form_id: number;
  order_id: number;
  erp_order_id: number;
  user_id: string;
  export_batch_id?: string;
  test_mode: boolean;
}

export interface UpdateErpExportLogParams {
  status?: ErpExportLogStatus;
  request_payload?: Record<string, unknown>;
  response_status?: number;
  response_body?: Record<string, unknown>;
  error_message?: string;
  error_code?: ErpExportErrorCode;
  warnings?: ErpExportWarning[];
  duration_ms?: number;
  completed_at?: Date;
}

/** The ERP order update payload (PUT /orders/{id}) */
export interface ErpOrderUpdatePayload {
  status: string;
  final_value: number;
  column_values: Record<string, unknown>;
}

/** Single product for POST /orders/{id}/products */
export interface ErpProductPayload {
  nazev: string;
  ks: number;
  cena_bez_dph: number;
  cena_s_dph: number;
  vyrobce?: string;
}

/** Comment for POST /orders/{id}/comments */
export interface ErpCommentPayload {
  body: string;
}
