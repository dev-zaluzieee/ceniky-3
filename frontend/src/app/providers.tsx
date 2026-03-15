"use client";

import NetworkStatusBanner from "@/components/pwa/NetworkStatusBanner";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import { ModeProvider } from "@/lib/mode-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ModeProvider>
      <ServiceWorkerRegister />
      <NetworkStatusBanner />
      {children}
    </ModeProvider>
  );
}
