"use client";
import { signIn } from "next-auth/react";
import { useState, FormEvent } from "react";

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
    <div className="max-w-md mx-auto mt-24 bg-white border rounded-2xl shadow p-8">
      <h1 className="text-2xl font-bold mb-4 text-center">Přihlášení — Výrobní dokumentace</h1>

      {/* Login method toggle */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          type="button"
          onClick={() => {
            setLoginMethod("google");
            setError(null);
          }}
          className={`flex-1 py-2 text-center font-medium transition-colors ${
            loginMethod === "google"
              ? "text-[#0d6b57] border-b-2 border-[#0d6b57]"
              : "text-gray-600 hover:text-gray-800"
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
          className={`flex-1 py-2 text-center font-medium transition-colors ${
            loginMethod === "token"
              ? "text-[#0d6b57] border-b-2 border-[#0d6b57]"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          E‑mail / Token
        </button>
      </div>

      {/* Error messages */}
      {hasAccessDenied && (
        <div className="mb-4 text-red-700 bg-red-50 border border-red-200 rounded p-3">
          Váš e‑mail není na seznamu povolených uživatelů.
        </div>
      )}
      {error && (
        <div className="mb-4 text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</div>
      )}

      {/* Google login */}
      {loginMethod === "google" && (
        <div className="text-center">
          <p className="text-gray-700 mb-6">Pokračujte přihlášením přes firemní Google účet.</p>
          <button
            onClick={onGoogleSignIn}
            className="px-4 py-2 rounded-md bg-[#0d6b57] text-white hover:opacity-90"
          >
            Přihlásit se přes Google
          </button>
        </div>
      )}

      {/* Token login form */}
      {loginMethod === "token" && (
        <form onSubmit={onTokenSignIn} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              E‑mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0d6b57] focus:border-transparent disabled:bg-gray-100"
              placeholder="vas.email@example.com"
            />
          </div>
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
              Token
            </label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0d6b57] focus:border-transparent disabled:bg-gray-100"
              placeholder="Zadejte token"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !email.trim() || !token.trim()}
            className="w-full px-4 py-2 rounded-md bg-[#0d6b57] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Přihlašování..." : "Přihlásit se"}
          </button>
        </form>
      )}
    </div>
  );
}
