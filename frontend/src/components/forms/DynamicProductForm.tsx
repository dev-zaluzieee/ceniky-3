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
import { resolveProductNameFromPayload } from "@/lib/resolve-product-name";
import { checkSizeLimits, type SizeLimitsResult } from "@/lib/size-limits-api";
import {
  buildEffectiveRequiredFieldCodes,
  hasAnyMissingPriceAffectingFields,
  isHeightPropertyCode,
  isPriceAffectingFieldMissing,
  isRowFieldDisabledByDependency,
  isWidthPropertyCode,
} from "@/lib/price-affecting-validation";

/** Debounce for size-limit API; width/height columns resolved via `isWidthPropertyCode` / `isHeightPropertyCode` (first match in form_body). */
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
    productName: resolveProductNameFromPayload(payload),
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
  const getPropertyLabel = (prop: PropertyDefinition): string =>
    prop["label-form"] ?? prop.Name;
  const productPricingId = payload._product_pricing_id;
  const formBodyPropertyCodes = React.useMemo(
    () => formBodyProperties.map((p) => p.Code),
    [formBodyProperties]
  );

  /** `price_affecting_enums` from catalog + `ks` when that column exists in form_body. */
  const effectiveRequiredFieldCodes = React.useMemo(
    () => buildEffectiveRequiredFieldCodes(formBodyPropertyCodes, payload.price_affecting_enums),
    [formBodyPropertyCodes, payload.price_affecting_enums]
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

  const widthCode = formBodyProperties.find((p) => isWidthPropertyCode(p.Code))?.Code;
  const heightCode = formBodyProperties.find((p) => isHeightPropertyCode(p.Code))?.Code;

  const [sizeLimitByRow, setSizeLimitByRow] = useState<Record<string, SizeLimitsResult>>({});
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

  const dependencies = payload.dependencies ?? [];

  const hasMissingRequired = React.useMemo(
    () =>
      hasAnyMissingPriceAffectingFields(formData.rooms, effectiveRequiredFieldCodes, dependencies),
    [formData.rooms, effectiveRequiredFieldCodes, dependencies]
  );

  useEffect(() => {
    onRequiredFieldsErrorChange?.(hasMissingRequired);
  }, [hasMissingRequired, onRequiredFieldsErrorChange]);

  /** Human-readable lines for inline validation summary (room + row + missing labels). */
  const missingRequiredLines = React.useMemo(() => {
    if (!hasMissingRequired || effectiveRequiredFieldCodes.size === 0) return [];
    const lines: string[] = [];
    for (const room of formData.rooms) {
      for (let ri = 0; ri < room.rows.length; ri++) {
        const row = room.rows[ri];
        const missingCodes = Array.from(effectiveRequiredFieldCodes).filter((code) =>
          isPriceAffectingFieldMissing(row, code, dependencies)
        );
        if (missingCodes.length === 0) continue;
        const labels = missingCodes.map((code) => {
          const p = formBodyProperties.find((x) => x.Code === code);
          return p ? getPropertyLabel(p) : code;
        });
        const roomLabel = room.name?.trim() || "Místnost bez názvu";
        lines.push(`${roomLabel}, řádek ${ri + 1}: ${labels.join(", ")}`);
      }
    }
    return lines;
  }, [
    hasMissingRequired,
    effectiveRequiredFieldCodes,
    formData.rooms,
    dependencies,
    formBodyProperties,
  ]);

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

  const isFieldDisabledByDependency = (propertyCode: string, row: FormRow): boolean =>
    isRowFieldDisabledByDependency(row, propertyCode, payload.dependencies);

  const renderFormField = (
    property: PropertyDefinition,
    value: string | number | boolean,
    onChange: (value: string | number | boolean) => void,
    context?: { row?: FormRow }
  ) => {
    const disabled = context?.row ? isFieldDisabledByDependency(property.Code, context.row) : false;
    const disabledClass = disabled
      ? "cursor-not-allowed opacity-60 bg-zinc-100 dark:bg-zinc-800"
      : "";

    if (property.DataType === "enum") {
      const options = context?.row
        ? getEnumOptionsForRow(property.Code, context.row)
        : getEnumOptions(property.Code);
      const currentCode = String(value);
      const valueInOptions = options.some((o) => o.code === currentCode);
      return (
        <select
          value={currentCode}
          onChange={(e) => !disabled && onChange(e.target.value)}
          disabled={disabled}
          className={`min-w-[4rem] w-full rounded border-0 bg-transparent px-1 py-1 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 md:text-xs ${disabledClass}`}
        >
          <option value="">-</option>
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

  return (
    <div className="space-y-6">
      {/* Customer block */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Základní informace
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Jméno
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              placeholder="Jméno a příjmení"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Telefon
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={formData.phone}
              onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              placeholder="+420 ..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Adresa
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              placeholder="Ulice a číslo"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Město
            </label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              placeholder="Město"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Produkt
            </label>
            <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300">
              {formData.productName || formData.productCode || "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Zahlavi */}
      {payload.zahlavi && payload.zahlavi.Properties.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Záhlaví (zahlavi)
          </h2>
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

      {/* Rooms */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Místnosti (mistnosti)
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAddRoomPanel((v) => !v)}
              className="min-h-[44px] min-w-[44px] touch-manipulation rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              Přidat místnost
            </button>
          </div>
        </div>

        {/* Room preset panel */}
        {showAddRoomPanel && (
          <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-700/50">
            <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Vyberte typ místnosti nebo zadejte vlastní název:
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {ROOM_PRESETS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleAddRoom(name)}
                  className="min-h-[44px] touch-manipulation rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:border-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-primary dark:hover:bg-primary/20"
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
                className="min-h-[44px] flex-1 rounded-md border border-zinc-300 px-3 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                placeholder="Vlastní název..."
              />
              <button
                type="button"
                onClick={() => {
                  if (customRoomName.trim()) handleAddRoom(customRoomName.trim());
                }}
                disabled={!customRoomName.trim()}
                className="min-h-[44px] touch-manipulation rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                Přidat
              </button>
            </div>
          </div>
        )}

        {effectiveRequiredFieldCodes.size > 0 && (
          <p className="mb-3 flex flex-wrap items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-red-600 dark:text-red-400" aria-hidden="true">
              *
            </span>
            <span>
              Označuje pole <strong className="font-medium text-zinc-800 dark:text-zinc-200">povinná pro výpočet ceny</strong> — v každém řádku je nutné je vyplnit (pokud není pole podle výběru skryté).
            </span>
          </p>
        )}

        {hasMissingRequired && missingRequiredLines.length > 0 && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100"
          >
            <p className="mb-2 font-semibold">Chybí povinná pole pro výpočet ceny:</p>
            <ul className="list-inside list-disc space-y-1 text-red-800 dark:text-red-200">
              {missingRequiredLines.map((line, idx) => (
                <li key={`req-${idx}-${line.slice(0, 48)}`}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {formData.rooms.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-800">
            <p className="text-zinc-500 dark:text-zinc-400">
              Zatím nejsou přidány žádné místnosti. Klikněte na „Přidat místnost“.
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
                        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                        placeholder="Název místnosti"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddRow(room.id)}
                        className="min-h-[44px] min-w-[44px] touch-manipulation rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                      >
                        Přidat řádek
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateRoom(room.id)}
                        className="min-h-[44px] min-w-[44px] touch-manipulation rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                      >
                        Duplikovat
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRoom(room.id)}
                        className="min-h-[44px] min-w-[44px] touch-manipulation rounded-md border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-red-600 dark:bg-zinc-700 dark:text-red-400 dark:hover:bg-zinc-600"
                      >
                        Odstranit místnost
                      </button>
                    </div>
                  </div>
                </div>
                {/* Horizontal scroll so full text in fields is visible; sticky header + sticky # and Akce columns for tablet */}
                <div className="overflow-x-auto overflow-y-visible">
                  <table className="w-full min-w-max border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-700">
                      <tr>
                        <th className="sticky left-0 z-20 border border-zinc-300 bg-zinc-100 px-2 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                          #
                        </th>
                        {formBodyProperties.map((prop) => {
                          const requiredCol = effectiveRequiredFieldCodes.has(prop.Code);
                          return (
                            <th
                              key={prop.ID}
                              className="whitespace-nowrap border border-zinc-300 px-2 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
                              title={
                                requiredCol
                                  ? `${getPropertyLabel(prop)} — povinné pro výpočet ceny`
                                  : prop.Name
                              }
                            >
                              {requiredCol ? (
                                <span className="inline-flex items-baseline gap-0.5">
                                  <span
                                    className="font-bold leading-none text-red-600 dark:text-red-400"
                                    aria-hidden="true"
                                  >
                                    *
                                  </span>
                                  <span>{getPropertyLabel(prop)}</span>
                                  <span className="sr-only"> — povinné pro výpočet ceny</span>
                                </span>
                              ) : (
                                getPropertyLabel(prop)
                              )}
                            </th>
                          );
                        })}
                        <th className="sticky right-0 z-20 border border-zinc-300 bg-zinc-100 px-2 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
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
                          <td className={`sticky left-0 z-10 border border-zinc-300 px-2 py-1 text-center text-zinc-600 dark:border-zinc-600 dark:text-zinc-400 ${stickyCellBg}`}>
                            {rowIndex + 1}
                          </td>
                          {formBodyProperties.map((prop) => {
                            const missingCell =
                              effectiveRequiredFieldCodes.has(prop.Code) &&
                              isPriceAffectingFieldMissing(row, prop.Code, dependencies);
                            return (
                              <td
                                key={prop.ID}
                                className={`border border-zinc-300 px-1 py-1 dark:border-zinc-600 ${
                                  missingCell
                                    ? "rounded-md ring-2 ring-red-500 ring-offset-1 ring-offset-white dark:ring-red-400 dark:ring-offset-zinc-800"
                                    : ""
                                }`}
                              >
                                {renderFormField(
                                  prop,
                                  row[prop.Code] ?? "",
                                  (value) => handleRowChange(room.id, row.id, prop.Code, value),
                                  { row }
                                )}
                              </td>
                            );
                          })}
                          <td className={`sticky right-0 z-10 border border-zinc-300 px-1 py-1 dark:border-zinc-600 ${stickyCellBg}`}>
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(room.id, row.id)}
                              className="min-h-[44px] min-w-[44px] touch-manipulation rounded border border-red-300 bg-white px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-500/20 dark:border-red-600 dark:bg-zinc-700 dark:text-red-400 dark:hover:bg-zinc-600"
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

      {/* Zapati */}
      {payload.zapati && payload.zapati.Properties.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Zápatí (zapati)
          </h2>
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

      {actionsFooter && <div className="flex flex-wrap gap-2">{actionsFooter}</div>}
    </div>
  );
}