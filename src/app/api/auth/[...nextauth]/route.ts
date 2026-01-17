import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { NextRequest } from "next/server";

/**
 * NextAuth configuration with Google OAuth and Email/Token authentication
 * Uses REPORTING_BACKEND_API_URL for authentication checks
 */
export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" },
    },
  },
  providers: [
    GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! }),
    CredentialsProvider({
      name: "Email/Token",
      credentials: {
        email: { label: "Email", type: "email" },
        token: { label: "Token", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.token) {
          return null;
        }

        try {
          // Use REPORTING_BACKEND_API_URL instead of BACKEND_API_URL
          const base = process.env.REPORTING_BACKEND_API_URL || process.env.NEXT_PUBLIC_REPORTING_BACKEND_URL!;
          const url = new URL(base);
          url.pathname = "/auth/ovt/validate-token";

          const res = await fetch(url.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              token: credentials.token,
            }),
            cache: "no-store",
          });

          const json = await res.json().catch(() => ({}));

          // Token validation is sufficient - no allowlist check needed
          // The token mapping itself serves as authorization
          if (json.valid && json.ovt_email) {
            // Return user object with ovt_email (not login_email)
            // This ensures session uses ovt_email for data filtering
            return {
              id: json.ovt_email,
              email: json.ovt_email,
              name: null,
            };
          }

          return null;
        } catch (error) {
          console.error("Error validating token:", error);
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      const email = (user?.email || "").trim();
      if (!email) return false;

      // For credentials provider, validation already happened in authorize()
      // Skip allowlist/admin checks - token users are regular OVTs only
      if (account?.provider === "credentials") {
        return true;
      }

      // For Google OAuth, check allowlist and admin status
      try {
        // Use REPORTING_BACKEND_API_URL instead of BACKEND_API_URL
        const base = process.env.REPORTING_BACKEND_API_URL || process.env.NEXT_PUBLIC_REPORTING_BACKEND_URL!;
        const adminKey = process.env.REPORTING_BACKEND_ADMIN_API_KEY || "";
        // Check OVT allowlist
        const allowUrl = new URL(base);
        allowUrl.pathname = "/auth/ovt/allowed";
        allowUrl.searchParams.set("email", email);
        const allowRes = await fetch(allowUrl.toString(), { headers: { "x-admin-key": adminKey }, cache: "no-store" });
        const allowJson = await allowRes.json().catch(() => ({}));
        if (Boolean(allowJson?.allowed)) return true;
        // If not OVT-allowed, check admin
        const adminUrl = new URL(base);
        adminUrl.pathname = "/auth/ovt/is-admin";
        adminUrl.searchParams.set("email", email);
        const adminRes = await fetch(adminUrl.toString(), { headers: { "x-admin-key": adminKey }, cache: "no-store" });
        const adminJson = await adminRes.json().catch(() => ({}));
        return Boolean(adminJson?.admin);
      } catch {
        return false;
      }
    },
    async jwt({ token, account, profile, user }) {
      // For credentials provider, user object already contains ovt_email from authorize()
      if (account?.provider === "credentials" && user) {
        token.email = user.email;
        token.name = user.name || null;
      }
      // For Google OAuth, use profile data
      else if (account && profile) {
        token.email = (profile as any).email;
        token.name = (profile as any).name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session.user as any) = { name: (token as any).name, email: (token as any).email };
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
