"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/**
 * Type definitions matching the JSON payload structure from validation tool (temp directory).
 * New format uses zahlavi / form_body / zapati sections and optional label-form, Value.
 */
interface PropertyDefinition {
  ID: string;
  Code: string;
  Name: string;
  DataType: "text" | "numeric" | "boolean" | "enum";
  /** Optional default value (e.g. manufacturer) */
  Value?: string | number | boolean;
  /** Optional form label override */
  "label-form"?: string;
}

interface SectionBlock {
  Code: string;
  Name: string;
  Properties: PropertyDefinition[];
}

interface EnumValue {
  code: string;
  name: string;
  groups: string[];
  active?: boolean;
}

interface ProductPayload {
  product_code: string;
  /** Header section (form-level fields above the table) */
  zahlavi?: SectionBlock;
  /** Main repeatable row fields – columns in mistnosti rows */
  form_body?: SectionBlock;
  /** Footer section (form-level fields below the table) */
  zapati?: SectionBlock;
  enums: {
    [key: string]: {
      default: EnumValue[];
    };
  };
  downloaded_at?: string;
  _metadata?: {
    generated_from_validations?: boolean;
    generated_at?: string;
    zahlavi_count?: number;
    form_body_count?: number;
    zapati_count?: number;
    properties_count?: number;
    total_properties?: number;
  };
}

/**
 * Form row entry - dynamically generated from properties
 */
interface FormRow {
  id: string;
  [key: string]: string | number | boolean; // Dynamic property values
}

/**
 * Room (místnost) - contains multiple rows
 */
interface Room {
  id: string;
  name: string;
  rows: FormRow[];
}

/**
 * Form data structure
 */
interface FormData {
  // Customer fields
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  // Product info
  productCode: string;
  productName: string;
  // Form-level sections (from zahlavi / zapati)
  zahlaviValues: Record<string, string | number | boolean>;
  zapatiValues: Record<string, string | number | boolean>;
  // Rooms (mistnosti) – row fields come from form_body
  rooms: Room[];
}

/**
 * Debug tool: paste a product JSON payload (from the experimental validation app)
 * and generate a dynamic form from it.
 *
 * Important: we intentionally do NOT fetch anything from Supabase here. The input is
 * copy/paste JSON so we can iterate on the schema + UI quickly and deterministically.
 */
