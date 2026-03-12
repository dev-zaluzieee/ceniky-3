"use client";

import { useState } from "react";
import Link from "next/link";
import { OrderRecord, OrdersPaginationInfo } from "@/lib/orders-api";

interface OrdersListClientProps {
  orders: OrderRecord[];
  pagination: OrdersPaginationInfo | null;
  error: string | null;
}

/** Format date to Czech locale */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("cs-CZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function OrdersListClient({
  orders: initialOrders,
  pagination: initialPagination,
  error: initialError,
}: OrdersListClientProps) {
  const [orders] = useState(initialOrders);
  const [pagination] = useState(initialPagination);
  const [error] = useState<string | null>(initialError);

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="mb-4 flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              Zakázky
            </h1>
            <Link
              href="/calendar"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-zinc-800"
            >
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Založit zakázku
            </Link>
          </div>
          {pagination && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Celkem {pagination.total} zakázek
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">
              {error}
            </p>
          </div>
        )}

        {/* Empty state */}
        {!error && orders.length === 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-800">
            <p className="text-zinc-600 dark:text-zinc-400">
              Zatím nemáte žádné zakázky. Přejděte do kalendáře a vytvořte zakázku z události.
            </p>
            <Link
              href="/calendar"
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Přejít do kalendáře
            </Link>
          </div>
        )}

        {/* Orders list */}
        {!error && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="block rounded-lg border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {order.name || "—"}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Zakázka #{order.id}
                      </span>
                    </div>
                    <div className="space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                      {order.phone && <p>Tel: {order.phone}</p>}
                      {order.address && (
                        <p>
                          {order.address}
                          {order.city ? `, ${order.city}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                    Vytvořeno: {formatDate(order.created_at)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
