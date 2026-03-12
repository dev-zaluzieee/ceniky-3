"use client";

import { useEffect, useState } from "react";

export default function NetworkStatusBanner() {
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    let hideBannerTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const goOffline = () => {
      if (hideBannerTimeoutId) {
        clearTimeout(hideBannerTimeoutId);
        hideBannerTimeoutId = null;
      }
      setIsOffline(true);
      setShowBanner(true);
    };

    const goOnline = () => {
      setIsOffline(false);
      // Keep banner visible briefly so user sees the transition
      hideBannerTimeoutId = setTimeout(() => setShowBanner(false), 3000);
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      if (hideBannerTimeoutId) {
        clearTimeout(hideBannerTimeoutId);
      }
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!showBanner && !isOffline) return null;

  return (
    <div
      role="status"
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors ${
        isOffline ? "bg-red-600" : "bg-green-600"
      }`}
    >
      {isOffline
        ? "Jste offline — zobrazená data mohou být neaktuální"
        : "Připojení obnoveno"}
    </div>
  );
}
