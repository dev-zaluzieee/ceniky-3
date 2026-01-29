import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import PliseZaluzieFormClient from "./PliseZaluzieFormClient";
import { fetchOrderByIdServer } from "@/lib/orders-server";

/**
 * Plisé blinds form page - Server Component
 * When orderId is in searchParams, fetches order and passes customer as read-only (create under order).
 */
export default async function PliseZaluzieFormPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const params = await searchParams;
  const orderIdParam = params.orderId;
  let orderId: number | undefined;
  let customerFromOrder: { name?: string; email?: string; phone?: string; address?: string; city?: string } | undefined;

  if (orderIdParam) {
    const id = parseInt(orderIdParam, 10);
    if (!isNaN(id)) {
      const orderResult = await fetchOrderByIdServer(id);
      if (orderResult.success && orderResult.data) {
        orderId = id;
        customerFromOrder = {
          name: orderResult.data.name ?? undefined,
          email: orderResult.data.email ?? undefined,
          phone: orderResult.data.phone ?? undefined,
          address: orderResult.data.address ?? undefined,
          city: orderResult.data.city ?? undefined,
        };
      }
    }
  }

  // Create form requires an order (customer); redirect to orders if missing
  if (orderId == null) {
    redirect("/orders");
  }

  return <PliseZaluzieFormClient orderId={orderId} customerFromOrder={customerFromOrder} />;
}
