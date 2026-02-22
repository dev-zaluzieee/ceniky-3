"use client";

import type {
  ProductPayload,
  JsonSchemaFormData,
  FormRow,
  PropertyDefinition,
  SectionBlock,
  EnumValue,
  EnumEntry,
} from "@/types/json-schema-form.types";

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
    rooms: [
      { id: generateId(), name: "", rows: [createEmptyRow()] },
    ],
  };
}

export interface DynamicProductFormProps {
  payload: ProductPayload;
  formData: JsonSchemaFormData;
  setFormData: React.Dispatch<React.SetStateAction<JsonSchemaFormData>>;
  /** Rendered in the rooms section header next to "Přidat místnost" (e.g. Export, Back to JSON) */
  actionsInRoomsHeader?: React.ReactNode;
  /** Rendered after the zapati section (e.g. Submit button) */
  actionsFooter?: React.ReactNode;
}

export default function DynamicProductForm({
  payload,
  formData,
  setFormData,
  actionsInRoomsHeader,
  actionsFooter,
}: DynamicProductFormProps) {
  const formBodyProperties = (payload.form_body?.Properties ?? []) as PropertyDefinition[];

  const getPropertyLabel = (prop: PropertyDefinition): string =>
    prop["label-form"] ?? prop.Name;

  const createEmptyFormBodyRow = (): FormRow => {
    const row: FormRow = { id: generateId() };
    formBodyProperties.forEach((prop) => {
      if (prop.Value !== undefined) row[prop.Code] = prop.Value;
      else if (prop.DataType === "boolean") row[prop.Code] = false;
      else if (prop.DataType === "numeric") row[prop.Code] = "";
      else row[prop.Code] = "";
    });
    return row;
  };

  const handleAddRoom = () => {
    setFormData((prev) => ({
      ...prev,
      rooms: [
        ...prev.rooms,
        { id: generateId(), name: "", rows: [createEmptyFormBodyRow()] },
      ],
    }));
  };

  const handleRemoveRoom = (roomId: string) => {
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

  const handleAddRow = (roomId: string) => {
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) =>
        r.id === roomId ? { ...r, rows: [...r.rows, createEmptyFormBodyRow()] } : r
      ),
    }));
  };

  const handleRemoveRow = (roomId: string, rowId: string) => {
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
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room) =>
        room.id === roomId
          ? {
              ...room,
              rows: room.rows.map((row) =>
                row.id === rowId ? { ...row, [propertyCode]: value } : row
              ),
            }
          : room
      ),
    }));
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
    return deps.some((dep) => row[dep.source_enum] === dep.source_value);
  };

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
          className={`w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 ${disabledClass}`}
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

    if (property.DataType === "boolean") {
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
          value={String(value)}
          onChange={(e) => !disabled && onChange(e.target.value)}
          disabled={disabled}
          className={`w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 ${disabledClass}`}
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
          className={`w-full resize-y rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 ${disabledClass}`}
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
        className={`w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 ${disabledClass}`}
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
              onClick={handleAddRoom}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              Přidat místnost
            </button>
            {actionsInRoomsHeader}
          </div>
        </div>

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
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                      >
                        Přidat řádek
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRoom(room.id)}
                        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-red-600 dark:bg-zinc-700 dark:text-red-400 dark:hover:bg-zinc-600"
                      >
                        Odstranit místnost
                      </button>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-zinc-100 dark:bg-zinc-700">
                      <tr>
                        <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                          #
                        </th>
                        {formBodyProperties.map((prop) => (
                          <th
                            key={prop.ID}
                            className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
                            title={prop.Name}
                          >
                            {getPropertyLabel(prop)}
                          </th>
                        ))}
                        <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                          Akce
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {room.rows.map((row, rowIndex) => (
                        <tr
                          key={row.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                        >
                          <td className="border border-zinc-300 px-1 py-1 text-center text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
                            {rowIndex + 1}
                          </td>
                          {formBodyProperties.map((prop) => (
                            <td
                              key={prop.ID}
                              className="border border-zinc-300 px-1 py-1 dark:border-zinc-600"
                            >
                              {renderFormField(
                                prop,
                                row[prop.Code] ?? "",
                                (value) => handleRowChange(room.id, row.id, prop.Code, value),
                                { row }
                              )}
                            </td>
                          ))}
                          <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(room.id, row.id)}
                              className="rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-500/20 dark:border-red-600 dark:bg-zinc-700 dark:text-red-400 dark:hover:bg-zinc-600"
                            >
                              Odstranit
                            </button>
                          </td>
                        </tr>
                      ))}
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
