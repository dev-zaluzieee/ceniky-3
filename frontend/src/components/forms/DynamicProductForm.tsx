"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogFormRow,
  EnumEntry,
  EnumValue,
  JsonSchemaFormData,
  ProductPayload,
  PropertyDefinition,
  Room,
  SectionBlock,
} from "@/types/json-schema-form.types";
import { resolveProductNameFromPayload } from "@/lib/resolve-product-name";
import { checkSizeLimits, type SizeLimitsResult } from "@/lib/size-limits-api";
import {
  buildEffectiveRequiredFieldCodes,
  catalogRowToFormRow,
  hasAnyMissingPriceAffectingFieldsMulti,
  isDimensionPropertyCode,
  isHeightPropertyCode,
  isPriceAffectingFieldMissing,
  isRowFieldDisabledByDependency,
  isWidthPropertyCode,
  KS_PROPERTY_CODE,
  missingRequiredLinesMulti,
} from "@/lib/price-affecting-validation";
import { emptyValuesForProductSchema, mergeValuesForProductSwitch } from "@/lib/merge-product-switch";
import { getRowPricePreview, type RowPricePreview } from "@/lib/price-preview-api";
import { productPayloadFromPricingDetail } from "@/lib/product-schema-from-pricing-detail";
import type { PricingFormDetail } from "@/lib/pricing-forms-api";
import ProductPickerModal from "@/components/forms/ProductPickerModal";
import PricePreviewModal from "@/components/forms/PricePreviewModal";
import ProductSwitchLossModal from "@/components/forms/ProductSwitchLossModal";
import SearchableSelect from "@/components/forms/SearchableSelect";

const SIZE_LIMITS_DEBOUNCE_MS = 400;

function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/** Consecutive rows with the same `product_pricing_id` render as one multi-row table. */
type RoomRowRun =
  | { kind: "missing"; row: CatalogFormRow }
  | { kind: "group"; rows: CatalogFormRow[]; schema: ProductPayload };

/**
 * Split room rows into runs: same catalog product in adjacent rows → single UI block with one `<thead>`.
 */
function groupRoomRowsIntoRuns(
  rows: CatalogFormRow[],
  productSchemas: Record<string, ProductPayload>
): RoomRowRun[] {
  const runs: RoomRowRun[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    const schema = productSchemas[row.product_pricing_id];
    if (!schema) {
      runs.push({ kind: "missing", row });
      i += 1;
      continue;
    }
    const pid = row.product_pricing_id;
    const chunk: CatalogFormRow[] = [row];
    let j = i + 1;
    while (j < rows.length) {
      const next = rows[j];
      if (next.product_pricing_id !== pid) break;
      if (!productSchemas[next.product_pricing_id]) break;
      chunk.push(next);
      j += 1;
    }
    runs.push({ kind: "group", rows: chunk, schema });
    i = j;
  }
  return runs;
}

/** Czech plural for “N řádek/řádky/řádků”. */
function czechRowCountLabel(n: number): string {
  if (n === 1) return "1 řádek";
  if (n < 1) return "0 řádků";
  if (n >= 2 && n <= 4) return `${n} řádky`;
  return `${n} řádků`;
}

/** Compact badge text for counts in room / product headers. */
function czechProductCountLabel(n: number): string {
  if (n === 1) return "1 produkt";
  if (n >= 2 && n <= 4) return `${n} produkty`;
  return `${n} produktů`;
}

function roomProductCount(room: JsonSchemaFormData["rooms"][number]): number {
  return new Set(room.rows.map((row) => row.product_pricing_id)).size;
}

function shouldHideProductTableProperty(prop: PropertyDefinition): boolean {
  const label = (prop["label-form"] ?? prop.Name ?? "").trim().toLowerCase();
  const code = (prop.Code ?? "").trim().toLowerCase();
  return label === "výrobce" || label === "vyrobce" || code === "manufacturer" || code === "vyrobce";
}

/**
 * Fields that are NEVER shared (always per-row):
 * - dimensions (width / height — physical size per window)
 * - quantity (`ks` — count per line)
 * - link fields (they structurally create linked sub-rows)
 */
function isFieldShareable(prop: PropertyDefinition): boolean {
  if (prop.DataType === "link") return false;
  if (prop.Code === KS_PROPERTY_CODE) return false;
  if (isDimensionPropertyCode(prop.Code)) return false;
  if (shouldHideProductTableProperty(prop)) return false;
  return true;
}

/** Non-empty value check — matches "user set this" semantics. */
function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

/** Get this room's shared values for a given product (empty map if none). */
function getSharedForProduct(
  room: { sharedValues?: Record<string, Record<string, string | number | boolean>> },
  pricingId: string
): Record<string, string | number | boolean> {
  return room.sharedValues?.[pricingId] ?? {};
}


/**
 * Build initial `data` for custom form; **rooms start empty** — user adds products per row.
 */
export function buildInitialFormData(
  headerSchema: ProductPayload,
  customerFromOrder?: { name?: string; email?: string; phone?: string; address?: string; city?: string }
): JsonSchemaFormData {
  const sectionInitialValues = (section: SectionBlock | undefined): Record<string, string | number | boolean> => {
    const out: Record<string, string | number | boolean> = {};
    if (!section) return out;
    section.Properties.forEach((prop) => {
      if (prop.Value !== undefined) out[prop.Code] = prop.Value;
      else if (prop.DataType === "boolean") out[prop.Code] = false;
      else if (prop.DataType === "numeric") out[prop.Code] = "";
      else out[prop.Code] = "";
    });
    return out;
  };
  return {
    name: customerFromOrder?.name ?? "",
    email: customerFromOrder?.email ?? "",
    phone: customerFromOrder?.phone ?? "",
    address: customerFromOrder?.address ?? "",
    city: customerFromOrder?.city ?? "",
    productCode: headerSchema.product_code,
    productName: resolveProductNameFromPayload(headerSchema),
    zahlaviValues: sectionInitialValues(headerSchema.zahlavi),
    zapatiValues: sectionInitialValues(headerSchema.zapati),
    rooms: [],
  };
}

const ROOM_PRESETS = ["Obývák", "Kuchyň", "Pracovna", "Chodba", "Ložnice", "Dětský pokoj", "Koupelna", "Jídelna"];

export interface DynamicProductFormProps {
  /** Záhlaví / zápatí + jejich enums — z prvního výběru katalogu; nemění se při jiných produktech */
  headerSchema: ProductPayload;
  productSchemas: Record<string, ProductPayload>;
  setProductSchemas: React.Dispatch<React.SetStateAction<Record<string, ProductPayload>>>;
  formData: JsonSchemaFormData;
  setFormData: React.Dispatch<React.SetStateAction<JsonSchemaFormData>>;
  /** Paste JSON bez katalogu — při prvním výběru produktu doplníme záhlaví/zápatí z katalogu */
  shouldPinHeaderToFirstProduct: boolean;
  onPinHeaderFromProduct: (payload: ProductPayload) => void;
  actionsFooter?: React.ReactNode;
  onSizeLimitErrorChange?: (hasError: boolean) => void;
  onWarrantyErrorChange?: (hasError: boolean) => void;
  onRequiredFieldsErrorChange?: (hasError: boolean) => void;
}

