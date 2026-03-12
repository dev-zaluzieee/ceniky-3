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
    // Safe GET API routes — stale-while-revalidate for fast reads
    {
      matcher: ({ url, request }) =>
        request.method === "GET" &&
        (url.pathname.startsWith("/api/forms") ||
          url.pathname.startsWith("/api/orders") ||
          url.pathname.startsWith("/api/customers") ||
          url.pathname.startsWith("/api/calculation")),
      handler: new StaleWhileRevalidate({
        cacheName: "api-data",
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
