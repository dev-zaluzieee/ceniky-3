"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { submitForm, updateForm } from "@/lib/forms-api";
import { searchCustomersDual, validateCustomerPair } from "@/lib/customers-api";
import { fetchManufacturers, Manufacturer } from "@/lib/manufacturers-api";
import {
  HorizontalniZaluzieFormData,
  HorizontalniZaluzieRoom,
  HorizontalniZaluzieEntryRow,
} from "@/types/forms/horizontalni-zaluzie.types";
import { RaynetLead } from "@/types/raynet.types";
import { ErpCustomer } from "@/types/erp.types";

/**
 * Customer data from order (read-only in form when creating form under an order)
 */
export interface CustomerFromOrder {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
}

/**
 * Props for HorizontalniZaluzieFormClient
 */
interface HorizontalniZaluzieFormClientProps {
  /**
   * Initial form data for edit mode
   * If provided, form will be initialized with this data
   */
  initialData?: HorizontalniZaluzieFormData;
  /**
   * Form ID for edit mode
   * If provided, form will update existing form instead of creating new one
   */
  formId?: number;
  /**
   * Order ID when creating a form under an order (zakázka).
   * Customer data is taken from order and shown read-only.
   */
  orderId?: number;
  /**
   * Customer data from the order (read-only). When set, customer fields are disabled.
   */
  customerFromOrder?: CustomerFromOrder;
}

/**
 * Default empty form data
 */
const getDefaultFormData = (): HorizontalniZaluzieFormData => ({
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  product: "HORIZONTÁLNÍ ŽALUZIE",
  supplier: "KASKO / JACKO / ISOTRA",
  productType: "",
  slatType: "",
  status: "",
  installationType: "",
  glazingStripDepth: "",
  rooms: [],
  ladder: "",
  ladderHeight: "",
  totalArea: "",
  totalCount: "",
  slatVerified: "",
});

/**
 * Client component for horizontal blinds form
 * Handles all form interactivity and state management
 * Supports both create and edit modes
 */
