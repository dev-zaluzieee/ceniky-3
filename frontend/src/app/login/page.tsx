import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import LoginClient from "./LoginClient";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await getServerSession();
  if (session) redirect("/");

  const params = await searchParams;
  return <LoginClient callbackUrl={params.callbackUrl} />;
}
