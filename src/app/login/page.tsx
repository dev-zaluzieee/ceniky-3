import LoginClient from "./LoginClient";

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
  return <LoginClient callbackUrl={params?.callbackUrl} />;
}
