"use client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatIban } from "@/lib/spd-qr";

interface QrPaymentModalProps {
  open: boolean;
  onClose: () => void;
  spdString: string;
  account: string;
  amount: number;
  variableSymbol: number;
  message?: string;
}

export default function QrPaymentModal({
  open,
  onClose,
  spdString,
  account,
  amount,
  variableSymbol,
  message,
}: QrPaymentModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">QR platba</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* QR Code */}
        <div className="mb-5 flex justify-center">
          <div className="rounded-lg bg-white p-4">
            <QRCodeSVG value={spdString} size={256} level="M" />
          </div>
        </div>

        {/* Payment details */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-400">Účet</span>
            <span className="font-mono text-zinc-100">{formatIban(account)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Částka</span>
            <span className="text-zinc-100">{amount.toLocaleString("cs-CZ")} Kč</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">VS</span>
            <span className="font-mono text-zinc-100">{variableSymbol}</span>
          </div>
          {message && (
            <div className="flex justify-between">
              <span className="text-zinc-400">Zpráva</span>
              <span className="text-zinc-100">{message}</span>
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-zinc-700 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-600"
        >
          Zavřít
        </button>
      </div>
    </div>
  );
}
