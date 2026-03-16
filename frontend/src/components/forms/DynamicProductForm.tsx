"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import type {
  ProductPayload,
  JsonSchemaFormData,
  FormRow,
  PropertyDefinition,
  SectionBlock,
  EnumValue,
  EnumEntry,
} from "@/types/json-schema-form.types";
import { checkSizeLimits, type SizeLimitsResult } from "@/lib/size-limits-api";

/** Property codes for width/height (same order as backend); first match in form_body is used */
const WIDTH_CODES = ["ovl_sirka", "width", "Sirka", "sirka", "šířka"];
const HEIGHT_CODES = ["ovl_vyska", "height", "Vyska", "vyska", "výška"];
const SIZE_LIMITS_DEBOUNCE_MS = 400;

/** Generate unique ID for rows/rooms */
function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Build initial form data from payload; optionally prefill customer from order.
 */
export function buildInitialFormData(
  payload: ProductPayload,
  customerFromOrder?: { name?: string; email?: string; phone?: string; address?: string; city?: string }
): JsonSchemaFormData {
  const formBodyProperties = (payload.form_body?.Properties ?? []) as PropertyDefinition[];
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
  const createEmptyRow = (): FormRow => {
    const row: FormRow = { id: generateId() };
    formBodyProperties.forEach((prop) => {
      if (prop.Value !== undefined) row[prop.Code] = prop.Value;
      else if (prop.DataType === "boolean") row[prop.Code] = false;
      else if (prop.DataType === "numeric") row[prop.Code] = "";
      else row[prop.Code] = "";
    });
    return row;
  };
  return {
    name: customerFromOrder?.name ?? "",
    email: customerFromOrder?.email ?? "",
    phone: customerFromOrder?.phone ?? "",
    address: customerFromOrder?.address ?? "",
    city: customerFromOrder?.city ?? "",
    productCode: payload.product_code,
    productName:
      payload.form_body?.Name ?? payload.zahlavi?.Name ?? payload.zapati?.Name ?? payload.product_code,
    zahlaviValues: sectionInitialValues(payload.zahlavi),
    zapatiValues: sectionInitialValues(payload.zapati),
    rooms: [],
  };
}

/** Common room name presets */
const ROOM_PRESETS = ["Obývák", "Kuchyň", "Pracovna", "Chodba", "Ložnice", "Dětský pokoj", "Koupelna", "Jídelna"];

export interface DynamicProductFormProps {
  payload: ProductPayload;
  formData: JsonSchemaFormData;
  setFormData: React.Dispatch<React.SetStateAction<JsonSchemaFormData>>;
  /** Rendered after the zapati section (e.g. Submit button) */
  actionsFooter?: React.ReactNode;
  /** Called when any row is outside manufacturing range (true = block submit) */
  onSizeLimitErrorChange?: (hasError: boolean) => void;
  /** Called when any row is outside warranty range but inside manufacturing range */
  onWarrantyErrorChange?: (hasError: boolean) => void;
  /** Called when any row has missing required (price-affecting) fields (true = block submit) */
  onRequiredFieldsErrorChange?: (hasError: boolean) => void;
}

