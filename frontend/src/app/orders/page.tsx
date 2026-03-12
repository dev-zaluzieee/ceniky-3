import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { fetchOrdersServer } from "@/lib/orders-server";
import OrdersListClient from "./OrdersListClient";

/**
 * Orders list page (zakázky) - Server Component.
 * Fetches orders on the server and passes to Client Component.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    fromRaynetEventId?: string;
    prefillPhone?: string;
    prefillAddress?: string;
    prefillName?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const result = await fetchOrdersServer();

  if (!result.success) {
    return (
      <OrdersListClient
        orders={[]}
        pagination={null}
        error={result.error || "Nepodařilo se načíst zakázky"}
        fromRaynetEventId={resolvedSearchParams?.fromRaynetEventId}
        initialPhone={resolvedSearchParams?.prefillPhone}
        initialAddress={resolvedSearchParams?.prefillAddress}
        initialName={resolvedSearchParams?.prefillName}
      />
    );
  }

  return (
    <OrdersListClient
      orders={result.data || []}
      pagination={result.pagination || null}
      error={null}
      fromRaynetEventId={resolvedSearchParams?.fromRaynetEventId}
      initialPhone={resolvedSearchParams?.prefillPhone}
      initialAddress={resolvedSearchParams?.prefillAddress}
      initialName={resolvedSearchParams?.prefillName}
    />
  );
}
