import Link from "next/link";

export const metadata = {
  title: "Offline — OVT",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 text-6xl">📡</div>
      <h1 className="mb-2 text-2xl font-bold">Jste offline</h1>
      <p className="mb-8 max-w-md text-gray-600">
        Tato stránka není dostupná bez připojení k internetu. Některé dříve
        navštívené stránky mohou být stále dostupné.
      </p>
      <div className="flex gap-4">
        <Link
          href="/orders"
          className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-hover"
        >
          Objednávky
        </Link>
        <Link
          href="/forms/list"
          className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-hover"
        >
          Formuláře
        </Link>
      </div>
    </div>
  );
}
