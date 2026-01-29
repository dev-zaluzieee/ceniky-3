import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { fetchOrderByIdServer } from "@/lib/orders-server";
import { fetchFormsServer } from "@/lib/forms-server";
import OrderDetailClient from "./OrderDetailClient";

/**
 * Order detail page (zakázka) – Server Component
 * Fetches order and its forms on the server and passes to Client Component
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    notFound();
  }

  const [orderResult, formsResult] = await Promise.all([
    fetchOrderByIdServer(orderId),
    fetchFormsServer({ order_id: orderId }),
  ]);

  if (!orderResult.success || !orderResult.data) {
    if (orderResult.error === "Order not found") {
      notFound();
    }
    redirect("/orders?error=fetch_failed");
  }

  const order = orderResult.data;
  const forms = formsResult.success ? formsResult.data || [] : [];
  const formsPagination = formsResult.pagination || null;

  return (
    <OrderDetailClient
      order={order}
      forms={forms}
      formsPagination={formsPagination}
    />
  );
}
