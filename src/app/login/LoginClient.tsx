"use client";
import { signIn } from "next-auth/react";
import { useState, FormEvent } from "react";

/**
 * Client component for login page
 * Supports both Google OAuth and Email/Token authentication
 */
export default function LoginClient({ callbackUrl }: { callbackUrl?: string }) {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const hasAccessDenied = params?.get("error") === "AccessDenied";
  const [loginMethod, setLoginMethod] = useState<"google" | "token">("google");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGoogleSignIn = () => signIn("google", { callbackUrl: callbackUrl || "/" });

  const onTokenSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        token: token.trim(),
        redirect: false,
        callbackUrl: callbackUrl || "/",
      });

      if (result?.error) {
        setError("Neplatný e‑mail nebo token");
      } else if (result?.ok) {
        // Redirect will happen automatically via NextAuth
        window.location.href = callbackUrl || "/";
      }
    } catch (err) {
      setError("Chyba při přihlášení. Zkuste to znovu.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-16 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-md">
        {/* Login Card */}
        <div className="rounded-lg border-2 border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              Přihlášení
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              OVT portál — Výrobní dokumentace
            </p>
          </div>

          {/* Login method toggle */}
          <div className="mb-6 flex gap-2 border-b border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => {
                setLoginMethod("google");
                setError(null);
              }}
              className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
                loginMethod === "google"
                  ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginMethod("token");
                setError(null);
              }}
              className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
                loginMethod === "token"
                  ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              E‑mail / Token
            </button>
          </div>

          {/* Error messages */}
          {hasAccessDenied && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              Váš e‑mail není na seznamu povolených uživatelů OVT portálu.
            </div>
          )}
          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Google login */}
          {loginMethod === "google" && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Pokračujte přihlášením přes firemní Google účet.
                </p>
              </div>
              <button
                onClick={onGoogleSignIn}
                className="w-full rounded-lg border-2 border-blue-500 bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-all hover:border-blue-600 hover:bg-blue-600 hover:shadow-md dark:border-blue-400 dark:bg-blue-600 dark:hover:border-blue-300 dark:hover:bg-blue-500"
              >
                Přihlásit se přes Google
              </button>
            </div>
          )}

          {/* Token login form */}
          {loginMethod === "token" && (
            <form onSubmit={onTokenSignIn} className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  E‑mail
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="w-full rounded-lg border-2 border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-blue-400 dark:disabled:bg-zinc-700"
                  placeholder="vas.email@example.com"
                />
              </div>
              <div>
                <label htmlFor="token" className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  Token
                </label>
                <input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                  disabled={isLoading}
                  className="w-full rounded-lg border-2 border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-blue-400 dark:disabled:bg-zinc-700"
                  placeholder="Zadejte token"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !email.trim() || !token.trim()}
                className="w-full rounded-lg border-2 border-blue-500 bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-all hover:border-blue-600 hover:bg-blue-600 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-400 dark:bg-blue-600 dark:hover:border-blue-300 dark:hover:bg-blue-500"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Přihlašování...
                  </span>
                ) : (
                  "Přihlásit se"
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