export default function DebugJsonFormPage() {
  const [rawJson, setRawJson] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<FormData | null>(null);

  /**
   * Parse JSON in a safe, UI-friendly way (no throwing during render).
   */
  const parsed = useMemo(() => {
    if (!rawJson.trim()) return { ok: true as const, value: null as unknown };
    try {
      return { ok: true as const, value: JSON.parse(rawJson) as unknown };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Neplatný JSON";
      return { ok: false as const, error: message };
    }
  }, [rawJson]);

  /**
   * Validate payload structure (new format: zahlavi / form_body / zapati + enums)
   */
  const payload = useMemo((): ProductPayload | null => {
    if (!parsed.ok || !parsed.value) return null;
    const data = parsed.value as any;
    if (typeof data.product_code !== "string" || !data.enums || typeof data.enums !== "object")
      return null;
    // At least form_body with Properties is required for the row table
    const hasFormBody = data.form_body && Array.isArray(data.form_body.Properties) && data.form_body.Properties.length > 0;
    if (!hasFormBody) return null;
    return data as ProductPayload;
  }, [parsed]);

  /** Row columns come from form_body.Properties */
  const formBodyProperties = useMemo(
    () => (payload?.form_body?.Properties ?? []) as PropertyDefinition[],
    [payload]
  );

  /** Display label for a property (label-form override or Name) */
  const getPropertyLabel = (prop: PropertyDefinition): string =>
    prop["label-form"] ?? prop.Name;

  /**
   * Generate unique ID
   */
  const generateId = (): string => {
    return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  /** Build empty row from form_body properties; use Value when present */
  const createEmptyFormBodyRow = (): FormRow => {
    const row: FormRow = { id: generateId() };
    formBodyProperties.forEach((prop) => {
      if (prop.Value !== undefined) {
        row[prop.Code] = prop.Value;
      } else if (prop.DataType === "boolean") {
        row[prop.Code] = false;
      } else if (prop.DataType === "numeric") {
        row[prop.Code] = "";
      } else {
        row[prop.Code] = "";
      }
    });
    return row;
  };

  /** Build initial values for a section (zahlavi or zapati) */
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

  /**
   * Initialize form from payload
   */
  const handleGenerateForm = () => {
    if (!payload) return;

    const newFormData: FormData = {
      name: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      productCode: payload.product_code,
      productName: payload.form_body?.Name ?? payload.zahlavi?.Name ?? payload.zapati?.Name ?? payload.product_code,
      zahlaviValues: sectionInitialValues(payload.zahlavi),
      zapatiValues: sectionInitialValues(payload.zapati),
      rooms: [
        {
          id: generateId(),
          name: "",
          rows: [createEmptyFormBodyRow()],
        },
      ],
    };

    setFormData(newFormData);
    setShowForm(true);
  };

  /**
   * Add a new room
   */
  const handleAddRoom = () => {
    if (!formData) return;
    setFormData({
      ...formData,
      rooms: [
        ...formData.rooms,
        {
          id: generateId(),
          name: "",
          rows: [createEmptyFormBodyRow()],
        },
      ],
    });
  };

  /**
   * Remove a room
   */
  const handleRemoveRoom = (roomId: string) => {
    if (!formData) return;
    setFormData({
      ...formData,
      rooms: formData.rooms.filter((room) => room.id !== roomId),
    });
  };

  /**
   * Update room name
   */
  const handleRoomNameChange = (roomId: string, name: string) => {
    if (!formData) return;
    setFormData({
      ...formData,
      rooms: formData.rooms.map((room) =>
        room.id === roomId ? { ...room, name } : room
      ),
    });
  };

  /**
   * Add a row to a room
   */
  const handleAddRow = (roomId: string) => {
    if (!formData) return;
    setFormData({
      ...formData,
      rooms: formData.rooms.map((room) =>
        room.id === roomId
          ? { ...room, rows: [...room.rows, createEmptyFormBodyRow()] }
          : room
      ),
    });
  };

  /**
   * Remove a row from a room
   */
  const handleRemoveRow = (roomId: string, rowId: string) => {
    if (!formData) return;
    setFormData({
      ...formData,
      rooms: formData.rooms.map((room) =>
        room.id === roomId
          ? { ...room, rows: room.rows.filter((row) => row.id !== rowId) }
          : room
      ),
    });
  };

  /**
   * Update zahlavi (header) section field value
   */
  const handleZahlaviChange = (propertyCode: string, value: string | number | boolean) => {
    if (!formData) return;
    setFormData({
      ...formData,
      zahlaviValues: { ...formData.zahlaviValues, [propertyCode]: value },
    });
  };

  /**
   * Update zapati (footer) section field value
   */
  const handleZapatiChange = (propertyCode: string, value: string | number | boolean) => {
    if (!formData) return;
    setFormData({
      ...formData,
      zapatiValues: { ...formData.zapatiValues, [propertyCode]: value },
    });
  };

  /**
   * Update row field value
   */
  const handleRowChange = (
    roomId: string,
    rowId: string,
    propertyCode: string,
    value: string | number | boolean
  ) => {
    if (!formData) return;
    setFormData({
      ...formData,
      rooms: formData.rooms.map((room) =>
        room.id === roomId
          ? {
              ...room,
              rows: room.rows.map((row) =>
                row.id === rowId ? { ...row, [propertyCode]: value } : row
              ),
            }
          : room
      ),
    });
  };

  /**
   * Get enum options for a property
   */
  const getEnumOptions = (propertyCode: string): EnumValue[] => {
    if (!payload) return [];
    const enumData = payload.enums[propertyCode];
    return enumData?.default || [];
  };

  /**
   * Render form field based on property type
   */
  const renderFormField = (
    property: PropertyDefinition,
    value: string | number | boolean,
    onChange: (value: string | number | boolean) => void
  ) => {
    if (property.DataType === "enum") {
      const options = getEnumOptions(property.Code);
      return (
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
        >
          <option value="">-</option>
          {options.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.name} ({opt.code})
            </option>
          ))}
        </select>
      );
    }

    if (property.DataType === "boolean") {
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 text-accent focus:ring-accent"
        />
      );
    }

    if (property.DataType === "numeric") {
      return (
        <input
          type="number"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
          placeholder="číslo"
        />
      );
    }

    // Default: text
    return (
      <input
        type="text"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
        placeholder="text"
      />
    );
  };

  /**
   * Export form data as JSON (for debugging/inspection)
   */
  const handleExportData = () => {
    if (!formData) return;
    const json = JSON.stringify(formData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formData.productCode}_form_data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-7xl">
        {/* Header with back link */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Zpět na hlavní stránku
          </Link>
        </div>

        {/* Page Title */}
        <h1 className="mb-8 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Náhled JSON formuláře
        </h1>

        {!showForm ? (
          /* JSON Input Section */
          <section
            className="rounded-xl border border-foreground/10 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
            aria-label="Vstupní JSON"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Vstupní JSON
              </h2>
              <div className="text-xs text-foreground/70">
                {rawJson.trim().length === 0 ? (
                  <span>Čekám na vložení…</span>
                ) : parsed.ok && payload ? (
                  <span className="text-green-600 dark:text-green-400">
                    ✓ JSON je validní (form_body: {formBodyProperties.length}
                    {payload.zahlavi ? `, zahlavi: ${payload.zahlavi.Properties.length}` : ""}
                    {payload.zapati ? `, zapati: ${payload.zapati.Properties.length}` : ""})
                  </span>
                ) : parsed.ok ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    ⚠ Chybí form_body.Properties (nebo je prázdné)
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400">
                    ✗ JSON je neplatný
                  </span>
                )}
              </div>
            </div>

            <textarea
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              spellCheck={false}
              className="h-[400px] w-full resize-y rounded-lg border border-zinc-300 bg-zinc-950 p-4 font-mono text-xs text-zinc-100 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-600"
              placeholder={`Vložte sem JSON payload…\n\nOčekávaná struktura:\n{\n  "product_code": "...",\n  "zahlavi": { "Properties": [...] },\n  "form_body": { "Properties": [...] },\n  "zapati": { "Properties": [...] },\n  "enums": {...}\n}`}
            />

            {!parsed.ok && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                Chyba parsování: {parsed.error}
              </p>
            )}

            {parsed.ok && !payload && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                JSON je validní, ale chybí očekávaná struktura: product_code,
                enums a form_body s neprázdným polem Properties.
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleGenerateForm}
                disabled={!payload}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Vygenerovat formulář
              </button>
            </div>
          </section>
        ) : (
          /* Form Section */
          <div className="space-y-6">
            {/* Customer Section */}
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
                    value={formData?.name || ""}
                    onChange={(e) =>
                      setFormData({ ...formData!, name: e.target.value })
                    }
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
                    value={formData?.email || ""}
                    onChange={(e) =>
                      setFormData({ ...formData!, email: e.target.value })
                    }
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
                    value={formData?.phone || ""}
                    onChange={(e) =>
                      setFormData({ ...formData!, phone: e.target.value })
                    }
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
                    value={formData?.address || ""}
                    onChange={(e) =>
                      setFormData({ ...formData!, address: e.target.value })
                    }
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
                    value={formData?.city || ""}
                    onChange={(e) =>
                      setFormData({ ...formData!, city: e.target.value })
                    }
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                    placeholder="Město"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Produkt
                  </label>
                  <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300">
                    {formData?.productName || formData?.productCode || "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Zahlavi (header) section – form-level fields */}
            {payload?.zahlavi && payload.zahlavi.Properties.length > 0 && (
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
                          formData?.zahlaviValues[prop.Code] ?? "",
                          (value) => handleZahlaviChange(prop.Code, value)
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rooms Section */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Místnosti (mistnosti)
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddRoom}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    Přidat místnost
                  </button>
                  <button
                    onClick={handleExportData}
                    className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                  >
                    Exportovat data
                  </button>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setFormData(null);
                    }}
                    className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                  >
                    Zpět k JSON
                  </button>
                </div>
              </div>

              {formData && formData.rooms.length === 0 ? (
                <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="text-zinc-500 dark:text-zinc-400">
                    Zatím nejsou přidány žádné místnosti. Klikněte na tlačítko výše
                    pro přidání první místnosti.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {formData?.rooms.map((room) => (
                    <div
                      key={room.id}
                      className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      {/* Room Header */}
                      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-700/50">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <input
                              type="text"
                              value={room.name}
                              onChange={(e) =>
                                handleRoomNameChange(room.id, e.target.value)
                              }
                              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                              placeholder="Název místnosti"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAddRow(room.id)}
                              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                            >
                              Přidat řádek
                            </button>
                            <button
                              onClick={() => handleRemoveRoom(room.id)}
                              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-red-600 dark:bg-zinc-700 dark:text-red-400 dark:hover:bg-zinc-600"
                            >
                              Odstranit místnost
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Room Table – columns from form_body */}
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
                                      (value) =>
                                        handleRowChange(
                                          room.id,
                                          row.id,
                                          prop.Code,
                                          value
                                        )
                                    )}
                                  </td>
                                ))}
                                <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                                  <button
                                    onClick={() =>
                                      handleRemoveRow(room.id, row.id)
                                    }
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

            {/* Zapati (footer) section – form-level fields */}
            {payload?.zapati && payload.zapati.Properties.length > 0 && (
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
                          formData?.zapatiValues[prop.Code] ?? "",
                          (value) => handleZapatiChange(prop.Code, value)
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Data Preview Section */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
              <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Náhled dat (mistnosti)
              </h2>
              <pre className="max-h-[400px] overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                {JSON.stringify(formData?.rooms || [], null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
