/**
 * Legacy edit URL: /forms/plise-zaluzie/[id]
 * Redirects to canonical URL under order: /orders/[orderId]/forms/[formId]
 */
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { fetchFormByIdServer } from "@/lib/forms-server";

export default async function PliseZaluzieFormEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const formId = parseInt(id, 10);
  if (isNaN(formId)) notFound();

  const formResponse = await fetchFormByIdServer(formId);
  if (!formResponse.success || !formResponse.data) {
    if (formResponse.error === "Form not found") notFound();
    redirect("/forms/list?error=fetch_failed");
  }

  const form = formResponse.data;
  if (form.form_type !== "plise-zaluzie") {
    redirect("/forms/list?error=invalid_form_type");
  }

  if (form.order_id != null) {
    redirect(`/orders/${form.order_id}/forms/${form.id}`);
  }
  redirect("/forms/list");
}