export default function HorizontalniZaluzieFormClient({
  initialData,
  formId,
  orderId,
  customerFromOrder,
}: HorizontalniZaluzieFormClientProps) {
  /**
   * Generate unique ID for rooms and rows
   */
  const generateId = (): string => {
    return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // Determine if we're in edit mode
  const isEditMode = !!formId && !!initialData;
  // Customer is locked from order (read-only) when creating a form under an order
  const customerLockedFromOrder = !!orderId && !!customerFromOrder;

  // Initialize form state - use initialData if provided, otherwise use defaults
  // When customerFromOrder is set, prefill name, email, phone, address, city
  const [formData, setFormData] = useState<HorizontalniZaluzieFormData>(() => {
    if (initialData) {
      const defaults = getDefaultFormData();
      return {
        ...defaults,
        ...initialData,
        rooms: initialData.rooms.map((room) => ({
          ...room,
          id: room.id || generateId(),
          rows: room.rows.map((row) => ({
            ...row,
            id: row.id || generateId(),
          })),
        })),
      };
    }
    const defaults = getDefaultFormData();
    if (customerFromOrder) {
      return {
        ...defaults,
        name: customerFromOrder.name ?? "",
        email: customerFromOrder.email ?? "",
        phone: customerFromOrder.phone ?? "",
        address: customerFromOrder.address ?? "",
        city: customerFromOrder.city ?? "",
      };
    }
    return defaults;
  });

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Raynet search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [raynetCandidates, setRaynetCandidates] = useState<RaynetLead[]>([]);
  const [erpCandidates, setErpCandidates] = useState<ErpCustomer[]>([]);
  const [selectedRaynet, setSelectedRaynet] = useState<RaynetLead | null>(null);
  const [selectedErp, setSelectedErp] = useState<ErpCustomer | null>(null);
  const [showCustomerSelection, setShowCustomerSelection] = useState(false);

  // Pair validation state (must be 1 Raynet + 1 ERP)
  const [isValidatingPair, setIsValidatingPair] = useState(false);
  const [pairWarning, setPairWarning] = useState<string | null>(null);

  // Manufacturers state (for Dodavatel dropdown)
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [isLoadingManufacturers, setIsLoadingManufacturers] = useState(true);
  const [manufacturersError, setManufacturersError] = useState<string | null>(null);

  // Update form data when initialData changes (e.g., after fetching)
  // Merge with defaults to ensure all required fields are present (handles legacy data)
  // Preserves existing room/row IDs to maintain stable React keys and prevent unnecessary remounts
  useEffect(() => {
    if (initialData) {
      // Merge with defaults to ensure all required fields are present
      // This handles legacy data that may be missing new fields like name/email
      const defaults = getDefaultFormData();
      
      // Use functional update to preserve existing IDs from current state
      // This prevents regenerating IDs and maintains stable React keys
      setFormData((prevFormData) => {
        const mergedData = {
          ...defaults,
          ...initialData,
        };

        // Preserve existing IDs from current state to maintain stable React keys
        // Match rooms by index and preserve their IDs if they exist
        mergedData.rooms = initialData.rooms.map((room, roomIndex) => {
          // Preserve existing room ID if available (by index), otherwise use room.id from initialData, or generate
          const existingRoom = prevFormData.rooms[roomIndex];
          const preservedRoomId = existingRoom?.id || room.id || generateId();
          
          return {
            ...room,
            id: preservedRoomId,
            rows: room.rows.map((row, rowIndex) => {
              // Preserve existing row ID if available (by room and row index), otherwise use row.id from initialData, or generate
              const existingRow = existingRoom?.rows[rowIndex];
              const preservedRowId = existingRow?.id || row.id || generateId();
              return {
                ...row,
                id: preservedRowId,
              };
            }),
          };
        });

        return mergedData;
      });
    }
  }, [initialData]);

  // Fetch manufacturers on component mount
  useEffect(() => {
    const loadManufacturers = async () => {
      setIsLoadingManufacturers(true);
      setManufacturersError(null);

      const result = await fetchManufacturers();
      if (result.success && result.data) {
        setManufacturers(result.data);
        // If supplier is empty or not in the fetched list, set to first manufacturer name
        // Use functional update to avoid dependency on formData.supplier
        setFormData((prev) => {
          if (!prev.supplier || !result.data!.some((m) => m.name === prev.supplier)) {
            if (result.data!.length > 0) {
              return { ...prev, supplier: result.data![0].name };
            }
          }
          return prev;
        });
      } else {
        setManufacturersError(result.error || "Nepodařilo se načíst dodavatele");
        console.error("Failed to fetch manufacturers:", result.error);
      }

      setIsLoadingManufacturers(false);
    };

    loadManufacturers();
  }, []); // Empty dependency array - only run on mount

  /**
   * Create a new empty entry row
   */
  const createEmptyRow = (): HorizontalniZaluzieEntryRow => ({
    id: generateId(),
    control: "",
    width: "",
    height: "",
    area: "",
    chain: "",
    equipment: "",
    bp: "",
    pad: "",
    fixation: "",
    mounting: "",
    frameColor: "",
    slat: "",
  });

  /**
   * Create a new room with one empty row
   */
  const createEmptyRoom = (): HorizontalniZaluzieRoom => ({
    id: generateId(),
    name: "",
    rows: [createEmptyRow()],
  });

  /**
   * Handle input changes for header fields
   */
  const handleHeaderChange = (
    field: keyof Omit<HorizontalniZaluzieFormData, "rooms">,
    value: string
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * Add a new room
   */
  const handleAddRoom = () => {
    setFormData((prev) => ({
      ...prev,
      rooms: [...prev.rooms, createEmptyRoom()],
    }));
  };

  /**
   * Remove a room
   */
  const handleRemoveRoom = (roomId: string) => {
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.filter((room) => room.id !== roomId),
    }));
  };

  /**
   * Update room name
   */
  const handleRoomNameChange = (roomId: string, name: string) => {
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room) =>
        room.id === roomId ? { ...room, name } : room
      ),
    }));
  };

  /**
   * Add a new row to a room
   */
  const handleAddRow = (roomId: string) => {
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room) =>
        room.id === roomId
          ? { ...room, rows: [...room.rows, createEmptyRow()] }
          : room
      ),
    }));
  };

  /**
   * Remove a row from a room
   */
  const handleRemoveRow = (roomId: string, rowId: string) => {
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room) =>
        room.id === roomId
          ? { ...room, rows: room.rows.filter((row) => row.id !== rowId) }
          : room
      ),
    }));
  };

  /**
   * Handle input changes for entry rows
   */
  const handleRowChange = (
    roomId: string,
    rowId: string,
    field: keyof HorizontalniZaluzieEntryRow,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room) =>
        room.id === roomId
          ? {
              ...room,
              rows: room.rows.map((row) =>
                row.id === rowId ? { ...row, [field]: value } : row
              ),
            }
          : room
      ),
    }));
  };

  /**
   * Calculate area from width and height
   */
  const calculateArea = (width: string, height: string): string => {
    const w = parseFloat(width);
    const h = parseFloat(height);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      return ((w * h) / 1000000).toFixed(2); // Convert mm² to m²
    }
    return "";
  };

  /**
   * Auto-calculate area when width or height changes
   * Uses functional update to avoid stale closure issues with rapid changes
   */
  const handleDimensionChange = (
    roomId: string,
    rowId: string,
    dimension: "width" | "height",
    value: string
  ) => {
    // Use functional update to read from current state, not stale closure
    setFormData((prev) => {
      const room = prev.rooms.find((r) => r.id === roomId);
      if (!room) return prev;

      const row = room.rows.find((r) => r.id === rowId);
      if (!row) return prev;

      // Calculate new dimensions using current row values from prev state
      const newWidth = dimension === "width" ? value : row.width;
      const newHeight = dimension === "height" ? value : row.height;
      const calculatedArea = calculateArea(newWidth, newHeight);

      // Update both dimension and area in a single state update
      return {
        ...prev,
        rooms: prev.rooms.map((r) =>
          r.id === roomId
            ? {
                ...r,
                rows: r.rows.map((rw) =>
                  rw.id === rowId
                    ? {
                        ...rw,
                        [dimension]: value,
                        area: calculatedArea || rw.area,
                      }
                    : rw
                ),
              }
            : r
        ),
      };
    });
  };

  /**
   * Apply validated prefill data to the form.
   * Prefill values are validated as "Raynet + ERP" pair.
   */
  const applyValidatedPrefill = (prefill: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    raynet_id: number;
    erp_customer_id: number;
  }) => {
    setFormData((prev) => ({
      ...prev,
      name: prefill.name || prev.name,
      email: prefill.email || prev.email,
      phone: prefill.phone || prev.phone,
      address: prefill.address || prev.address,
      city: prefill.city || prev.city,
      raynet_id: prefill.raynet_id,
      erp_customer_id: prefill.erp_customer_id,
    }));
  };

  /**
   * Search for customers in Raynet + ERP by phone number.
   * Always shows results to user for selection (must pick 1 Raynet + 1 ERP).
   */
  const handlePhoneSearch = async () => {
    const phone = formData.phone.trim();

    // Validate phone number
    if (!phone || phone.length < 6) {
      setSearchError("Zadejte platné telefonní číslo (minimálně 6 číslic)");
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setRaynetCandidates([]);
    setErpCandidates([]);
    setSelectedRaynet(null);
    setSelectedErp(null);
    setShowCustomerSelection(false);
    setPairWarning(null);

    try {
      const result = await searchCustomersDual(phone);

      if (!result.success) {
        setSearchError(result.error || "Nepodařilo se vyhledat zákazníka");
        setIsSearching(false);
        return;
      }

      if (result.data) {
        const raynet = result.data.raynet.customers;
        const erp = result.data.erp.customers;

        setRaynetCandidates(raynet);
        setErpCandidates(erp);

        if (raynet.length === 0 && erp.length === 0) {
          setSearchError("Zákazník s tímto telefonním číslem nebyl nalezen v Raynet ani ERP");
        } else {
          setShowCustomerSelection(true);
        }
      } else {
        setSearchError("Nepodařilo se načíst výsledky vyhledávání");
      }
    } catch (error: any) {
      console.error("Error searching customers:", error);
      setSearchError("Došlo k chybě při vyhledávání. Zkuste to prosím znovu.");
    } finally {
      setIsSearching(false);
    }
  };

  /**
   * Validate the selected Raynet+ERP pair and apply prefill.
   */
  const handleValidateAndApply = async () => {
    if (!selectedRaynet || !selectedErp) {
      setPairWarning("⚠️ Vyberte prosím 1 zákazníka z Raynetu i z ERP.");
      return;
    }

    setIsValidatingPair(true);
    setPairWarning(null);

    try {
      const result = await validateCustomerPair(selectedRaynet, selectedErp);
      if (!result.success || !result.data) {
        setPairWarning(result.error || "⚠️ Nepodařilo se ověřit dvojici Raynet + ERP.");
        return;
      }

      if (!result.data.ok) {
        setPairWarning(result.data.warning || "⚠️ KONFLIKT DAT: dvojice Raynet + ERP se neshoduje.");
        if (result.data.prefill) {
          applyValidatedPrefill(result.data.prefill);
        }
        return;
      }

      if (result.data.prefill) {
        applyValidatedPrefill(result.data.prefill);
        setShowCustomerSelection(false);
        setRaynetCandidates([]);
        setErpCandidates([]);
        setSelectedRaynet(null);
        setSelectedErp(null);
        setSearchError(null);
        setPairWarning(null);
      } else {
        setPairWarning("⚠️ Ověření proběhlo, ale chybí prefill data.");
      }
    } finally {
      setIsValidatingPair(false);
    }
  };

  /**
   * Clear customer search results
   */
  const handleClearSearch = () => {
    setRaynetCandidates([]);
    setErpCandidates([]);
    setSelectedRaynet(null);
    setSelectedErp(null);
    setShowCustomerSelection(false);
    setSearchError(null);
    setPairWarning(null);
  };

  /**
   * Unlink customers from form (Raynet + ERP)
   */
  const handleUnlinkCustomer = () => {
    setFormData((prev) => {
      const { raynet_id, erp_customer_id, ...rest } = prev;
      return rest;
    });
  };

  /**
   * Handle form submission
   * Uses updateForm if formId is provided, otherwise uses submitForm
   */
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      let result;
      if (isEditMode && formId) {
        // Update existing form
        result = await updateForm(formId, formData);
      } else {
        // Create new form (optionally link to order)
        result = await submitForm("horizontalni-zaluzie", formData, orderId ?? undefined);
      }

      if (result.success) {
        setSubmitSuccess(true);
        // In edit mode, we don't reset the form - user can continue editing
        // In create mode, optionally reset form after successful submission
        // if (!isEditMode) {
        //   setFormData(getDefaultFormData());
        // }
      } else {
        setSubmitError(
          result.error ||
            (isEditMode
              ? "Nepodařilo se aktualizovat formulář"
              : "Nepodařilo se uložit formulář")
        );
      }
    } catch (error: any) {
      console.error("Error submitting form:", error);
      setSubmitError("Došlo k neočekávané chybě. Zkuste to prosím znovu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-7xl">
        {/* Header with back link: to order when orderId present, else to home */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={orderId != null ? `/orders/${orderId}` : "/"}
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
            {orderId != null ? "Zpět k zakázce" : "Zpět na výběr formulářů"}
          </Link>
        </div>

        {/* Form Title */}
        <h1 className="mb-8 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          VÝROBNÍ DOKUMENTACE - Horizontální žaluzie
          {isEditMode && (
            <span className="ml-3 text-lg font-normal text-zinc-500 dark:text-zinc-400">
              (Úprava)
            </span>
          )}
        </h1>

        {/* Header Section */}
        <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Základní informace
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Name */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Jméno
              </label>
              {customerLockedFromOrder ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300">
                  {formData.name || "—"}
                </p>
              ) : (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleHeaderChange("name", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                  placeholder="Jméno a příjmení"
                />
              )}
            </div>

            {/* Email */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Email
              </label>
              {customerLockedFromOrder ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300">
                  {formData.email || "—"}
                </p>
              ) : (
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleHeaderChange("email", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                  placeholder="email@example.com"
                />
              )}
            </div>

            {/* Phone with Raynet search (hidden when customer from order) */}
            <div className="md:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Telefon
                {(formData.raynet_id || formData.erp_customer_id) && !customerLockedFromOrder && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Propojeno
                    {formData.raynet_id ? ` Raynet #${formData.raynet_id}` : ""}
                    {formData.erp_customer_id ? ` | ERP #${formData.erp_customer_id}` : ""}
                  </span>
                )}
                {customerLockedFromOrder && (
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    (z zakázky – nelze měnit)
                  </span>
                )}
              </label>
              {customerLockedFromOrder ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300">
                  {formData.phone || "—"}
                </p>
              ) : (
              <>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleHeaderChange("phone", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handlePhoneSearch();
                    }
                  }}
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                  placeholder="+420 ..."
                  disabled={isSearching}
                />
                <button
                  type="button"
                  onClick={handlePhoneSearch}
                  disabled={isSearching || !formData.phone.trim() || formData.phone.trim().length < 6}
                  className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                >
                  {isSearching ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Vyhledávání...
                    </>
                  ) : (
                    <>
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
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      Vyhledat v Raynet + ERP
                    </>
                  )}
                </button>
                {(formData.raynet_id || formData.erp_customer_id) && (
                  <button
                    type="button"
                    onClick={handleUnlinkCustomer}
                    className="flex items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-red-600 dark:bg-zinc-700 dark:text-red-400 dark:hover:bg-zinc-600"
                    title="Odpojit zákazníka (Raynet + ERP)"
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {/* Search Error */}
              {searchError && (
                <div className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {searchError}
                </div>
              )}

              {/* Pair Warning (conflicts etc.) */}
              {pairWarning && (
                <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
                  {pairWarning}
                </div>
              )}

              {/* Customer Selection: must choose 1 from Raynet and 1 from ERP */}
              {showCustomerSelection && (raynetCandidates.length > 0 || erpCandidates.length > 0) && (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
                  <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-700">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        Vyberte prosím 1 zákazníka z Raynetu a 1 zákazníka z ERP (bez konfliktu).
                      </p>
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                      >
                        Zavřít
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
                    {/* Raynet column */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          Raynet ({raynetCandidates.length})
                        </p>
                        {selectedRaynet && (
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">
                            Vybráno: #{selectedRaynet.id}
                          </span>
                        )}
                      </div>

                      {raynetCandidates.length === 0 ? (
                        <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400">
                          Žádní zákazníci v Raynet nebyli nalezeni.
                        </p>
                      ) : (
                        <div className="max-h-72 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700">
                          {raynetCandidates.map((c) => {
                            const isSelected = selectedRaynet?.id === c.id;
                            return (
                              <div
                                key={c.id}
                                className={`border-b border-zinc-200 px-3 py-2 transition-colors dark:border-zinc-700 ${
                                  isSelected
                                    ? "bg-accent/10 dark:bg-accent/20"
                                    : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                      {c.firstName} {c.lastName}
                                      {c.companyName && ` (${c.companyName})`}
                                    </p>
                                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                      {c.address.street && `${c.address.street}, `}
                                      {c.address.city && c.address.city}
                                      {c.address.zipCode && ` ${c.address.zipCode}`}
                                    </p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
                                      Tel: {c.contactInfo.tel1 || "N/A"} | Email: {c.contactInfo.email || "N/A"} | Raynet #{c.id}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedRaynet(c)}
                                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/20 ${
                                      isSelected
                                        ? "bg-accent text-white hover:bg-accent-hover"
                                        : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
                                    }`}
                                  >
                                    {isSelected ? "Vybráno" : "Vybrat"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* ERP column */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          ERP ({erpCandidates.length})
                        </p>
                        {selectedErp && (
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">
                            Vybráno: #{selectedErp.id}
                          </span>
                        )}
                      </div>

                      {erpCandidates.length === 0 ? (
                        <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400">
                          Žádní zákazníci v ERP nebyli nalezeni.
                        </p>
                      ) : (
                        <div className="max-h-72 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700">
                          {erpCandidates.map((c) => {
                            const isSelected = selectedErp?.id === c.id;
                            return (
                              <div
                                key={c.id}
                                className={`border-b border-zinc-200 px-3 py-2 transition-colors dark:border-zinc-700 ${
                                  isSelected
                                    ? "bg-accent/10 dark:bg-accent/20"
                                    : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                      {c.name || "—"}
                                    </p>
                                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                      {c.address && `${c.address}, `}
                                      {c.city || ""}
                                      {c.zipcode ? ` ${c.zipcode}` : ""}
                                    </p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
                                      Tel: {c.phone || "N/A"} | Email: {c.email || "N/A"} | ERP #{c.id}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedErp(c)}
                                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/20 ${
                                      isSelected
                                        ? "bg-accent text-white hover:bg-accent-hover"
                                        : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
                                    }`}
                                  >
                                    {isSelected ? "Vybráno" : "Vybrat"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Validate button */}
                  <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">
                        {selectedRaynet && selectedErp
                          ? "Vybráno 1× Raynet + 1× ERP. Klikněte na ověření."
                          : "Vyberte prosím 1× Raynet a 1× ERP."}
                      </p>
                      <button
                        type="button"
                        onClick={handleValidateAndApply}
                        disabled={!selectedRaynet || !selectedErp || isValidatingPair}
                        className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-zinc-800"
                      >
                        {isValidatingPair ? "Ověřuji..." : "Ověřit & použít"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              </>
              )}
            </div>

            {/* Address */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Adresa
              </label>
              {customerLockedFromOrder ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300">
                  {formData.address || "—"}
                </p>
              ) : (
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleHeaderChange("address", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                  placeholder="Ulice, č.p."
                />
              )}
            </div>

            {/* City */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Město
              </label>
              {customerLockedFromOrder ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300">
                  {formData.city || "—"}
                </p>
              ) : (
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleHeaderChange("city", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                  placeholder="Město"
                />
              )}
            </div>

            {/* Product */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Produkt
              </label>
              <input
                type="text"
                value={formData.product}
                onChange={(e) => handleHeaderChange("product", e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="HORIZONTÁLNÍ ŽALUZIE"
              />
            </div>

            {/* Supplier */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Dodavatel
              </label>
              <select
                value={formData.supplier}
                onChange={(e) => handleHeaderChange("supplier", e.target.value)}
                disabled={isLoadingManufacturers}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              >
                {isLoadingManufacturers ? (
                  <option value="">Načítání...</option>
                ) : manufacturersError ? (
                  <option value="">Chyba při načítání</option>
                ) : manufacturers.length === 0 ? (
                  <option value="">Žádní dodavatelé</option>
                ) : (
                  manufacturers.map((manufacturer) => (
                    <option key={manufacturer.id} value={manufacturer.name}>
                      {manufacturer.name}
                    </option>
                  ))
                )}
              </select>
              {manufacturersError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {manufacturersError}
                </p>
              )}
            </div>

            {/* Product Type */}
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Typ produktu
              </label>
              <input
                type="text"
                value={formData.productType}
                onChange={(e) =>
                  handleHeaderChange("productType", e.target.value)
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="PRIM / ISOLINE / LOCO / ATYP - ECO nebo ECO R / ISOTRA 25 / INTERIEROVÁ - TYP:"
              />
            </div>

            {/* Slat Type */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Lamela
              </label>
              <select
                value={formData.slatType}
                onChange={(e) => handleHeaderChange("slatType", e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              >
                <option value="">Vyberte</option>
                <option value="25x0,18">25x0,18</option>
                <option value="25x0,21">25x0,21</option>
                <option value="16x0,21">16x0,21</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Stav
              </label>
              <select
                value={formData.status}
                onChange={(e) => handleHeaderChange("status", e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              >
                <option value="">Vyberte stav</option>
                <option value="NOVÉ OKNA">NOVÉ OKNA</option>
                <option value="DEMONTUJÍ SAMI">DEMONTUJÍ SAMI</option>
                <option value="DEMONTÁŽ">DEMONTÁŽ</option>
              </select>
            </div>

            {/* Installation Type */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Montáž do
              </label>
              <select
                value={formData.installationType}
                onChange={(e) =>
                  handleHeaderChange("installationType", e.target.value)
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              >
                <option value="">Vyberte typ</option>
                <option value="PLAST">PLAST</option>
                <option value="DŘEVO">DŘEVO</option>
                <option value="HLINÍK">HLINÍK</option>
                <option value="JINÉ">JINÉ</option>
              </select>
            </div>

            {/* Glazing Strip Depth */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Hloubka zasklívací lišty (mm)
              </label>
              <input
                type="number"
                value={formData.glazingStripDepth}
                onChange={(e) =>
                  handleHeaderChange("glazingStripDepth", e.target.value)
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="mm"
              />
            </div>
          </div>
        </div>

        {/* Rooms Section */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Místnosti a horizontální žaluzie
            </h2>
            <button
              onClick={handleAddRoom}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-zinc-800"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Přidat místnost
            </button>
          </div>

          {formData.rooms.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-800">
              <p className="text-zinc-500 dark:text-zinc-400">
                Zatím nejsou přidány žádné místnosti. Klikněte na tlačítko výše
                pro přidání první místnosti.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {formData.rooms.map((room, roomIndex) => (
                <div
                  key={room.id}
                  className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  {/* Room Header */}
                  <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-700/50">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Název místnosti
                        </label>
                        <input
                          type="text"
                          value={room.name}
                          onChange={(e) =>
                            handleRoomNameChange(room.id, e.target.value)
                          }
                          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                          placeholder="Např. Obývací pokoj"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAddRow(room.id)}
                          className="flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
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

                  {/* Room Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-zinc-100 dark:bg-zinc-700">
                        <tr>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            #
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            Ovládání
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            Šířka
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            Výška
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            m²
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            Řetízek
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            Výbava
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            BP
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            Podložka
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            Fixace
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            Uchycení
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            Rám barva
                          </th>
                          <th className="border border-zinc-300 px-1 py-2 text-left font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                            Lamela
                          </th>
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
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <select
                                value={row.control}
                                onChange={(e) =>
                                  handleRowChange(
                                    room.id,
                                    row.id,
                                    "control",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
                              >
                                <option value="">-</option>
                                <option value="L">L</option>
                                <option value="P">P</option>
                              </select>
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <input
                                type="number"
                                value={row.width}
                                onChange={(e) =>
                                  handleDimensionChange(
                                    room.id,
                                    row.id,
                                    "width",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
                                placeholder="mm"
                              />
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <input
                                type="number"
                                value={row.height}
                                onChange={(e) =>
                                  handleDimensionChange(
                                    room.id,
                                    row.id,
                                    "height",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
                                placeholder="mm"
                              />
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <input
                                type="text"
                                value={row.area}
                                readOnly
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs text-zinc-500 dark:text-zinc-400"
                                placeholder="Auto"
                              />
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <input
                                type="text"
                                value={row.chain}
                                onChange={(e) =>
                                  handleRowChange(
                                    room.id,
                                    row.id,
                                    "chain",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
                                placeholder="Řetízek"
                              />
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <select
                                value={row.equipment}
                                onChange={(e) =>
                                  handleRowChange(
                                    room.id,
                                    row.id,
                                    "equipment",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
                              >
                                <option value="">-</option>
                                <option value="ne">ne</option>
                                <option value="B">B</option>
                                <option value="NP">NP</option>
                              </select>
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <select
                                value={row.bp}
                                onChange={(e) =>
                                  handleRowChange(
                                    room.id,
                                    row.id,
                                    "bp",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
                              >
                                <option value="">-</option>
                                <option value="A">A</option>
                                <option value="N">N</option>
                              </select>
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <input
                                type="text"
                                value={row.pad}
                                onChange={(e) =>
                                  handleRowChange(
                                    room.id,
                                    row.id,
                                    "pad",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
                                placeholder="ks / N"
                              />
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <select
                                value={row.fixation}
                                onChange={(e) =>
                                  handleRowChange(
                                    room.id,
                                    row.id,
                                    "fixation",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
                              >
                                <option value="">-</option>
                                <option value="S">S</option>
                                <option value="PVC">PVC</option>
                                <option value="KOV">KOV</option>
                                <option value="ČERVÍK">ČERVÍK</option>
                              </select>
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <select
                                value={row.mounting}
                                onChange={(e) =>
                                  handleRowChange(
                                    room.id,
                                    row.id,
                                    "mounting",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
                              >
                                <option value="">-</option>
                                <option value="S">S</option>
                                <option value="SR30">SR30</option>
                                <option value="SR30/1">SR30/1</option>
                              </select>
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <input
                                type="text"
                                value={row.frameColor}
                                onChange={(e) =>
                                  handleRowChange(
                                    room.id,
                                    row.id,
                                    "frameColor",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
                                placeholder="Barva"
                              />
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              <input
                                type="text"
                                value={row.slat}
                                onChange={(e) =>
                                  handleRowChange(
                                    room.id,
                                    row.id,
                                    "slat",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700"
                                placeholder="Lamela"
                              />
                            </td>
                            <td className="border border-zinc-300 px-1 py-1 dark:border-zinc-600">
                              {room.rows.length > 1 && (
                                <button
                                  onClick={() =>
                                    handleRemoveRow(room.id, row.id)
                                  }
                                  className="rounded px-1 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                  title="Odstranit řádek"
                                >
                                  <svg
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              )}
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

        {/* Footer Section */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Dodatečné informace
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Ladder */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Žebřík
              </label>
              <select
                value={formData.ladder}
                onChange={(e) => handleHeaderChange("ladder", e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              >
                <option value="">Vyberte</option>
                <option value="NE">NE</option>
                <option value="M">M</option>
                <option value="SCHOD.">SCHOD.</option>
                <option value="ÁČKO">ÁČKO</option>
              </select>
            </div>

            {/* Ladder Height */}
            {formData.ladder && formData.ladder !== "NE" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Výška žebříku
                </label>
                <input
                  type="text"
                  value={formData.ladderHeight}
                  onChange={(e) =>
                    handleHeaderChange("ladderHeight", e.target.value)
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                  placeholder="Výška"
                />
              </div>
            )}

            {/* Total Area */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Celkem m²
              </label>
              <input
                type="text"
                value={formData.totalArea}
                onChange={(e) =>
                  handleHeaderChange("totalArea", e.target.value)
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="0.00"
              />
            </div>

            {/* Total Count */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Celkem ks
              </label>
              <input
                type="text"
                value={formData.totalCount}
                onChange={(e) =>
                  handleHeaderChange("totalCount", e.target.value)
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="0"
              />
            </div>

            {/* Slat Verified */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Lamela ověřena
              </label>
              <select
                value={formData.slatVerified}
                onChange={(e) =>
                  handleHeaderChange("slatVerified", e.target.value)
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              >
                <option value="">Vyberte</option>
                <option value="V SYSTÉMU">V SYSTÉMU</option>
                <option value="DISCORD">DISCORD</option>
                <option value="VOLÁNO">VOLÁNO</option>
              </select>
            </div>
          </div>
        </div>

        {/* Submit Section */}
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex flex-col gap-4">
            {/* Success Message */}
            {submitSuccess && (
              <div className="rounded-md bg-green-50 p-4 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-400">
                <div className="flex items-center gap-2">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>
                    {isEditMode
                      ? "Formulář byl úspěšně aktualizován!"
                      : "Formulář byl úspěšně uložen!"}
                  </span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {submitError && (
              <div className="rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
                <div className="flex items-center gap-2">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span>{submitError}</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 rounded-md bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-zinc-800"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="h-5 w-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Ukládám...
                </>
              ) : (
                <>
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {isEditMode ? "Aktualizovat formulář" : "Uložit formulář"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
