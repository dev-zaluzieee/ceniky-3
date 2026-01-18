"use client";

import Link from "next/link";
import { FormRecord, FormType, PaginationInfo } from "@/lib/forms-api";
import { parseForm } from "@/parsers/forms";

/**
 * Map form type to display name in Czech
 */
function getFormTypeDisplayName(formType: FormType): string {
  const displayNames: Record<FormType, string> = {
    "horizontalni-zaluzie": "Horizontální žaluzie",
    "plise-zaluzie": "Plisé žaluzie",
    "site": "Okenní sítě / Dveřní sítě",
    "textile-rolety": "Textilní a D/N roletky",
    "universal": "Univerzální list",
  };
  return displayNames[formType] || formType;
}

/**
 * Get icon color class for form type
 */
function getFormTypeColor(formType: FormType): string {
  const colors: Record<FormType, string> = {
    "horizontalni-zaluzie": "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400",
    "plise-zaluzie": "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    "site": "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    "textile-rolety": "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    "universal": "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return colors[formType] || "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
}

/**
 * Format date to Czech locale
 */
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

/**
 * Get edit URL for a form based on its type
 * Returns null if edit is not yet implemented for this form type
 */
function getEditUrl(formType: FormType, formId: number): string | null {
  // All forms now have edit functionality implemented
  switch (formType) {
    case "universal":
      return `/forms/universal/${formId}`;
    case "horizontalni-zaluzie":
      return `/forms/horizontalni-zaluzie/${formId}`;
    case "plise-zaluzie":
      return `/forms/plise-zaluzie/${formId}`;
    case "site":
      return `/forms/site/${formId}`;
    case "textile-rolety":
      return `/forms/textile-rolety/${formId}`;
    default:
      return null;
  }
}

/**
 * Props for FormsListClient component
 */
interface FormsListClientProps {
  forms: FormRecord[];
  pagination: PaginationInfo | null;
  error: string | null;
}

/**
 * Client component for displaying forms list
 * Receives data as props from Server Component
 */
export default function FormsListClient({
  forms,
  pagination,
  error,
}: FormsListClientProps) {
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
            Zpět na výběr formulářů
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Vytvořené formuláře
          </h1>
          {pagination && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Celkem {pagination.total} formulář{pagination.total !== 1 ? "ů" : ""}
            </p>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-center gap-3">
              <svg
                className="h-5 w-5 text-red-600 dark:text-red-400"
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
              <p className="text-sm font-medium text-red-800 dark:text-red-400">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!error && forms.length === 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-800">
            <svg
              className="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Zatím nemáte žádné formuláře
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Vytvořte svůj první formulář výběrem z hlavní stránky
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Přejít na výběr formulářů
            </Link>
          </div>
        )}

        {/* Forms List */}
        {!error && forms.length > 0 && (
          <div className="space-y-4">
            {forms.map((form) => {
              // Use parser to extract form information
              const parsedInfo = parseForm(form.form_type, form.form_json);
              return (
                <div
                  key={form.id}
                  className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left side - Form info */}
                    <div className="flex-1">
                      <div className="mb-3 flex items-center gap-3">
                        <span
                          className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-medium ${getFormTypeColor(form.form_type)}`}
                        >
                          {getFormTypeDisplayName(form.form_type)}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          ID: {form.id}
                        </span>
                      </div>

                      {/* Preview data - using parsed information */}
                      <div className="space-y-1 text-sm">
                        {parsedInfo.name && (
                          <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-50">
                            <svg
                              className="h-4 w-4 text-zinc-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                            <span>{parsedInfo.name}</span>
                          </div>
                        )}
                        {parsedInfo.address && (
                          <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                            <svg
                              className="h-4 w-4 text-zinc-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                            <span>{parsedInfo.address}</span>
                            {parsedInfo.city && <span>, {parsedInfo.city}</span>}
                          </div>
                        )}
                        {parsedInfo.phone && (
                          <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                            <svg
                              className="h-4 w-4 text-zinc-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                              />
                            </svg>
                            <span>{parsedInfo.phone}</span>
                          </div>
                        )}
                        {!parsedInfo.name && !parsedInfo.address && !parsedInfo.phone && (
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            Žádné dostupné informace
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right side - Date and Actions */}
                    <div className="flex flex-col items-end gap-3">
                      <div className="text-right">
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          Vytvořeno
                        </div>
                        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {formatDate(form.created_at)}
                        </div>
                      </div>
                      {/* Edit button - only show if edit is available for this form type */}
                      {getEditUrl(form.form_type, form.id) && (
                        <Link
                          href={getEditUrl(form.form_type, form.id)!}
                          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-800"
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
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                          Upravit
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
