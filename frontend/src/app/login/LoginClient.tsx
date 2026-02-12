"use client";
import { signIn } from "@/lib/auth";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Login client component with improved styling
 * Uses Supabase Auth via calculation backend
 */
export default function LoginClient({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn(email.trim(), password);

      if (!result.success) {
        setError(result.message || "Neplatný e‑mail nebo heslo");
      } else {
        // Redirect to callback URL or home
        const redirectUrl = callbackUrl || "/";
        router.push(redirectUrl);
        router.refresh(); // Refresh to update session
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

          {/* Error messages */}
          {error && (
            <div className="mb-6 p-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              {error}
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleSignIn} className="space-y-5">
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
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Heslo
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 placeholder-zinc-400 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50 dark:placeholder-zinc-500 dark:disabled:bg-zinc-800"
                placeholder="Zadejte heslo"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !email.trim() || !password.trim()}
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
        </div>
      </div>
    </div>
  );
}
