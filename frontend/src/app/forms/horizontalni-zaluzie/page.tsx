"use client";

import { useState } from "react";
import Link from "next/link";
import { submitForm } from "@/lib/forms-api";

/**
 * Entry row interface for horizontal blind entries
 */
interface EntryRow {
  id: string;
  control: string; // Ovládání - L / P
  width: string;
  height: string;
  area: string;
  chain: string; // Řetízek
  equipment: string; // Výbava - ne / B / NP
  bp: string; // BP - A / N
  pad: string; // Podložka - ks / N
  fixation: string; // Fixace / bez silonu - S / PVC / KOV / ČERVÍK
  mounting: string; // Uchycení - S / SR30 / SR30/1
  frameColor: string;
  slat: string; // Lamela
}

/**
 * Room interface - each room can have multiple entry rows
 */
interface Room {
  id: string;
  name: string;
  rows: EntryRow[];
}

/**
 * Form data interface for horizontal blinds form
 */
interface FormData {
  // Header section
  phone: string;
  address: string;
  city: string;
  product: string;
  supplier: string;
  productType: string; // Typ produktu
  slatType: string; // Lamela - 25x0,18 / 25x0,21 / 16x0,21
  status: string;
  installationType: string;
  glazingStripDepth: string; // Hloubka zasklívací lišty
  // Rooms with their entries
  rooms: Room[];
  // Footer section
  ladder: string;
  ladderHeight: string;
  totalArea: string;
  totalCount: string; // Celkem: ks
  slatVerified: string;
}

export default function HorizontalniZaluzieForm() {
  // Initialize form state with empty values
  const [formData, setFormData] = useState<FormData>({
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

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  /**
   * Generate unique ID for rooms and rows
   */
  const generateId = (): string => {
    return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  /**
   * Create a new empty entry row
   */
  const createEmptyRow = (): EntryRow => ({
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
  const createEmptyRoom = (): Room => ({
    id: generateId(),
    name: "",
    rows: [createEmptyRow()],
  });

  /**
   * Handle input changes for header fields
   */
  const handleHeaderChange = (
    field: keyof Omit<FormData, "rooms">,
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
    field: keyof EntryRow,
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
   * Handle form submission
   */
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const result = await submitForm("horizontalni-zaluzie", formData);

      if (result.success) {
        setSubmitSuccess(true);
        // Reset form after successful submission (optional)
        // setFormData({ ...initialFormData });
      } else {
        setSubmitError(result.error || "Nepodařilo se uložit formulář");
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
            Zpět na výběr formulářů
          </Link>
        </div>

        {/* Form Title */}
        <h1 className="mb-8 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          VÝROBNÍ DOKUMENTACE - Horizontální žaluzie
        </h1>

        {/* Header Section */}
        <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Základní informace
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Phone */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Telefon
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleHeaderChange("phone", e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="+420 ..."
              />
            </div>

            {/* Address */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Adresa
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleHeaderChange("address", e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="Ulice, č.p."
              />
            </div>

            {/* City */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Město
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => handleHeaderChange("city", e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="Město"
              />
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              >
                <option value="KASKO / JACKO / ISOTRA">
                  KASKO / JACKO / ISOTRA
                </option>
                <option value="KASKO">KASKO</option>
                <option value="JACKO">JACKO</option>
                <option value="ISOTRA">ISOTRA</option>
              </select>
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
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
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-800"
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
                          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                          placeholder="Např. Obývací pokoj"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAddRow(room.id)}
                          className="flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
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
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:bg-zinc-700"
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
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:bg-zinc-700"
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
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:bg-zinc-700"
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
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:bg-zinc-700"
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
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:bg-zinc-700"
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
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:bg-zinc-700"
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
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:bg-zinc-700"
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
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:bg-zinc-700"
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
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:bg-zinc-700"
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
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:bg-zinc-700"
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
                                className="w-full rounded border-0 bg-transparent px-1 py-1 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:bg-zinc-700"
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
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
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
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
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
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
                  <span>Formulář byl úspěšně uložen!</span>
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
              className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-zinc-800"
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
                  Uložit formulář
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
