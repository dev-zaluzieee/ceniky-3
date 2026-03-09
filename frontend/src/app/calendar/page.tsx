import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import CalendarClient from "./CalendarClient";

/**
 * Kalendář – server component wrapper to enforce auth.
 */
export default async function CalendarPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  return <CalendarClient />;
}

