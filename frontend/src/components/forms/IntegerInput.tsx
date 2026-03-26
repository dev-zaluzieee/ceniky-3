"use client";

/**
 * Controlled integer field: keeps a local digit string while typing and commits a number on blur / Enter.
 * Avoids parseInt-on-every-keystroke issues (forced 0, leading zeros, awkward number-input behaviour).
 */

import React, { useCallback, useEffect, useState } from "react";

export type IntegerInputProps = {
  /** Committed value from parent state */
  value: number;
  /** Fires when the user finishes editing (blur or Enter) */
  onCommit: (next: number) => void;
  /** Used when the field is left empty or non-numeric after editing */
  emptyBlurValue: number;
  /** If true, a committed 0 is shown as blank when not editing */
  zeroAsEmpty?: boolean;
  min?: number;
  max?: number;
  transform?: (n: number) => number;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  style?: React.CSSProperties;
};

function valueToDraft(value: number, zeroAsEmpty: boolean | undefined): string {
  if (zeroAsEmpty && value === 0) return "";
  return String(value);
}

function clampInt(n: number, min?: number, max?: number): number {
  let x = n;
  if (min != null) x = Math.max(min, x);
  if (max != null) x = Math.min(max, x);
  return x;
}

export function IntegerInput({
  value,
  onCommit,
  emptyBlurValue,
  zeroAsEmpty,
  min,
  max,
  transform,
  className,
  id,
  disabled,
  "aria-label": ariaLabel,
  style,
}: IntegerInputProps) {
  const [draft, setDraft] = useState(() => valueToDraft(value, zeroAsEmpty));

  // When the parent value changes (save, programmatic set, blur commit), mirror it into the draft.
  useEffect(() => {
    setDraft(valueToDraft(value, zeroAsEmpty));
  }, [value, zeroAsEmpty]);

  const commit = useCallback(() => {
    const raw = draft.trim();
    let next: number;
    if (raw === "") {
      next = emptyBlurValue;
    } else {
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed)) {
        next = emptyBlurValue;
      } else {
        next = clampInt(parsed, min, max);
        if (transform) next = transform(next);
      }
    }
    onCommit(next);
    setDraft(valueToDraft(next, zeroAsEmpty));
  }, [draft, emptyBlurValue, min, max, transform, onCommit, zeroAsEmpty]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, "");
    setDraft(digitsOnly);
  };

  const handleBlur = () => {
    commit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      id={id}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
      style={style}
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
