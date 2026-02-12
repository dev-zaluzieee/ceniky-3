/**
 * Legacy create URL: /forms/horizontalni-zaluzie?orderId=...
 * Redirects to canonical URL: /orders/[orderId]/forms/create/horizontalni-zaluzie
 */
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";

export default async function HorizontalniZaluzieFormPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const orderIdParam = params.orderId;
  if (orderIdParam) {
    const id = parseInt(orderIdParam, 10);
    if (!isNaN(id)) redirect(`/orders/${id}/forms/create/horizontalni-zaluzie`);
  }
  redirect("/orders");
}
