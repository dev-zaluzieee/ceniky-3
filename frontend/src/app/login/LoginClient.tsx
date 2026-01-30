"use client";
import { signIn } from "next-auth/react";
import { useState, FormEvent } from "react";

/**
 * Login client component with improved styling
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
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Main card */}
        <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg p-8 sm:p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
              Přihlášení
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Výrobní dokumentace — OVT
            </p>
          </div>

          {/* Login method toggle */}
          <div className="flex gap-2 mb-8 border-b border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => {
                setLoginMethod("google");
                setError(null);
              }}
              className={`flex-1 py-3 text-center font-medium transition-all duration-200 ${
                loginMethod === "google"
                  ? "text-accent border-b-2 border-accent"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
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
              className={`flex-1 py-3 text-center font-medium transition-all duration-200 ${
                loginMethod === "token"
                  ? "text-accent border-b-2 border-accent"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              E‑mail / Token
            </button>
          </div>

          {/* Error messages */}
          {hasAccessDenied && (
            <div className="mb-6 p-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              Váš e‑mail není na seznamu povolených uživatelů.
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              {error}
            </div>
          )}

          {/* Google login */}
          {loginMethod === "google" && (
            <div className="space-y-6">
              <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
                Pokračujte přihlášením přes firemní Google účet.
              </p>
              <button
                onClick={onGoogleSignIn}
                className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-white shadow-sm transition-colors duration-200 hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-zinc-800"
              >
                Přihlásit se přes Google
              </button>
            </div>
          )}

          {/* Token login form */}
          {loginMethod === "token" && (
            <form onSubmit={onTokenSignIn} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  E‑mail
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 placeholder-zinc-400 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 dark:disabled:bg-zinc-800"
                  placeholder="vas.email@example.com"
                />
              </div>
              <div>
                <label htmlFor="token" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Token
                </label>
                <input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                  disabled={isLoading}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 placeholder-zinc-400 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 dark:disabled:bg-zinc-800"
                  placeholder="Zadejte token"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !email.trim() || !token.trim()}
                className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-white shadow-sm transition-all duration-200 hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-zinc-800"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
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