type PickerTarget =
  | { kind: "add"; roomId: string }
  | { kind: "switch"; roomId: string; rowId: string }
  | { kind: "bulk-switch"; roomId: string; pricingId: string };

type RowPricePreviewState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: RowPricePreview };

type ActivePricePreviewModal = {
  rowId: string;
  title: string;
};

export default function DynamicProductForm({
  headerSchema,
  productSchemas,
  setProductSchemas,
  formData,
  setFormData,
  shouldPinHeaderToFirstProduct,
  onPinHeaderFromProduct,
  actionsFooter,
  onSizeLimitErrorChange,
  onWarrantyErrorChange,
  onRequiredFieldsErrorChange,
}: DynamicProductFormProps) {
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const pickerTargetRef = useRef<PickerTarget | null>(null);
  pickerTargetRef.current = pickerTarget;
  const [switchLossOpen, setSwitchLossOpen] = useState(false);
  const [switchPending, setSwitchPending] = useState<{
    roomId: string;
    rowId: string;
    newPricingId: string;
    newPayload: ProductPayload;
    merged: Record<string, string | number | boolean>;
    lostFields: ReturnType<typeof mergeValuesForProductSwitch>["lostFields"];
    /** When set, confirms bulk-switch for all rows (keyed by rowId → merged values). */
    bulkMerged?: Record<string, Record<string, string | number | boolean>>;
    /** Old product pricing id being switched from (for shared-value cleanup). */
    oldPricingId?: string;
  } | null>(null);

  const headerPinnedRef = useRef(!shouldPinHeaderToFirstProduct);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;
  const productSchemasRef = useRef(productSchemas);
  productSchemasRef.current = productSchemas;

  const getRowSchema = useCallback(
    (row: CatalogFormRow): ProductPayload | undefined => productSchemas[row.product_pricing_id],
    [productSchemas]
  );

  const getPropertyLabelInSchema = useCallback((schema: ProductPayload, code: string): string => {
    const props = [
      ...(schema.form_body?.Properties ?? []),
      ...(schema.zahlavi?.Properties ?? []),
      ...(schema.zapati?.Properties ?? []),
    ] as PropertyDefinition[];
    const p = props.find((x) => x.Code === code);
    return (p?.["label-form"] ?? p?.Name ?? code).trim() || code;
  }, []);

  const [sizeLimitByRow, setSizeLimitByRow] = useState<Record<string, SizeLimitsResult>>({});
  const [pricePreviewByRow, setPricePreviewByRow] = useState<Record<string, RowPricePreviewState>>({});
  const [pricePreviewModal, setPricePreviewModal] = useState<ActivePricePreviewModal | null>(null);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("cs-CZ", {
        style: "currency",
        currency: "CZK",
        maximumFractionDigits: 0,
      }),
    []
  );

  const [basicInfoOpen, setBasicInfoOpen] = useState(true);
  const [zahlaviOpen, setZahlaviOpen] = useState(true);
  const [roomsOpen, setRoomsOpen] = useState(true);
  const [zapatiOpen, setZapatiOpen] = useState(true);
  /**
   * Expand state per (roomId, product_pricing_id) run. Default: collapsed.
   * When a run has any non-empty shared value, it is auto-expanded on first render
   * (see effect below) so existing bulk-edits are visible without user action.
   */
  const [bulkEditExpanded, setBulkEditExpanded] = useState<Record<string, boolean>>({});
  const bulkEditInitRef = useRef<Set<string>>(new Set());
  const [showAddRoomPanel, setShowAddRoomPanel] = useState(false);
  const [customRoomName, setCustomRoomName] = useState("");

  const getRowValuesForApi = useCallback((row: CatalogFormRow): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row.values)) {
      out[k] = v !== undefined && v !== null ? String(v).trim() : "";
    }
    return out;
  }, []);

  const getWidthHeightForRow = useCallback(
    (row: CatalogFormRow, rowSchema: ProductPayload): { width: number; height: number } | null => {
      const props = (rowSchema.form_body?.Properties ?? []) as PropertyDefinition[];
      const widthCode = props.find((p) => isWidthPropertyCode(p.Code))?.Code;
      const heightCode = props.find((p) => isHeightPropertyCode(p.Code))?.Code;
      if (!widthCode || !heightCode) return null;
      const rawW = row.values[widthCode];
      const rawH = row.values[heightCode];
      if (rawW === "" || rawH === "" || rawW == null || rawH == null) return null;
      const w = Number(rawW);
      const h = Number(rawH);
      if (Number.isNaN(w) || Number.isNaN(h) || w <= 0 || h <= 0) return null;
      return { width: w, height: h };
    },
    []
  );

  useEffect(() => {
    const timeouts = debounceRef.current;
    formData.rooms.forEach((room) => {
      room.rows.forEach((row) => {
        const rowSchema = getRowSchema(row);
        const pid = rowSchema?._product_pricing_id;
        if (!rowSchema || !pid) {
          setSizeLimitByRow((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
          return;
        }
        const dims = getWidthHeightForRow(row, rowSchema);
        if (!dims) {
          setSizeLimitByRow((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
          return;
        }
        if (timeouts[row.id]) clearTimeout(timeouts[row.id]);
        const rowId = row.id;
        timeouts[rowId] = setTimeout(() => {
          checkSizeLimits({
            product_pricing_id: pid,
            width: dims.width,
            height: dims.height,
            row_values: getRowValuesForApi(row),
          }).then((res) => {
            if (!res.success || !res.data) return;
            setSizeLimitByRow((prev) => ({ ...prev, [rowId]: res.data! }));
          });
          delete timeouts[rowId];
        }, SIZE_LIMITS_DEBOUNCE_MS);
      });
    });
    return () => {
      Object.values(timeouts).forEach((t) => clearTimeout(t));
      Object.keys(timeouts).forEach((k) => delete timeouts[k]);
    };
  }, [formData.rooms, getRowSchema, getWidthHeightForRow, getRowValuesForApi]);

  useEffect(() => {
    const hasManufacturingError = Object.values(sizeLimitByRow).some((r) => !r.in_manufacturing_range);
    const hasWarrantyError = Object.values(sizeLimitByRow).some(
      (r) => r.in_manufacturing_range && !r.in_warranty_range
    );
    onSizeLimitErrorChange?.(hasManufacturingError);
    onWarrantyErrorChange?.(hasWarrantyError);
  }, [sizeLimitByRow, onSizeLimitErrorChange, onWarrantyErrorChange]);

  // Auto-expand "Hromadné úpravy" for each (room, product) pair the first time we see it,
  // if it already has any non-empty shared value (e.g. loaded from persisted form_json).
  // We remember initialized keys so expanding → user collapses → we don't re-expand.
  useEffect(() => {
    const init = bulkEditInitRef.current;
    let changed = false;
    const next: Record<string, boolean> = {};
    for (const room of formData.rooms) {
      const productIds = new Set(room.rows.map((r) => r.product_pricing_id));
      for (const pid of productIds) {
        const key = `${room.id}:${pid}`;
        if (init.has(key)) continue;
        init.add(key);
        const shared = room.sharedValues?.[pid] ?? {};
        const hasAny = Object.values(shared).some((v) => {
          if (v === undefined || v === null) return false;
          if (typeof v === "string") return v.trim() !== "";
          return true;
        });
        if (hasAny) {
          next[key] = true;
          changed = true;
        }
      }
    }
    if (changed) {
      setBulkEditExpanded((prev) => ({ ...prev, ...next }));
    }
  }, [formData.rooms]);

  useEffect(() => {
    setPricePreviewByRow({});
    setPricePreviewModal(null);
  }, [formData.rooms]);

  const hasMissingRequired = useMemo(
    () => hasAnyMissingPriceAffectingFieldsMulti(formData.rooms, getRowSchema),
    [formData.rooms, getRowSchema]
  );

  useEffect(() => {
    onRequiredFieldsErrorChange?.(hasMissingRequired);
  }, [hasMissingRequired, onRequiredFieldsErrorChange]);

  const missingRequiredLines = useMemo(
    () => missingRequiredLinesMulti(formData.rooms, getRowSchema, getPropertyLabelInSchema),
    [formData.rooms, getRowSchema, getPropertyLabelInSchema]
  );
  const missingRequiredPreview = useMemo(() => missingRequiredLines.slice(0, 3), [missingRequiredLines]);
  const hiddenMissingRequiredCount = Math.max(0, missingRequiredLines.length - missingRequiredPreview.length);

  const handlePricePreview = useCallback(
    async (
      row: CatalogFormRow,
      rowSchema: ProductPayload,
      effectiveRequired: Set<string>
    ) => {
      const flat = catalogRowToFormRow(row);
      setPricePreviewModal({
        rowId: row.id,
        title: resolveProductNameFromPayload(rowSchema),
      });
      const missingCodes = Array.from(effectiveRequired).filter((code) =>
        isPriceAffectingFieldMissing(flat, code, rowSchema.dependencies)
      );
      if (missingCodes.length > 0) {
        const labels = missingCodes.map((code) => getPropertyLabelInSchema(rowSchema, code));
        setPricePreviewByRow((prev) => ({
          ...prev,
          [row.id]: { status: "error", error: `Doplňte pole: ${labels.join(", ")}` },
        }));
        return;
      }

      setPricePreviewByRow((prev) => ({ ...prev, [row.id]: { status: "loading" } }));
      const result = await getRowPricePreview({
        product_pricing_id: row.product_pricing_id,
        row_values: row.values,
        row_schema: rowSchema,
      });
      setPricePreviewByRow((prev) => ({
        ...prev,
        [row.id]: result.success && result.data
          ? { status: "success", data: result.data }
          : { status: "error", error: result.error ?? "Nepodařilo se načíst cenu." },
      }));
    },
    [getPropertyLabelInSchema]
  );

  const handleAddRoom = (name: string = "") => {
    setFormData((prev) => ({
      ...prev,
      rooms: [...prev.rooms, { id: generateId(), name, rows: [] }],
    }));
    setShowAddRoomPanel(false);
    setCustomRoomName("");
  };

  /** Add a row by copying all values from the last row of the same product in the room. */
  const handleAddRowForProduct = (roomId: string, pricingId: string) => {
    const schema = productSchemas[pricingId];
    if (!schema) return;
    const newRowId = generateId();
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => {
        if (r.id !== roomId) return r;
        // Find last row of this product to copy from.
        const lastRow = [...r.rows].reverse().find((x) => x.product_pricing_id === pricingId);
        const initialValues: Record<string, string | number | boolean> = lastRow
          ? { ...lastRow.values }
          : (() => {
              const empty = emptyValuesForProductSchema(schema);
              const shared = getSharedForProduct(r, pricingId);
              for (const [code, val] of Object.entries(shared)) {
                if (hasValue(val)) empty[code] = val;
              }
              return empty;
            })();
        const newRow: CatalogFormRow = {
          id: newRowId,
          product_pricing_id: pricingId,
          values: initialValues,
        };
        return { ...r, rows: [...r.rows, newRow] };
      }),
    }));
  };

  const handleDuplicateRoom = (roomId: string) => {
    setFormData((prev) => {
      const source = prev.rooms.find((r) => r.id === roomId);
      if (!source) return prev;
      const gidMap = new Map<string, string>();
      const newRows: CatalogFormRow[] = source.rows.map((row) => {
        const newRowId = generateId();
        let newGid = row.linkGroupId;
        if (row.linkGroupId) {
          if (!gidMap.has(row.linkGroupId)) gidMap.set(row.linkGroupId, generateId());
          newGid = gidMap.get(row.linkGroupId);
        }
        return {
          id: newRowId,
          product_pricing_id: row.product_pricing_id,
          values: { ...row.values },
          ...(newGid ? { linkGroupId: newGid } : {}),
        };
      });
      const newRoom: Room = {
        id: generateId(),
        name: source.name ? `${source.name} (kopie)` : "",
        rows: newRows,
        ...(source.sharedValues && { sharedValues: JSON.parse(JSON.stringify(source.sharedValues)) }),
      };
      return { ...prev, rooms: [...prev.rooms, newRoom] };
    });
  };

  const handleRemoveRoom = (roomId: string) => {
    if (!confirm("Opravdu chcete odstranit celou místnost včetně všech řádků?")) return;
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.filter((r) => r.id !== roomId),
    }));
  };

  const handleRoomNameChange = (roomId: string, name: string) => {
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.id === roomId ? { ...r, name } : r)),
    }));
  };

  const applyPickedProduct = (detail: PricingFormDetail) => {
    const target = pickerTargetRef.current;
    if (!target) return;
    const newPayload = productPayloadFromPricingDetail(detail.id, detail);
    const pricingId = newPayload._product_pricing_id!;

    if (target.kind === "add") {
      setProductSchemas((prev) => ({ ...prev, [pricingId]: newPayload }));
      const rowCount = formDataRef.current.rooms.reduce((n, r) => n + r.rows.length, 0);
      const isFirstRowOnForm = rowCount === 0;
      if (shouldPinHeaderToFirstProduct && isFirstRowOnForm && !headerPinnedRef.current) {
        headerPinnedRef.current = true;
        onPinHeaderFromProduct(newPayload);
        setFormData((prev) => ({
          ...prev,
          productCode: newPayload.product_code,
          productName: resolveProductNameFromPayload(newPayload),
          zahlaviValues: emptyZahlaviZapatiValues(newPayload.zahlavi),
          zapatiValues: emptyZahlaviZapatiValues(newPayload.zapati),
        }));
      }
      const newRowId = generateId();
      setFormData((prev) => ({
        ...prev,
        rooms: prev.rooms.map((r) => {
          if (r.id !== target.roomId) return r;
          // Initialize new row from shared defaults (only for shareable fields with a shared value).
          const empty = emptyValuesForProductSchema(newPayload);
          const shared = getSharedForProduct(r, pricingId);
          const initialValues: Record<string, string | number | boolean> = { ...empty };
          for (const [code, val] of Object.entries(shared)) {
            if (hasValue(val)) initialValues[code] = val;
          }
          const newRow: CatalogFormRow = {
            id: newRowId,
            product_pricing_id: pricingId,
            values: initialValues,
          };
          return { ...r, rows: [...r.rows, newRow] };
        }),
      }));
      setPickerTarget(null);
      return;
    }

    if (target.kind === "switch") {
      /** switch — use refs so async picker sees current rows */
      const fd = formDataRef.current;
      const room = fd.rooms.find((r) => r.id === target.roomId);
      const row = room?.rows.find((x) => x.id === target.rowId);
      const oldSchema = row ? productSchemasRef.current[row.product_pricing_id] : undefined;
      if (!row || !oldSchema) {
        setPickerTarget(null);
        return;
      }
      const { merged, lostFields } = mergeValuesForProductSwitch(oldSchema, newPayload, row.values);
      if (lostFields.length > 0) {
        setSwitchPending({
          roomId: target.roomId,
          rowId: target.rowId,
          newPricingId: pricingId,
          newPayload,
          merged,
          lostFields,
        });
        setSwitchLossOpen(true);
        setPickerTarget(null);
        return;
      }
      setProductSchemas((prev) => ({ ...prev, [pricingId]: newPayload }));
      setFormData((prev) => ({
        ...prev,
        rooms: prev.rooms.map((r) => {
          if (r.id !== target.roomId) return r;
          return {
            ...r,
            rows: r.rows.map((x) =>
              x.id === target.rowId
                ? { id: x.id, product_pricing_id: pricingId, values: merged, linkGroupId: x.linkGroupId }
                : x
            ),
          };
        }),
      }));
      setPickerTarget(null);
      return;
    }

    /* bulk-switch: change ALL rows of a given product in a room to a new product. */
    if (target.kind === "bulk-switch") {
    const fd = formDataRef.current;
    const room = fd.rooms.find((r) => r.id === target.roomId);
    if (!room) { setPickerTarget(null); return; }
    const affectedRows = room.rows.filter((r) => r.product_pricing_id === target.pricingId);
    const oldSchema = productSchemasRef.current[target.pricingId];
    if (affectedRows.length === 0 || !oldSchema) { setPickerTarget(null); return; }

    // Merge every affected row
    const bulkMerged: Record<string, Record<string, string | number | boolean>> = {};
    let allLostFields: ReturnType<typeof mergeValuesForProductSwitch>["lostFields"] = [];
    for (const row of affectedRows) {
      const { merged: m, lostFields: l } = mergeValuesForProductSwitch(oldSchema, newPayload, row.values);
      bulkMerged[row.id] = m;
      // Collect unique lost fields across all rows
      for (const lf of l) {
        if (!allLostFields.some((x) => x.code === lf.code)) allLostFields.push(lf);
      }
    }

    if (allLostFields.length > 0) {
      setSwitchPending({
        roomId: target.roomId,
        rowId: affectedRows[0].id, // representative row for the modal
        newPricingId: pricingId,
        newPayload,
        merged: bulkMerged[affectedRows[0].id],
        lostFields: allLostFields,
        bulkMerged,
        oldPricingId: target.pricingId,
      });
      setSwitchLossOpen(true);
      setPickerTarget(null);
      return;
    }

    // No lost fields: apply immediately
    setProductSchemas((prev) => ({ ...prev, [pricingId]: newPayload }));
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => {
        if (r.id !== target.roomId) return r;
        const nextRows = r.rows.map((x) => {
          const m = bulkMerged[x.id];
          return m
            ? { id: x.id, product_pricing_id: pricingId, values: m, linkGroupId: x.linkGroupId }
            : x;
        });
        // Clean up shared values: remove old product's shared values, reset overrides for affected rows
        const nextSharedValues = { ...(r.sharedValues ?? {}) };
        delete nextSharedValues[target.pricingId];
        return { ...r, rows: nextRows, sharedValues: nextSharedValues };
      }),
    }));
    setPickerTarget(null);
    }

    setPickerTarget(null);
  };  // end applyPickedProduct

  const confirmSwitchLoss = () => {
    if (!switchPending) return;
    const p = switchPending;
    setProductSchemas((prev) => ({ ...prev, [p.newPricingId]: p.newPayload }));

    if (p.bulkMerged) {
      // Bulk switch: apply merged values to all affected rows
      setFormData((prev) => ({
        ...prev,
        rooms: prev.rooms.map((r) => {
          if (r.id !== p.roomId) return r;
          const nextRows = r.rows.map((x) => {
            const m = p.bulkMerged![x.id];
            return m
              ? { id: x.id, product_pricing_id: p.newPricingId, values: m, linkGroupId: x.linkGroupId }
              : x;
          });
          const nextSharedValues = { ...(r.sharedValues ?? {}) };
          if (p.oldPricingId) delete nextSharedValues[p.oldPricingId];
          return { ...r, rows: nextRows, sharedValues: nextSharedValues };
        }),
      }));
    } else {
      // Single-row switch
      setFormData((prev) => ({
        ...prev,
        rooms: prev.rooms.map((r) => {
          if (r.id !== p.roomId) return r;
          return {
            ...r,
            rows: r.rows.map((x) =>
              x.id === p.rowId
                ? { id: x.id, product_pricing_id: p.newPricingId, values: p.merged, linkGroupId: x.linkGroupId }
                : x
            ),
          };
        }),
      }));
    }

    setSwitchPending(null);
    setSwitchLossOpen(false);
  };

  const handleDuplicateRow = (roomId: string, rowId: string) => {
    setFormData((prev) => {
      const room = prev.rooms.find((r) => r.id === roomId);
      if (!room) return prev;
      const idx = room.rows.findIndex((x) => x.id === rowId);
      if (idx < 0) return prev;
      const source = room.rows[idx];
      const groupId = source.linkGroupId;
      if (groupId) {
        const indices = room.rows
          .map((r, i) => (r.linkGroupId === groupId ? i : -1))
          .filter((i) => i >= 0)
          .sort((a, b) => a - b);
        const newGroupId = generateId();
        const newRows = [...room.rows];
        const insertAt = Math.max(...indices) + 1;
        const clones: CatalogFormRow[] = indices.map((i) => {
          const r = room.rows[i];
          const newRowId = generateId();
          return {
            id: newRowId,
            product_pricing_id: r.product_pricing_id,
            values: { ...r.values },
            linkGroupId: newGroupId,
          };
        });
        newRows.splice(insertAt, 0, ...clones);
        return {
          ...prev,
          rooms: prev.rooms.map((r) =>
            r.id === roomId ? { ...r, rows: newRows } : r
          ),
        };
      }
      const cloneId = generateId();
      const clone: CatalogFormRow = {
        id: cloneId,
        product_pricing_id: source.product_pricing_id,
        values: { ...source.values },
      };
      const newRows = [...room.rows.slice(0, idx + 1), clone, ...room.rows.slice(idx + 1)];
      return {
        ...prev,
        rooms: prev.rooms.map((r) =>
          r.id === roomId ? { ...r, rows: newRows } : r
        ),
      };
    });
  };

  const handleRemoveRow = (roomId: string, rowId: string) => {
    if (!confirm("Opravdu chcete odstranit tento řádek?")) return;
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => {
        if (r.id !== roomId) return r;
        const row = r.rows.find((x) => x.id === rowId);
        if (!row) return r;
        const gid = row.linkGroupId;
        const rows = gid
          ? r.rows.filter((x) => x.linkGroupId !== gid)
          : r.rows.filter((x) => x.id !== rowId);
        return { ...r, rows };
      }),
    }));
  };

  const handleZahlaviChange = (propertyCode: string, value: string | number | boolean) => {
    setFormData((prev) => ({
      ...prev,
      zahlaviValues: { ...prev.zahlaviValues, [propertyCode]: value },
    }));
  };

  const handleZapatiChange = (propertyCode: string, value: string | number | boolean) => {
    setFormData((prev) => ({
      ...prev,
      zapatiValues: { ...prev.zapatiValues, [propertyCode]: value },
    }));
  };

  const handleRowChange = (
    roomId: string,
    rowId: string,
    propertyCode: string,
    value: string | number | boolean,
    rowSchema: ProductPayload
  ) => {
    const formBodyProperties = (rowSchema.form_body?.Properties ?? []) as PropertyDefinition[];
    const linkPropertyCodes = formBodyProperties.filter((p) => p.DataType === "link").map((p) => p.Code);

    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room) => {
        if (room.id !== roomId) return room;
        const idx = room.rows.findIndex((r) => r.id === rowId);
        if (idx < 0) return room;
        const row = room.rows[idx];
        const prevValue = row.values[propertyCode];
        let updatedValues = { ...row.values, [propertyCode]: value };
        let updatedRow: CatalogFormRow = { ...row, values: updatedValues };
        let flat = catalogRowToFormRow(updatedRow);

        const affectedDeps = (rowSchema.dependencies ?? []).filter((d) => d.source_enum === propertyCode);
        for (const dep of affectedDeps) {
          const targetProp = formBodyProperties.find((p) => p.Code === dep.target_property);
          if (!targetProp || targetProp.DataType !== "enum") continue;
          const opts = getEnumOptionsForRow(rowSchema, dep.target_property, flat);
          if (opts.length === 1) {
            updatedValues[dep.target_property] = opts[0].code;
          } else {
            const currentVal = String(updatedValues[dep.target_property] ?? "");
            if (currentVal && !opts.some((o) => o.code === currentVal)) {
              updatedValues[dep.target_property] = "";
            }
          }
        }
        updatedRow = { ...row, values: updatedValues };
        flat = catalogRowToFormRow(updatedRow);

        let rows = [...room.rows];

        if (linkPropertyCodes.includes(propertyCode)) {
          const turnedOn = !prevValue && Boolean(value);
          const turnedOff = Boolean(prevValue) && !value;
          if (turnedOn) {
            const groupId = row.linkGroupId || generateId();
            updatedRow = { ...updatedRow, linkGroupId: groupId };
            rows[idx] = updatedRow;
            const emptyChild: CatalogFormRow = {
              id: generateId(),
              product_pricing_id: row.product_pricing_id,
              values: emptyValuesForProductSchema(rowSchema),
              linkGroupId: groupId,
            };
            rows.splice(idx + 1, 0, emptyChild);
            return { ...room, rows,  };
          }
          if (turnedOff && row.linkGroupId) {
            const groupId = row.linkGroupId;
            updatedRow = { ...updatedRow, linkGroupId: undefined };
            rows[idx] = updatedRow;
            rows = rows.filter((r) => !(r.linkGroupId === groupId && r.id !== rowId));
            return { ...room, rows,  };
          }
        }

        rows[idx] = updatedRow;
        return { ...room, rows,  };
      }),
    }));
  };

  /**
   * Set a shared value for a (room, product) pair and propagate it to all non-overridden rows
   * of that product in that room. Also runs dependency cascades per affected row.
   */
  const handleSharedChange = (
    roomId: string,
    pricingId: string,
    propertyCode: string,
    value: string | number | boolean,
    rowSchema: ProductPayload
  ) => {
    const formBodyProperties = (rowSchema.form_body?.Properties ?? []) as PropertyDefinition[];
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room) => {
        if (room.id !== roomId) return room;

        // 1. Update shared values map
        const nextSharedForProduct = {
          ...(room.sharedValues?.[pricingId] ?? {}),
          [propertyCode]: value,
        };
        const nextSharedValues = {
          ...(room.sharedValues ?? {}),
          [pricingId]: nextSharedForProduct,
        };

        // 2. Propagate to non-overridden rows of this product (including clearing to empty)
        const nextRows: CatalogFormRow[] = room.rows.map((row) => {
          if (row.product_pricing_id !== pricingId) return row;

          const updatedValues = { ...row.values, [propertyCode]: value };

          // Cascade dependencies within the row (same logic as handleRowChange)
          const affectedDeps = (rowSchema.dependencies ?? []).filter((d) => d.source_enum === propertyCode);
          for (const dep of affectedDeps) {
            const targetProp = formBodyProperties.find((p) => p.Code === dep.target_property);
            if (!targetProp || targetProp.DataType !== "enum") continue;
            const tmpRow: CatalogFormRow = { ...row, values: updatedValues };
            const flat = catalogRowToFormRow(tmpRow);
            const opts = getEnumOptionsForRow(rowSchema, dep.target_property, flat);
            if (opts.length === 1) {
              updatedValues[dep.target_property] = opts[0].code;
            } else {
              const currentVal = String(updatedValues[dep.target_property] ?? "");
              if (currentVal && !opts.some((o) => o.code === currentVal)) {
                updatedValues[dep.target_property] = "";
              }
            }
          }
          return { ...row, values: updatedValues };
        });

        return {
          ...room,
          rows: nextRows,
          sharedValues: nextSharedValues,
        };
      }),
    }));
  };

  const getEnumOptions = (schema: ProductPayload, propertyCode: string, groupKey?: string): EnumValue[] => {
    const entry = schema.enums[propertyCode] as EnumEntry | undefined;
    if (!entry) return [];
    let list: EnumValue[] | undefined;
    if (groupKey && Array.isArray(entry[groupKey])) {
      list = entry[groupKey] as EnumValue[];
    } else {
      list = entry.default;
    }
    const raw = list ?? [];
    return raw.filter((opt) => opt.active !== false);
  };

  const getEnumOptionsForRow = (
    schema: ProductPayload,
    propertyCode: string,
    flatRow: ReturnType<typeof catalogRowToFormRow>
  ): EnumValue[] => {
    let options = getEnumOptions(schema, propertyCode);
    const deps = schema.dependencies?.filter((d) => d.target_property === propertyCode) ?? [];
    for (const dep of deps) {
      if (flatRow[dep.source_enum] !== dep.source_value) continue;
      if (Array.isArray(dep.allowed_values) && dep.allowed_values.length > 0) {
        const allowedSet = new Set(dep.allowed_values);
        options = options.filter((opt) => allowedSet.has(opt.code));
        break;
      }
    }
    return options;
  };

  const renderFormField = (
    schema: ProductPayload,
    property: PropertyDefinition,
    value: string | number | boolean,
    onChange: (value: string | number | boolean) => void,
    context?: { flatRow: ReturnType<typeof catalogRowToFormRow> }
  ) => {
    const disabled = context?.flatRow
      ? isRowFieldDisabledByDependency(context.flatRow, property.Code, schema.dependencies)
      : false;
    const disabledClass = disabled
      ? "cursor-not-allowed opacity-60 bg-zinc-100 dark:bg-zinc-800"
      : "";

    if (property.DataType === "enum") {
      const options = context?.flatRow
        ? getEnumOptionsForRow(schema, property.Code, context.flatRow)
        : getEnumOptions(schema, property.Code);
      const currentCode = String(value);
      return (
        <SearchableSelect
          value={currentCode}
          options={options}
          onChange={(v) => !disabled && onChange(v)}
          disabled={disabled}
          className={disabledClass}
        />
      );
    }

    if (property.DataType === "boolean" || property.DataType === "link") {
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className={`h-4 w-4 rounded border-zinc-300 text-accent focus:ring-accent ${disabledClass}`}
        />
      );
    }

    if (property.DataType === "numeric") {
      return (
        <input
          type="number"
          inputMode="decimal"
          value={String(value)}
          onChange={(e) => !disabled && onChange(e.target.value)}
          disabled={disabled}
          className={`min-w-[3rem] w-full rounded border-0 bg-transparent px-1 py-1 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 md:text-xs ${disabledClass}`}
          placeholder="číslo"
        />
      );
    }

    if (property.DataType === "textarea") {
      return (
        <textarea
          value={String(value)}
          onChange={(e) => !disabled && onChange(e.target.value)}
          disabled={disabled}
          rows={2}
          className={`min-w-[8rem] w-full resize-y rounded border-0 bg-transparent px-1 py-1 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 md:text-xs ${disabledClass}`}
          placeholder="text"
        />
      );
    }

    return (
      <input
        type="text"
        value={String(value)}
        onChange={(e) => !disabled && onChange(e.target.value)}
        disabled={disabled}
        className={`min-w-[4rem] w-full rounded border-0 bg-transparent px-1 py-1 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 md:text-xs ${disabledClass}`}
        placeholder="text"
      />
    );
  };

  const getPropertyLabel = (prop: PropertyDefinition): string => prop["label-form"] ?? prop.Name;

  return (
    <div className="space-y-6">
      <ProductPickerModal
        open={pickerTarget !== null}
        title={
          pickerTarget?.kind === "bulk-switch"
            ? "Vyberte nový produkt pro všechny řádky"
            : pickerTarget?.kind === "switch"
              ? "Vyberte nový produkt"
              : "Vyberte produkt (řádek)"
        }
        onClose={() => setPickerTarget(null)}
        onPicked={(detail) => applyPickedProduct(detail)}
      />
      <ProductSwitchLossModal
        open={switchLossOpen}
        lostFields={switchPending?.lostFields ?? []}
        onCancel={() => {
          setSwitchLossOpen(false);
          setSwitchPending(null);
        }}
        onConfirm={confirmSwitchLoss}
      />
      <PricePreviewModal
        open={pricePreviewModal !== null}
        title={pricePreviewModal?.title ?? ""}
        previewState={pricePreviewModal ? pricePreviewByRow[pricePreviewModal.rowId] ?? null : null}
        currencyFormatter={currencyFormatter}
        onClose={() => setPricePreviewModal(null)}
      />

      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <button
          type="button"
          onClick={() => setBasicInfoOpen((o) => !o)}
          className="mb-4 flex w-full items-center justify-between text-left text-xl font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Základní informace
          <span className="text-sm font-normal text-zinc-500">{basicInfoOpen ? "▼" : "▶"}</span>
        </button>
        {basicInfoOpen && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Jméno</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Telefon</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Adresa</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Město</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Produkt (hlavička)
              </label>
              <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300">
                {formData.productName || formData.productCode || "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Z prvního výběru katalogu; řádky mohou mít jiné produkty.</p>
            </div>
          </div>
        )}
      </div>

      {headerSchema.zahlavi && headerSchema.zahlavi.Properties.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setZahlaviOpen((o) => !o)}
            className="mb-4 flex w-full items-center justify-between text-left text-xl font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Záhlaví (zahlavi)
            <span className="text-sm font-normal text-zinc-500">{zahlaviOpen ? "▼" : "▶"}</span>
          </button>
          {zahlaviOpen && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(headerSchema.zahlavi.Properties as PropertyDefinition[]).map((prop) => (
                <div key={prop.ID}>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {getPropertyLabel(prop)}
                  </label>
                  <div className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700">
                    {renderFormField(
                      headerSchema,
                      prop,
                      formData.zahlaviValues[prop.Code] ?? "",
                      (value) => handleZahlaviChange(prop.Code, value)
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <button
          type="button"
          onClick={() => setRoomsOpen((o) => !o)}
          className="mb-4 flex w-full items-center justify-between text-left text-xl font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Místnosti
          <span className="text-sm font-normal text-zinc-500">{roomsOpen ? "▼" : "▶"}</span>
        </button>
        {roomsOpen && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Přidejte místnost, poté produktové řádky přes „Přidat produkt“. Stejný produkt vedle sebe se zobrazí v
                jedné tabulce; „Duplikovat řádek“ přidá další řádek do ní.
              </p>
              <button
                type="button"
                onClick={() => setShowAddRoomPanel((v) => !v)}
                className="min-h-[44px] rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white"
              >
                Přidat místnost
              </button>
            </div>

            {showAddRoomPanel && (
              <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-700/50">
                <div className="mb-3 flex flex-wrap gap-2">
                  {ROOM_PRESETS.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleAddRoom(name)}
                      className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customRoomName}
                    onChange={(e) => setCustomRoomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customRoomName.trim()) {
                        e.preventDefault();
                        handleAddRoom(customRoomName.trim());
                      }
                    }}
                    className="min-h-[44px] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                    placeholder="Vlastní název…"
                  />
                  <button
                    type="button"
                    onClick={() => customRoomName.trim() && handleAddRoom(customRoomName.trim())}
                    disabled={!customRoomName.trim()}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Přidat
                  </button>
                </div>
              </div>
            )}

            {hasMissingRequired && missingRequiredLines.length > 0 && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/30 dark:text-red-100"
              >
                <p className="font-semibold">Některé řádky ještě nejsou připravené pro výpočet ceny.</p>
                <p className="mt-1 text-xs text-red-800/80 dark:text-red-200/80">
                  Chybějící buňky zůstávají přímo zvýrazněné v tabulce. Přehled níže ukazuje jen první problematické
                  řádky.
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                  {missingRequiredPreview.map((line, idx) => (
                    <li key={`req-${idx}`}>{line}</li>
                  ))}
                </ul>
                {hiddenMissingRequiredCount > 0 ? (
                  <p className="mt-2 text-xs font-medium text-red-800/80 dark:text-red-200/80">
                    A další {czechRowCountLabel(hiddenMissingRequiredCount)} v tabulce.
                  </p>
                ) : null}
              </div>
            )}

            {formData.rooms.length === 0 ? (
              <p className="text-center text-zinc-500">Přidejte místnost a k ní produktové řádky.</p>
            ) : (
              <div className="space-y-8">
                {formData.rooms.map((room) => (
                  <div
                    key={room.id}
                    className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <div className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-4 dark:border-zinc-700 dark:bg-zinc-700/30">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <input
                            type="text"
                            value={room.name}
                            onChange={(e) => handleRoomNameChange(room.id, e.target.value)}
                            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-800"
                            placeholder="Název místnosti"
                          />
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-700">
                              {czechRowCountLabel(room.rows.length)}
                            </span>
                            <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-700">
                              {czechProductCountLabel(roomProductCount(room))}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setPickerTarget({ kind: "add", roomId: room.id })}
                            className="min-h-[40px] rounded-md border border-primary bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
                          >
                            Přidat produkt
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateRoom(room.id)}
                            className="min-h-[40px] rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                          >
                            Duplikovat místnost
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRoom(room.id)}
                            className="min-h-[40px] rounded-md border border-red-300 px-4 py-2 text-sm text-red-600"
                          >
                            Smazat místnost
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 p-4">
                      {room.rows.length === 0 ? (
                        <p className="text-sm text-zinc-500">Žádné řádky — použijte „Přidat produkt“.</p>
                      ) : (
                        groupRoomRowsIntoRuns(room.rows, productSchemas).map((run, runIdx) => {
                          if (run.kind === "missing") {
                            const { row } = run;
                            return (
                              <div
                                key={row.id}
                                className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
                              >
                                Chybí šablona produktu pro ID „{row.product_pricing_id}“ — vyberte produkt znovu.
                              </div>
                            );
                          }

                          const { rows: runRows, schema: rowSchema } = run;
                          const props = (rowSchema.form_body?.Properties ?? []) as PropertyDefinition[];
                          const visibleProps = props.filter((prop) => !shouldHideProductTableProperty(prop));
                          const shareableProps = visibleProps.filter(isFieldShareable);
                          const codes = visibleProps.map((p) => p.Code);
                          const effectiveRequired = buildEffectiveRequiredFieldCodes(
                            codes,
                            rowSchema.price_affecting_enums,
                            rowSchema.required_properties
                          );
                          const samplePid = runRows[0].product_pricing_id;
                          const groupKey = `${room.id}-${samplePid}-${runIdx}`;
                          const sharedValuesForProduct = getSharedForProduct(room, samplePid);
                          // Pseudo-row from shared values for dependency evaluation in the shared-row UI.
                          const sharedFlatRow = {
                            id: `__shared__:${samplePid}`,
                            ...sharedValuesForProduct,
                          } as ReturnType<typeof catalogRowToFormRow>;
                          const rowsWithMissingRequired = runRows.filter((row) =>
                            visibleProps.some((prop) => {
                              if (!effectiveRequired.has(prop.Code)) return false;
                              return isPriceAffectingFieldMissing(
                                catalogRowToFormRow(row),
                                prop.Code,
                                rowSchema.dependencies
                              );
                            })
                          ).length;

                          const anyOutM = runRows.some(
                            (r) => sizeLimitByRow[r.id] && !sizeLimitByRow[r.id]!.in_manufacturing_range
                          );
                          const anyOutW = runRows.some((r) => {
                            const lim = sizeLimitByRow[r.id];
                            return lim && lim.in_manufacturing_range && !lim.in_warranty_range;
                          });
                          // Bulk-edit (Hromadné úpravy) toggle state and indicators.
                          const bulkKey = `${room.id}:${samplePid}`;
                          const bulkOpen = bulkEditExpanded[bulkKey] === true;
                          const sharedFieldsSetCount = shareableProps.filter((p) =>
                            hasValue(sharedValuesForProduct[p.Code])
                          ).length;
                          const canBulkEdit = shareableProps.length > 0;

                          return (
                            <div
                              key={groupKey}
                              className={`rounded-xl border ${
                                anyOutM
                                  ? "border-red-300 bg-red-50/30 dark:border-red-800 dark:bg-red-950/15"
                                  : anyOutW
                                    ? "border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/15"
                                    : "border-zinc-200 dark:border-zinc-700"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                    {resolveProductNameFromPayload(rowSchema)}
                                    {runRows.length > 1 ? (
                                      <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">
                                        ({czechRowCountLabel(runRows.length)})
                                      </span>
                                    ) : null}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => handleAddRowForProduct(room.id, samplePid)}
                                    className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                                  >
                                    + Přidat řádek
                                  </button>
                                  {bulkOpen && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPickerTarget({
                                          kind: "bulk-switch",
                                          roomId: room.id,
                                          pricingId: samplePid,
                                        })
                                      }
                                      className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-indigo-300 bg-white px-3 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 dark:border-indigo-700 dark:bg-zinc-800 dark:text-indigo-200 dark:hover:bg-indigo-950/30"
                                    >
                                      Změnit produkt pro všechny
                                    </button>
                                  )}
                                  {anyOutM ? (
                                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700 dark:bg-red-950/40 dark:text-red-200">
                                      Mimo výrobu
                                    </span>
                                  ) : anyOutW ? (
                                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                                      Mimo záruku
                                    </span>
                                  ) : null}
                                  {canBulkEdit && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setBulkEditExpanded((prev) => ({ ...prev, [bulkKey]: !bulkOpen }))
                                      }
                                      aria-expanded={bulkOpen}
                                      aria-label={
                                        bulkOpen
                                          ? "Skrýt hromadné úpravy"
                                          : "Zobrazit hromadné úpravy"
                                      }
                                      className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                        bulkOpen
                                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                          : "border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-zinc-800 dark:text-indigo-200 dark:hover:bg-indigo-950/30"
                                      }`}
                                    >
                                      <span>Hromadné úpravy</span>
                                      {!bulkOpen && sharedFieldsSetCount > 0 ? (
                                        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
                                          {sharedFieldsSetCount}
                                        </span>
                                      ) : null}
                                      <span aria-hidden="true" className="text-[10px] leading-none">
                                        {bulkOpen ? "▲" : "▼"}
                                      </span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="overflow-x-auto px-4 py-3">
                                <table className="w-full min-w-max border-separate border-spacing-0 text-xs">
                                  <thead>
                                    <tr className="bg-zinc-50 dark:bg-zinc-800/80">
                                      {visibleProps.map((prop) => {
                                        const req = effectiveRequired.has(prop.Code);
                                        return (
                                          <th
                                            key={prop.ID}
                                            className="border border-zinc-200 px-2 py-2 text-left font-medium text-zinc-600 first:rounded-l-md dark:border-zinc-700 dark:text-zinc-300"
                                          >
                                            {req ? (
                                              <span className="text-red-600 dark:text-red-400">* </span>
                                            ) : null}
                                            {getPropertyLabel(prop)}
                                          </th>
                                        );
                                      })}
                                      <th className="min-w-[10rem] rounded-r-md border border-l-0 border-zinc-200 px-2 py-2 text-left font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                                        Akce
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {canBulkEdit && bulkOpen && (
                                      <tr className="bg-indigo-50/80 dark:bg-indigo-950/20">
                                        {visibleProps.map((prop) => {
                                          const shareable = isFieldShareable(prop);
                                          if (!shareable) {
                                            return (
                                              <td
                                                key={prop.ID}
                                                className="border-b border-indigo-200/70 px-1 py-2 align-top text-center text-[11px] text-indigo-300 dark:border-indigo-900 dark:text-indigo-700"
                                                title="Toto pole je vždy specifické pro jednotlivé řádky"
                                              >
                                                —
                                              </td>
                                            );
                                          }
                                          const currentSharedValue = sharedValuesForProduct[prop.Code] ?? "";
                                          return (
                                            <td
                                              key={prop.ID}
                                              className="border-b border-indigo-200/70 bg-indigo-50 px-1 py-2 align-top dark:border-indigo-900 dark:bg-indigo-950/30"
                                            >
                                              {renderFormField(
                                                rowSchema,
                                                prop,
                                                currentSharedValue,
                                                (v) => handleSharedChange(room.id, samplePid, prop.Code, v, rowSchema),
                                                { flatRow: sharedFlatRow }
                                              )}
                                            </td>
                                          );
                                        })}
                                        <td className="border-b border-indigo-200/70 bg-indigo-50 px-2 py-2 align-top dark:border-indigo-900 dark:bg-indigo-950/30">
                                          <div className="flex flex-col gap-0.5">
                                            <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                                              Společné
                                            </span>
                                            <span className="text-[10px] leading-tight text-indigo-600/80 dark:text-indigo-400/80">
                                              Hodnoty se propíší do řádků níže.
                                            </span>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                    {runRows.map((row) => {
                                      const flat = catalogRowToFormRow(row);
                                      const limit = sizeLimitByRow[row.id];
                                      const previewState = pricePreviewByRow[row.id];
                                      const isPreviewLoading =
                                        pricePreviewModal?.rowId === row.id && previewState?.status === "loading";
                                      const outM = limit && !limit.in_manufacturing_range;
                                      const outW = limit && limit.in_manufacturing_range && !limit.in_warranty_range;
                                      const rowTone = outM
                                        ? "bg-red-50/60 dark:bg-red-950/20"
                                        : outW
                                          ? "bg-amber-50/50 dark:bg-amber-950/15"
                                          : "bg-transparent";

                                      return (
                                        <tr key={row.id} className={rowTone}>
                                          {visibleProps.map((prop) => {
                                            const missing =
                                              effectiveRequired.has(prop.Code) &&
                                              isPriceAffectingFieldMissing(
                                                flat,
                                                prop.Code,
                                                rowSchema.dependencies
                                              );
                                            return (
                                              <td
                                                key={prop.ID}
                                                className={`border-b border-zinc-200 px-1 py-2 align-top dark:border-zinc-700 ${
                                                  missing ? "ring-2 ring-red-500 ring-offset-1" : ""
                                                }`}
                                              >
                                                {renderFormField(
                                                  rowSchema,
                                                  prop,
                                                  row.values[prop.Code] ?? "",
                                                  (v) => handleRowChange(room.id, row.id, prop.Code, v, rowSchema),
                                                  { flatRow: flat }
                                                )}
                                              </td>
                                            );
                                          })}
                                          <td className="border-b border-zinc-200 px-2 py-2 align-top dark:border-zinc-700">
                                            <div className="flex flex-wrap gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => handlePricePreview(row, rowSchema, effectiveRequired)}
                                                aria-label="Zobrazit náhled ceny pro tento řádek"
                                                disabled={isPreviewLoading}
                                                className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                                              >
                                                {isPreviewLoading ? "Načítám..." : "Cena"}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setPickerTarget({ kind: "switch", roomId: room.id, rowId: row.id })
                                                }
                                                aria-label="Změnit produkt pro tento řádek"
                                                className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                              >
                                                Změnit
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleRemoveRow(room.id, row.id)}
                                                aria-label="Odstranit tento řádek"
                                                className="rounded-md border border-red-300 px-2.5 py-1.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
                                              >
                                                Smazat
                                              </button>
                                            </div>
                                            {(outM || outW) && limit ? (
                                              <p
                                                className={`mt-2 text-[10px] leading-tight ${outM ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-200"}`}
                                              >
                                                {outM
                                                  ? `Rozměr je mimo výrobu (${limit.mezni_sirka_min}–${limit.mezni_sirka_max} × ${limit.mezni_vyska_min}–${limit.mezni_vyska_max}).`
                                                  : "Rozměr je mimo záruční rozsah."}
                                              </p>
                                            ) : null}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {headerSchema.zapati && headerSchema.zapati.Properties.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setZapatiOpen((o) => !o)}
            className="mb-4 flex w-full items-center justify-between text-left text-xl font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Zápatí (zapati)
            <span className="text-sm font-normal text-zinc-500">{zapatiOpen ? "▼" : "▶"}</span>
          </button>
          {zapatiOpen && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(headerSchema.zapati.Properties as PropertyDefinition[]).map((prop) => (
                <div key={prop.ID}>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {getPropertyLabel(prop)}
                  </label>
                  <div className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700">
                    {renderFormField(
                      headerSchema,
                      prop,
                      formData.zapatiValues[prop.Code] ?? "",
                      (value) => handleZapatiChange(prop.Code, value)
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {actionsFooter && <div className="flex flex-wrap gap-2">{actionsFooter}</div>}
    </div>
  );
}

function emptyZahlaviZapatiValues(section: SectionBlock | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!section?.Properties) return out;
  for (const prop of section.Properties as PropertyDefinition[]) {
    if (prop.Value !== undefined) out[prop.Code] = prop.Value;
    else if (prop.DataType === "boolean") out[prop.Code] = false;
    else if (prop.DataType === "numeric") out[prop.Code] = "";
    else out[prop.Code] = "";
  }
  return out;
}
