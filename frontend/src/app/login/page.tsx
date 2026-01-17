import LoginClient from "./LoginClient";
import { validateCallbackUrl, getBaseUrl } from "@/lib/auth-utils";

/**
 * Login page - handles authentication for the portal
 * Supports both Google OAuth and Email/Token authentication
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  // Validate callbackUrl to prevent open redirect attacks
  const validatedCallbackUrl = validateCallbackUrl(params?.callbackUrl, getBaseUrl());
  return <LoginClient callbackUrl={validatedCallbackUrl || undefined} />;
}
