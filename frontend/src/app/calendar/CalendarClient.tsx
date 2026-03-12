"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchRaynetEvents, RaynetEvent } from "@/lib/raynet-events";
import { getOrdersByRaynetEventIds } from "@/lib/orders-api";

function formatCzechDate(date: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTimeRange(from: string, till: string): string {
  const f = new Date(from.replace(" ", "T"));
  const t = new Date(till.replace(" ", "T"));
  const formatter = new Intl.DateTimeFormat("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatter.format(f)} – ${formatter.format(t)}`;
}

function parseFirstPhoneFromDescription(description: string | null): string | null {
  if (!description) return null;
  const text = description.replace(/<[^>]*>/g, " ");
  const match = text.match(/(\+?\d[\d\s]{5,})/);
  return match ? match[1].trim() : null;
}

function toTelHref(phone: string): string {
  // Keep a leading '+' and digits only for better dialer compatibility.
  const normalized = phone.trim();
  const hasPlus = normalized.startsWith("+");
  const digits = normalized.replace(/\D/g, "");
  return hasPlus ? `tel:+${digits}` : `tel:${digits}`;
}

function toAppleMapsHref(address: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(address)}`;
}

function formatAddress(event: RaynetEvent): string | null {
  if (event.meetingPlace) return event.meetingPlace;
  const addr = event.companyAddress;
  if (!addr) return null;
  const parts = [addr.street, addr.city, addr.zipCode].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Sort events chronologically for stable rendering order.
 * Primary key: scheduledFrom, secondary: scheduledTill, tertiary: id.
 */
function sortEventsByTime(events: RaynetEvent[]): RaynetEvent[] {
  return [...events].sort((a, b) => {
    const fromA = new Date(a.scheduledFrom.replace(" ", "T")).getTime();
    const fromB = new Date(b.scheduledFrom.replace(" ", "T")).getTime();
    if (fromA !== fromB) return fromA - fromB;

    const tillA = new Date(a.scheduledTill.replace(" ", "T")).getTime();
    const tillB = new Date(b.scheduledTill.replace(" ", "T")).getTime();
    if (tillA !== tillB) return tillA - tillB;

    return a.id - b.id;
  });
}

/**
 * Tablet-optimised calendar client for Raynet events.
 * Left: list of events for selected day, Right: event detail & action.
 */
export default function CalendarClient() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<RaynetEvent[]>([]);
  const [eventOrderMap, setEventOrderMap] = useState<Record<number, number>>({});
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || events[0] || null,
    [events, selectedEventId]
  );

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const dateStr = toDateString(selectedDate);
        const result = await fetchRaynetEvents(dateStr);
        if (!result.success || !result.data) {
          setError(result.error || "Nepodařilo se načíst události z Raynetu.");
          setEvents([]);
          setEventOrderMap({});
          return;
        }
        const sortedEvents = sortEventsByTime(result.data.events);
        setEvents(sortedEvents);
        setSelectedEventId(sortedEvents[0]?.id ?? null);
        if (sortedEvents.length > 0) {
          const eventIds = sortedEvents.map((event) => event.id);
          const linksResult = await getOrdersByRaynetEventIds(eventIds);
          if (linksResult.success && linksResult.data?.links) {
            const nextMap = linksResult.data.links.reduce<Record<number, number>>(
              (acc, link) => {
                acc[link.eventId] = link.orderId;
                return acc;
              },
              {}
            );
            setEventOrderMap(nextMap);
          } else {
            setEventOrderMap({});
          }
        } else {
          setEventOrderMap({});
        }
      } catch (e: any) {
        setError("Došlo k chybě při načítání kalendáře. Zkuste to prosím znovu.");
        setEvents([]);
        setEventOrderMap({});
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [selectedDate]);

  const handleDayOffset = (days: number) => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + days);
      return d;
    });
  };

  const handleCreateOrderFromEvent = () => {
    if (!selectedEvent) return;
    const existingOrderId = eventOrderMap[selectedEvent.id];
    if (existingOrderId) {
      router.push(`/orders/${existingOrderId}`);
      return;
    }

    const phone = parseFirstPhoneFromDescription(selectedEvent.description) || "";
    const address = formatAddress(selectedEvent) || "";
    const query = new URLSearchParams();
    query.set("fromRaynetEventId", String(selectedEvent.id));
    if (phone) query.set("prefillPhone", phone);
    if (address) query.set("prefillAddress", address);
    if (selectedEvent.company?.name) query.set("prefillName", selectedEvent.company.name);

    router.push(`/orders?${query.toString()}`);
  };

  const friendlyDateLabel = useMemo(() => {
    const today = new Date();
    const diffDays = Math.floor(
      (toDateString(selectedDate) > toDateString(today)
        ? selectedDate.getTime() - today.getTime()
        : today.getTime() - selectedDate.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (toDateString(selectedDate) === toDateString(today)) {
      return "Dnes";
    }
    return formatCzechDate(selectedDate);
  }, [selectedDate]);

  const selectedEventOrderId = selectedEvent
    ? eventOrderMap[selectedEvent.id]
    : undefined;
  const selectedEventAddress = selectedEvent ? formatAddress(selectedEvent) : null;
  const selectedEventPhone = selectedEvent
    ? parseFirstPhoneFromDescription(selectedEvent.description)
    : null;

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-zinc-900 text-zinc-50">
      <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-4 md:px-8">
        {/* Header / back link */}
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* Title + date selector */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-semibold md:text-3xl">Kalendář</h1>
          <div className="inline-flex items-center gap-3 rounded-full bg-zinc-800 px-4 py-2 text-sm">
            <button
              type="button"
              onClick={() => handleDayOffset(-1)}
              className="rounded-full bg-zinc-700 p-1.5 hover:bg-zinc-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div className="flex flex-col text-center">
              <span className="text-xs text-zinc-400">Vybraný den</span>
              <span className="font-medium">{friendlyDateLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => handleDayOffset(1)}
              className="rounded-full bg-zinc-700 p-1.5 hover:bg-zinc-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Main layout */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          {/* Left: events list */}
          <div className="min-h-0 md:w-1/2">
            <div className="flex h-full min-h-0 flex-col rounded-2xl bg-zinc-950/60 p-3 md:p-4">
              <h2 className="mb-3 text-sm font-medium text-zinc-300">
                Události v Raynetu ({events.length})
              </h2>

              {isLoading && (
                <div className="flex items-center justify-center py-10 text-sm text-zinc-400">
                  Načítám události...
                </div>
              )}

              {!isLoading && error && (
                <div className="rounded-lg bg-red-900/30 p-4 text-sm text-red-200">
                  {error}
                </div>
              )}

              {!isLoading && !error && events.length === 0 && (
                <div className="rounded-lg bg-zinc-900/60 p-6 text-sm text-zinc-400">
                  Pro vybraný den nejsou v Raynetu žádné události v povolených kategoriích.
                </div>
              )}

              {!isLoading && !error && events.length > 0 && (
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                  {events.map((event) => {
                    const active = selectedEvent?.id === event.id;
                    const address = formatAddress(event);
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => setSelectedEventId(event.id)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                          active
                            ? "border-emerald-400 bg-emerald-900/40"
                            : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold">
                            {event.title || "Bez názvu"}
                          </div>
                          <div className="flex items-center gap-2">
                            {eventOrderMap[event.id] ? (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                                Zakázka #{eventOrderMap[event.id]}
                              </span>
                            ) : null}
                            <div className="text-xs text-zinc-400">
                              {formatTimeRange(event.scheduledFrom, event.scheduledTill)}
                            </div>
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-zinc-400">
                          {event.company?.name ?? "Bez firmy"}
                        </div>
                        {address && (
                          <div className="mt-1 text-xs text-zinc-500">{address}</div>
                        )}
                        {event.tags?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {event.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: selected event detail */}
          <div className="min-h-0 md:w-1/2">
            <div className="flex h-full min-h-0 flex-col rounded-2xl bg-zinc-950/60 p-4">
              {selectedEvent ? (
                <>
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {selectedEvent.title || "Událost"}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        {formatTimeRange(
                          selectedEvent.scheduledFrom,
                          selectedEvent.scheduledTill
                        )}
                      </p>
                    </div>
                    <div className="text-right text-xs text-zinc-500">
                      <div>Raynet ID: {selectedEvent.id}</div>
                      {selectedEvent.category && (
                        <div className="mt-1">
                          {selectedEvent.category.value} #{selectedEvent.category.id}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mb-3 rounded-xl bg-zinc-900/80 p-3 text-sm">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Zákazník
                    </h3>
                    <p className="text-sm">
                      {selectedEvent.company?.name ?? "Neuvedená společnost"}
                    </p>
                    {selectedEventAddress && (
                      <p className="mt-1 text-xs">
                        <a
                          href={toAppleMapsHref(selectedEventAddress)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-400 underline decoration-zinc-600 transition-colors hover:text-zinc-200"
                        >
                          {selectedEventAddress}
                        </a>
                      </p>
                    )}
                    {selectedEventPhone && (
                      <p className="mt-1 text-xs">
                        <span className="text-zinc-400">Tel: </span>
                        <a
                          href={toTelHref(selectedEventPhone)}
                          className="text-zinc-300 underline decoration-zinc-600 transition-colors hover:text-zinc-100"
                        >
                          {selectedEventPhone}
                        </a>
                      </p>
                    )}
                  </div>

                  <div className="mb-4 flex-1 overflow-y-auto rounded-xl bg-zinc-900/80 p-3 text-sm">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Informace o události
                    </h3>
                    {selectedEvent.description ? (
                      <div
                        className="prose prose-invert max-w-none text-xs leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: selectedEvent.description }}
                      />
                    ) : (
                      <p className="text-xs text-zinc-400">Bez detailního popisu.</p>
                    )}
                  </div>

                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCreateOrderFromEvent}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-950 transition-colors hover:bg-emerald-400"
                    >
                      {selectedEventOrderId
                        ? `Přejít na existující zakázku #${selectedEventOrderId}`
                        : "Vytvořit zakázku z této události"}
                    </button>
                    <p className="text-xs text-zinc-500">
                      {selectedEventOrderId
                        ? "Zakázka pro tuto událost už existuje."
                        : "V dalším kroku vyberete odpovídající ERP zakázku a pokračujete ve workflow na stránce zakázky."}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                  Vyberte událost vlevo pro zobrazení detailu.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

