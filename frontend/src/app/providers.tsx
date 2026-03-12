"use client";

import NetworkStatusBanner from "@/components/pwa/NetworkStatusBanner";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegister />
      <NetworkStatusBanner />
      {children}
    </>
  );
}
