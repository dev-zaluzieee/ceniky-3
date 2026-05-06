import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "inSign POC",
  description: "Demo integrace inSign pro ADMF formulář",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="font-sans">
        <header className="border-b border-[var(--border)] bg-white">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-6">
            <Link href="/" className="font-semibold">inSign POC</Link>
            <nav className="flex gap-4 text-sm text-[var(--muted)]">
              <Link href="/" className="hover:text-[var(--fg)]">Sezení</Link>
              <Link href="/sessions/new" className="hover:text-[var(--fg)]">Nové sezení</Link>
              <Link href="/webhooks" className="hover:text-[var(--fg)]">Webhooky</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
