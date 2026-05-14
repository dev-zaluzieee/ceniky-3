import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, NetworkOnly, StaleWhileRevalidate, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Auth routes — never cache
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/auth"),
      handler: new NetworkOnly(),
    },
    // Mutations — never cache
    {
      matcher: ({ request }) =>
        ["POST", "PUT", "PATCH", "DELETE"].includes(request.method),
      handler: new NetworkOnly(),
    },
    // Form schemas — NetworkFirst with short timeout. StaleWhileRevalidate is
    // wrong here: a stale schema makes the validator demand missing fields or
    // skip required ones (the "first-open shows old data" bug). Schema must
    // be authoritative; cache is only a fallback when network is unavailable.
    // cacheName versioned (v2) so existing devices invalidate the legacy
    // "api-data" entries that mixed schema with list data.
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && url.pathname.startsWith("/api/forms"),
      handler: new NetworkFirst({
        cacheName: "api-forms-v2",
        networkTimeoutSeconds: 5,
      }),
    },
    // List/data feeds — stale-while-revalidate is fine: a one-render-old
    // orders list is acceptable, schema correctness is not affected.
    {
      matcher: ({ url, request }) =>
        request.method === "GET" &&
        (url.pathname.startsWith("/api/orders") ||
          url.pathname.startsWith("/api/customers") ||
          url.pathname.startsWith("/api/calculation")),
      handler: new StaleWhileRevalidate({
        cacheName: "api-data-v2",
      }),
    },
    // App navigation — network first with offline fallback
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 5,
      }),
    },
    // Spread default cache for static assets (_next/static, images, etc.)
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// One-shot cleanup of the legacy "api-data" cache (replaced by api-forms-v2
// and api-data-v2). Without this, devices that had the previous SW installed
// keep the old cache entries around until the browser evicts them on its own,
// occupying disk and potentially being served again if a future bug brings
// back a matching cacheName.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const legacyCacheNames = ["api-data"];
      const existing = await caches.keys();
      await Promise.all(
        existing
          .filter((name) => legacyCacheNames.includes(name))
          .map((name) => caches.delete(name))
      );
    })()
  );
});