export default function DynamicProductForm({
  payload,
  formData,
  setFormData,
  actionsFooter,
  onSizeLimitErrorChange,
  onWarrantyErrorChange,
  onRequiredFieldsErrorChange,
}: DynamicProductFormProps) {
  const formBodyProperties = (payload.form_body?.Properties ?? []) as PropertyDefinition[];
  const productPricingId = payload._product_pricing_id;
  const priceAffectingEnums = React.useMemo(
    () => new Set(payload.price_affecting_enums ?? []),
    [payload.price_affecting_enums]
  );

  const linkPropertyCodes = React.useMemo(
    () =>
      [
        ...(payload.zahlavi?.Properties ?? []),
        ...(payload.form_body?.Properties ?? []),
        ...(payload.zapati?.Properties ?? []),
      ]
        .filter((p) => p.DataType === "link")
        .map((p) => p.Code),
    [payload]
  );

  const widthCode = formBodyProperties.find((p) => WIDTH_CODES.includes(p.Code))?.Code;
  const heightCode = formBodyProperties.find((p) => HEIGHT_CODES.includes(p.Code))?.Code;

  const [sizeLimitByRow, setSizeLimitByRow] = useState<Record<string, SizeLimitsResult>>({});
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /** Compact = table fits on one row, truncated; Input = horizontal scroll, full value in cells */
  const [roomsViewMode, setRoomsViewMode] = useState<"compact" | "input">("input");

  // Collapsible sections
  const [basicInfoOpen, setBasicInfoOpen] = useState(true);
  const [zahlaviOpen, setZahlaviOpen] = useState(true);
  const [roomsOpen, setRoomsOpen] = useState(true);
  const [zapatiOpen, setZapatiOpen] = useState(true);

  // Add room panel
  const [showAddRoomPanel, setShowAddRoomPanel] = useState(false);
  const [customRoomName, setCustomRoomName] = useState("");

  const getRowValues = useCallback((row: FormRow): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === "id") continue;
      out[k] = v !== undefined && v !== null ? String(v).trim() : "";
    }
    return out;
  }, []);

  const getWidthHeight = useCallback(
    (row: FormRow): { width: number; height: number } | null => {
      if (!widthCode || !heightCode) return null;
      const rawW = row[widthCode];
      const rawH = row[heightCode];
      if (rawW === "" || rawH === "" || rawW == null || rawH == null) return null;
      const w = Number(rawW);
      const h = Number(rawH);
      if (Number.isNaN(w) || Number.isNaN(h) || w <= 0 || h <= 0) return null;
      return { width: w, height: h };
    },
    [widthCode, heightCode]
  );

  useEffect(() => {
    if (!productPricingId || !widthCode || !heightCode) {
      setSizeLimitByRow({});
      onSizeLimitErrorChange?.(false);
      return;
    }
    const timeouts = debounceRef.current;
    formData.rooms.forEach((room) => {
      room.rows.forEach((row) => {
        const dims = getWidthHeight(row);
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
        const width = dims.width;
        const height = dims.height;
        const row_values = getRowValues(row);
        timeouts[rowId] = setTimeout(() => {
          checkSizeLimits({
            product_pricing_id: productPricingId,
            width,
            height,
            row_values,
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
  }, [formData, productPricingId, widthCode, heightCode, getWidthHeight, getRowValues]);

  useEffect(() => {
    const hasManufacturingError = Object.values(sizeLimitByRow).some((r) => !r.in_manufacturing_range);
    const hasWarrantyError = Object.values(sizeLimitByRow).some((r) => r.in_manufacturing_range && !r.in_warranty_range);
    onSizeLimitErrorChange?.(hasManufacturingError);
    onWarrantyErrorChange?.(hasWarrantyError);
  }, [sizeLimitByRow, onSizeLimitErrorChange, onWarrantyErrorChange]);

  // Validate required (price-affecting) fields in all rows.
  // Skip fields that are disabled by dependency (user cannot fill them).
  useEffect(() => {
    if (priceAffectingEnums.size === 0) {
      onRequiredFieldsErrorChange?.(false);
      return;
    }
    const dependencies = payload.dependencies ?? [];
    const hasMissing = formData.rooms.some((room) =>
      room.rows.some((row) =>
        Array.from(priceAffectingEnums).some((code) => {
          const v = row[code];
          const isEmpty = v === undefined || v === null || String(v).trim() === "";
          if (!isEmpty) return false;
          // Same logic as isFieldDisabledByDependency: skip if field is disabled by dependency
          const disabledDeps = dependencies.filter(
            (d) => d.target_property === code && d.field_disabled === true
          );
          const isDisabled = disabledDeps.some((dep) => {
            const sourceVal = row[dep.source_enum];
            if (sourceVal === undefined || sourceVal === null) return false;
            return String(sourceVal) === String(dep.source_value);
          });
          return !isDisabled; // missing and not disabled => counts as error
        })
      )
    );
    onRequiredFieldsErrorChange?.(hasMissing);
  }, [formData, priceAffectingEnums, payload.dependencies, onRequiredFieldsErrorChange]);

  const getPropertyLabel = (prop: PropertyDefinition): string =>
    prop["label-form"] ?? prop.Name;

  const createEmptyFormBodyRow = (): FormRow => {
    const row: FormRow = { id: generateId() };
    formBodyProperties.forEach((prop) => {
      if (prop.Value !== undefined) row[prop.Code] = prop.Value;
      else if (prop.DataType === "boolean" || prop.DataType === "link") row[prop.Code] = false;
      else if (prop.DataType === "numeric") row[prop.Code] = "";
      else row[prop.Code] = "";
    });
    return row;
  };

  const handleAddRoom = (name: string = "") => {
    setFormData((prev) => ({
      ...prev,
      rooms: [
        ...prev.rooms,
        { id: generateId(), name, rows: [createEmptyFormBodyRow()] },
      ],
    }));
    setShowAddRoomPanel(false);
    setCustomRoomName("");
  };

  const handleDuplicateRoom = (roomId: string) => {
    setFormData((prev) => {
      const source = prev.rooms.find((r) => r.id === roomId);
      if (!source) return prev;
      const newRoom = {
        id: generateId(),
        name: source.name ? `${source.name} (kopie)` : "",
        rows: source.rows.map((row) => {
          const newRow: FormRow = { id: generateId() };
          for (const [k, v] of Object.entries(row)) {
            if (k === "id") continue;
            newRow[k] = v;
          }
          return newRow;
        }),
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

  /** Clone row values (new id, no linkGroupId) for "add row" – new row copies previous row. */
  const cloneRowForAdd = (sourceRow: FormRow): FormRow => {
    const row: FormRow = { id: generateId() };
    formBodyProperties.forEach((prop) => {
      const v = sourceRow[prop.Code];
      if (v !== undefined && v !== null) row[prop.Code] = v;
      else if (prop.DataType === "boolean" || prop.DataType === "link") row[prop.Code] = false;
      else if (prop.DataType === "numeric") row[prop.Code] = "";
      else row[prop.Code] = "";
    });
    return row;
  };

  const handleAddRow = (roomId: string) => {
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => {
        if (r.id !== roomId) return r;
        const lastRow = r.rows[r.rows.length - 1];
        const newRow = lastRow ? cloneRowForAdd(lastRow) : createEmptyFormBodyRow();
        return { ...r, rows: [...r.rows, newRow] };
      }),
    }));
  };

  const handleRemoveRow = (roomId: string, rowId: string) => {
    if (!confirm("Opravdu chcete odstranit tento řádek?")) return;
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) =>
        r.id === roomId ? { ...r, rows: r.rows.filter((row) => row.id !== rowId) } : r
      ),
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
    value: string | number | boolean
  ) => {
    setFormData((prev) => {
      const rooms = prev.rooms.map((room) => {
        if (room.id !== roomId) return room;
        const rows: FormRow[] = [];
        for (let i = 0; i < room.rows.length; i++) {
          const row = room.rows[i];
          if (row.id !== rowId) {
            rows.push(row);
            continue;
          }
          const prevValue = row[propertyCode];
          const updatedRow: FormRow = { ...row, [propertyCode]: value };

          // Auto-select dependent enum fields that are narrowed to a single option
          const affectedDeps = (payload.dependencies ?? []).filter(
            (d) => d.source_enum === propertyCode
          );
          for (const dep of affectedDeps) {
            const targetProp = formBodyProperties.find((p) => p.Code === dep.target_property);
            if (!targetProp || targetProp.DataType !== "enum") continue;
            const opts = getEnumOptionsForRow(dep.target_property, updatedRow);
            if (opts.length === 1) {
              updatedRow[dep.target_property] = opts[0].code;
            } else {
              // If the current value is no longer valid, clear it
              const currentVal = String(updatedRow[dep.target_property] ?? "");
              if (currentVal && !opts.some((o) => o.code === currentVal)) {
                updatedRow[dep.target_property] = "";
              }
            }
          }

          rows.push(updatedRow);

          if (linkPropertyCodes.includes(propertyCode)) {
            const turnedOn = !prevValue && Boolean(value);
            const turnedOff = Boolean(prevValue) && !value;
            if (turnedOn) {
              const groupId = row.linkGroupId || generateId();
              updatedRow.linkGroupId = groupId as any;
              const child: FormRow = { ...createEmptyFormBodyRow(), linkGroupId: groupId as any };
              rows.push(child);
            } else if (turnedOff && row.linkGroupId) {
              const groupId = row.linkGroupId;
              updatedRow.linkGroupId = undefined as any;
              for (let j = rows.length - 1; j >= 0; j--) {
                const r = rows[j] as any;
                if (r.id !== rowId && r.linkGroupId === groupId) {
                  rows.splice(j, 1);
                }
              }
            }
          }
        }
        return { ...room, rows };
      });
    return { ...prev, rooms };
    });
  };

  const getEnumOptions = (propertyCode: string, groupKey?: string): EnumValue[] => {
    const entry = payload.enums[propertyCode] as EnumEntry | undefined;
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

  const getEnumOptionsForRow = (propertyCode: string, row: FormRow): EnumValue[] => {
    let options = getEnumOptions(propertyCode);
    const deps = payload.dependencies?.filter((d) => d.target_property === propertyCode) ?? [];
    for (const dep of deps) {
      if (row[dep.source_enum] !== dep.source_value) continue;
      if (Array.isArray(dep.allowed_values) && dep.allowed_values.length > 0) {
        const allowedSet = new Set(dep.allowed_values);
        options = options.filter((opt) => allowedSet.has(opt.code));
        break;
      }
    }
    return options;
  };

  const isFieldDisabledByDependency = (propertyCode: string, row: FormRow): boolean => {
    const deps =
      payload.dependencies?.filter(
        (d) => d.target_property === propertyCode && d.field_disabled === true
      ) ?? [];
    return deps.some((dep) => {
      const sourceVal = row[dep.source_enum];
      if (sourceVal === undefined || sourceVal === null) return false;
      return String(sourceVal) === String(dep.source_value);
    });
  };

  const renderFormField = (
    property: PropertyDefinition,
    value: string | number | boolean,
    onChange: (value: string | number | boolean) => void,
    context?: { row?: FormRow; compact?: boolean }
  ) => {
    const disabled = context?.row ? isFieldDisabledByDependency(property.Code, context.row) : false;
    const compact = context?.compact ?? false;
    const isRequired = priceAffectingEnums.has(property.Code);
    const disabledClass = disabled
      ? "cursor-not-allowed opacity-60 bg-zinc-100 dark:bg-zinc-800"
      : "";

    if (property.DataType === "enum") {
      const options = context?.row
        ? getEnumOptionsForRow(property.Code, context.row)
        : getEnumOptions(property.Code);
      const currentCode = String(value);
      const valueInOptions = options.some((o) => o.code === currentCode);
      const isEmpty = !currentCode;
      const requiredEmptyClass = isRequired && isEmpty && !disabled
        ? "ring-2 ring-red-400 dark:ring-red-500"
        : "";
      return (
        <select
          value={currentCode}
          onChange={(e) => !disabled && onChange(e.target.value)}
          disabled={disabled}
          className={`${compact ? "max-w-[5rem] min-w-0 truncate" : "min-w-[4rem]"} w-full rounded border-0 bg-transparent px-1 py-1 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 md:text-xs ${disabledClass} ${requiredEmptyClass}`}
        >
          <option value="">{isRequired ? "— povinné —" : "-"}</option>
          {options.map((opt) => (
            <option key={opt.code} value={opt.code} title={opt.note ?? undefined}>
              {opt.name} ({opt.code}){opt.note ? ` — ${opt.note}` : ""}
            </option>
          ))}
          {!valueInOptions && currentCode && (
            <option value={currentCode} disabled>
              — {currentCode} —
            </option>
          )}
        </select>
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
          className={`${compact ? "max-w-[4rem] min-w-0" : "min-w-[3rem]"} w-full rounded border-0 bg-transparent px-1 py-1 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 md:text-xs ${disabledClass}`}
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
          rows={compact ? 1 : 2}
          className={`${compact ? "max-w-[6rem] min-w-0 truncate resize-none" : "min-w-[8rem] resize-y"} w-full rounded border-0 bg-transparent px-1 py-1 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 md:text-xs ${disabledClass}`}
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
        className={`${compact ? "max-w-[5rem] min-w-0 truncate" : "min-w-[4rem]"} w-full rounded border-0 bg-transparent px-1 py-1 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 md:text-xs ${disabledClass}`}
        placeholder="text"
      />
    );
  };

  // Chevron for collapsible headers
  const chevron = (open: boolean) => (
    <svg
      className={`h-5 w-5 transition-transform ${open ? "rotate-0" : "rotate-180"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );

  // Validation icon for row # column
  const rowStatusIcon = (rowId: string) => {
    const limit = sizeLimitByRow[rowId];
    if (!limit) return null;
    if (!limit.in_manufacturing_range) {
      return (
        <svg className="inline-block h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
        </svg>
      );
    }
    if (!limit.in_warranty_range) {
      return (
        <svg className="inline-block h-4 w-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      );
    }
    return (
      <svg className="inline-block h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
    );
  };

  const readonlyFieldClass = "rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300";

  return (
    <div className="space-y-4">
      {/* Basic info (read-only) */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <button
          type="button"
          onClick={() => setBasicInfoOpen((v) => !v)}
          className="flex w-full items-center justify-between p-5"
        >
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Základní informace</h2>
          {chevron(basicInfoOpen)}
        </button>
        {basicInfoOpen && (
          <div className="border-t border-zinc-200 p-5 dark:border-zinc-700">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Jméno</label>
                <p className={readonlyFieldClass}>{formData.name || "—"}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Email</label>
                <p className={readonlyFieldClass}>{formData.email || "—"}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Telefon</label>
                <p className={readonlyFieldClass}>{formData.phone || "—"}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Adresa</label>
                <p className={readonlyFieldClass}>{formData.address || "—"}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Město</label>
                <p className={readonlyFieldClass}>{formData.city || "—"}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Produkt</label>
                <p className={readonlyFieldClass}>{formData.productName || formData.productCode || "—"}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Záhlaví */}
      {payload.zahlavi && payload.zahlavi.Properties.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setZahlaviOpen((v) => !v)}
            className="flex w-full items-center justify-between p-5"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Záhlaví</h2>
            {chevron(zahlaviOpen)}
          </button>
          {zahlaviOpen && (
            <div className="border-t border-zinc-200 p-5 dark:border-zinc-700">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(payload.zahlavi.Properties as PropertyDefinition[]).map((prop) => (
                  <div key={prop.ID}>
                    <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {getPropertyLabel(prop)}
                    </label>
                    <div className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700">
                      {renderFormField(
                        prop,
                        formData.zahlaviValues[prop.Code] ?? "",
                        (value) => handleZahlaviChange(prop.Code, value)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Místnosti */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <button
          type="button"
          onClick={() => setRoomsOpen((v) => !v)}
          className="flex w-full items-center justify-between p-5"
        >
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Místnosti</h2>
            <div onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setShowAddRoomPanel((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Přidat místnost
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Zobrazení:</span>
            <div
              className="inline-flex rounded-md border border-zinc-300 bg-zinc-100 p-0.5 dark:border-zinc-600 dark:bg-zinc-700"
              role="group"
            >
              <button
                type="button"
                onClick={() => setRoomsViewMode("compact")}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                  roomsViewMode === "compact"
                    ? "bg-white text-zinc-900 shadow dark:bg-zinc-600 dark:text-zinc-50"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                }`}
              >
                Kompaktní
              </button>
              <button
                type="button"
                onClick={() => setRoomsViewMode("input")}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                  roomsViewMode === "input"
                    ? "bg-white text-zinc-900 shadow dark:bg-zinc-600 dark:text-zinc-50"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                }`}
              >
                Vstup
              </button>
            </div>
            {chevron(roomsOpen)}
          </div>
        </button>

        {/* Add room panel with presets */}
        {showAddRoomPanel && (
          <div className="border-t border-zinc-200 bg-zinc-50 px-5 py-4 dark:border-zinc-700 dark:bg-zinc-700/30">
            <div className="flex flex-wrap items-center gap-2">
              {ROOM_PRESETS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleAddRoom(name)}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:border-primary hover:bg-primary/10 active:bg-primary/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:border-primary"
                >
                  {name}
                </button>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customRoomName}
                  onChange={(e) => setCustomRoomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customRoomName.trim()) handleAddRoom(customRoomName.trim());
                  }}
                  placeholder="Vlastní název…"
                  className="rounded-md border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                  autoFocus={false}
                />
                <button
                  type="button"
                  onClick={() => customRoomName.trim() && handleAddRoom(customRoomName.trim())}
                  disabled={!customRoomName.trim()}
                  className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  Přidat
                </button>
              </div>
            </div>
          </div>
        )}

        {roomsOpen && (
          <div className="border-t border-zinc-200 p-5 dark:border-zinc-700">
            {formData.rooms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-600">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Zatím nejsou přidány žádné místnosti. Klikněte na „Přidat místnost".
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {formData.rooms.map((room) => (
                  <div
                    key={room.id}
                    className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-700/50">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={room.name}
                            onChange={(e) => handleRoomNameChange(room.id, e.target.value)}
                            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                            placeholder="Název místnosti"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleAddRow(room.id)}
                            className="min-h-[44px] touch-manipulation rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                          >
                            Přidat řádek
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateRoom(room.id)}
                            className="min-h-[44px] touch-manipulation rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                          >
                            Duplikovat místnost
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRoom(room.id)}
                            className="min-h-[44px] touch-manipulation rounded-md border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-600 dark:bg-zinc-700 dark:text-red-400 dark:hover:bg-zinc-600"
                          >
                            Odstranit
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className={roomsViewMode === "input" ? "overflow-x-auto overflow-y-visible" : "overflow-x-auto"}>
                      <table
                        className={`w-full border-collapse text-xs ${roomsViewMode === "input" ? "min-w-max" : "table-fixed"}`}
                      >
                        <thead className={roomsViewMode === "input" ? "sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-700" : "bg-zinc-100 dark:bg-zinc-700"}>
                          <tr>
                            <th
                              className={`border border-zinc-300 px-2 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300 ${
                                roomsViewMode === "input" ? "sticky left-0 z-20 bg-zinc-100 dark:bg-zinc-700 w-10" : "w-10"
                              }`}
                            >
                              #
                            </th>
                            {formBodyProperties.map((prop) => (
                              <th
                                key={prop.ID}
                                className={`border border-zinc-300 px-2 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300 ${
                                  roomsViewMode === "compact" ? "truncate" : "whitespace-nowrap"
                                }`}
                                title={prop.Name}
                              >
                                {getPropertyLabel(prop)}
                              </th>
                            ))}
                            <th
                              className={`border border-zinc-300 px-2 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300 ${
                                roomsViewMode === "input" ? "sticky right-0 z-20 bg-zinc-100 dark:bg-zinc-700" : ""
                              }`}
                            >
                              Akce
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {room.rows.map((row, rowIndex) => {
                            const limit = sizeLimitByRow[row.id];
                            const outOfManufacturing = limit && !limit.in_manufacturing_range;
                            const outOfWarranty = limit && limit.in_manufacturing_range && !limit.in_warranty_range;
                            const rowClassName = outOfManufacturing
                              ? "bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500"
                              : outOfWarranty
                                ? "bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500"
                                : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50";
                            const stickyCellBg = outOfManufacturing
                              ? "bg-red-50 dark:bg-red-950/30"
                              : outOfWarranty
                                ? "bg-amber-50 dark:bg-amber-950/20"
                                : "bg-white dark:bg-zinc-800";
                            const message =
                              outOfManufacturing && limit
                                ? `Mimo výrobní rozsah. Povoleno: šířka ${limit.mezni_sirka_min}–${limit.mezni_sirka_max} mm, výška ${limit.mezni_vyska_min}–${limit.mezni_vyska_max} mm.`
                                : outOfWarranty && limit
                                  ? `Mimo záruční rozsah. Záruka: šířka ${limit.zarucni_sirka_min}–${limit.zarucni_sirka_max} mm, výška ${limit.zarucni_vyska_min}–${limit.zarucni_vyska_max} mm.`
                                  : null;
                            const colSpan = formBodyProperties.length + 2;
                            return (
                              <React.Fragment key={row.id}>
                                <tr className={rowClassName}>
                                  <td
                                    className={`border border-zinc-300 px-2 py-1 text-center text-zinc-600 dark:border-zinc-600 dark:text-zinc-400 ${stickyCellBg} ${
                                      roomsViewMode === "input" ? "sticky left-0 z-10" : ""
                                    }`}
                                  >
                                    <div className="flex items-center justify-center gap-1">
                                      {rowStatusIcon(row.id)}
                                      <span>{rowIndex + 1}</span>
                                    </div>
                                  </td>
                                  {formBodyProperties.map((prop) => (
                                    <td
                                      key={prop.ID}
                                      className={`border border-zinc-300 px-1 py-1 dark:border-zinc-600 ${
                                        roomsViewMode === "compact" ? "overflow-hidden" : ""
                                      }`}
                                    >
                                      {renderFormField(
                                        prop,
                                        row[prop.Code] ?? "",
                                        (value) => handleRowChange(room.id, row.id, prop.Code, value),
                                        { row, compact: roomsViewMode === "compact" }
                                      )}
                                    </td>
                                  ))}
                                  <td
                                    className={`border border-zinc-300 px-1 py-1 dark:border-zinc-600 ${stickyCellBg} ${
                                      roomsViewMode === "input" ? "sticky right-0 z-10" : ""
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveRow(room.id, row.id)}
                                      className="min-h-[44px] min-w-[44px] touch-manipulation rounded border border-red-300 bg-white px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-600 dark:bg-zinc-700 dark:text-red-400 dark:hover:bg-zinc-600"
                                    >
                                      Odstranit
                                    </button>
                                  </td>
                                </tr>
                                {message && (
                                  <tr>
                                    <td
                                      colSpan={colSpan}
                                      className={`border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-600 ${
                                        outOfManufacturing
                                          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                                      }`}
                                    >
                                      {message}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Zápatí */}
      {payload.zapati && payload.zapati.Properties.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setZapatiOpen((v) => !v)}
            className="flex w-full items-center justify-between p-5"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Zápatí</h2>
            {chevron(zapatiOpen)}
          </button>
          {zapatiOpen && (
            <div className="border-t border-zinc-200 p-5 dark:border-zinc-700">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(payload.zapati.Properties as PropertyDefinition[]).map((prop) => (
                  <div key={prop.ID}>
                    <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {getPropertyLabel(prop)}
                    </label>
                    <div className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700">
                      {renderFormField(
                        prop,
                        formData.zapatiValues[prop.Code] ?? "",
                        (value) => handleZapatiChange(prop.Code, value)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {actionsFooter && <div className="flex flex-wrap gap-2">{actionsFooter}</div>}
    </div>
  );
}
