"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

export interface SearchableSelectOption {
  code: string;
  name: string;
  note?: string | null;
}

interface SearchableSelectProps {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Show search input only when option count exceeds this threshold */
  searchThreshold?: number;
}

const MAX_DROPDOWN_HEIGHT = 280;
const VIEWPORT_PADDING = 8;

export default function SearchableSelect({
  value,
  options,
  onChange,
  disabled = false,
  className = "",
  searchThreshold = 0,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const showSearch = options.length > searchThreshold;

  const selectedOption = options.find((o) => o.code === value);
  const displayLabel = selectedOption
    ? `${selectedOption.name} (${selectedOption.code})`
    : value
      ? `— ${value} —`
      : "-";

  const filtered = search.trim()
    ? options.filter((o) => {
        const q = search.toLowerCase();
        return (
          o.name.toLowerCase().includes(q) ||
          o.code.toLowerCase().includes(q) ||
          (o.note && o.note.toLowerCase().includes(q))
        );
      })
    : options;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;

    // Prefer below; flip above if not enough space below and more space above
    const openAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxH = Math.min(MAX_DROPDOWN_HEIGHT, openAbove ? spaceAbove : spaceBelow);

    setPos({
      top: openAbove ? rect.top - maxH - 2 : rect.bottom + 2,
      left: rect.left,
      width: Math.max(rect.width, 220),
      maxHeight: maxH,
    });
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    updatePosition();
    setSearch("");
    setOpen(true);
  };

  const handleSelect = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && showSearch) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, showSearch]);

  // Close on outside click/touch
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, updatePosition]);

  const dropdown =
    open && pos
      ? createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] flex flex-col rounded-lg border border-zinc-300 bg-white shadow-xl dark:border-zinc-600 dark:bg-zinc-800"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
          >
            {showSearch && (
              <div className="shrink-0 border-b border-zinc-200 p-2 dark:border-zinc-700">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                  placeholder="Hledat..."
                />
              </div>
            )}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <button
                type="button"
                onClick={() => handleSelect("")}
                className={`w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                  !value ? "bg-accent/10 font-medium text-accent" : "text-zinc-500"
                }`}
              >
                -
              </button>
              {filtered.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => handleSelect(opt.code)}
                  className={`w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                    opt.code === value
                      ? "bg-accent/10 font-medium text-accent"
                      : "text-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {opt.name} ({opt.code})
                  {opt.note ? (
                    <span className="ml-1 text-xs text-zinc-400"> — {opt.note}</span>
                  ) : null}
                </button>
              ))}
              {filtered.length === 0 && search.trim() && (
                <p className="px-3 py-3 text-center text-sm text-zinc-400">
                  Nic nenalezeno
                </p>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`min-w-[4rem] w-full truncate rounded border-0 bg-transparent px-1 py-1 text-left text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent dark:focus:bg-zinc-700 md:text-xs ${
          disabled ? "cursor-not-allowed opacity-60 bg-zinc-100 dark:bg-zinc-800" : ""
        } ${className}`}
      >
        {displayLabel}
      </button>
      {dropdown}
    </>
  );
}
