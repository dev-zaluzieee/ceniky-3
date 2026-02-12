/**
 * Legacy create URL: /forms/textile-rolety?orderId=...
 * Redirects to canonical URL: /orders/[orderId]/forms/create/textile-rolety
 */
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";

export default async function TextileRoletyFormPage({
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
    if (!isNaN(id)) redirect(`/orders/${id}/forms/create/textile-rolety`);
  }
  redirect("/orders");
}
