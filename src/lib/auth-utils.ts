/**
 * Utility functions for authentication and URL validation
 */

/**
 * Validates that a URL is safe for redirects
 * Only allows relative paths or same-origin URLs
 * @param url - The URL to validate
 * @param baseUrl - The base URL of the application (optional, defaults to current origin)
 * @returns The validated URL if safe, null otherwise
 */
export function validateCallbackUrl(url: string | null | undefined, baseUrl?: string): string | null {
  if (!url) {
    return null;
  }

  // Remove leading/trailing whitespace
  const trimmed = url.trim();

  // Empty string is invalid
  if (trimmed === "") {
    return null;
  }

  // Relative paths starting with / are safe
  if (trimmed.startsWith("/")) {
    // Ensure it doesn't start with // (protocol-relative URL)
    if (trimmed.startsWith("//")) {
      return null;
    }
    // Ensure it doesn't contain protocol schemes
    if (trimmed.match(/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/)) {
      return null;
    }
    return trimmed;
  }

  // Try to parse as absolute URL
  try {
    const base = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
    const parsedUrl = new URL(trimmed, base);

    // Only allow same-origin URLs
    if (typeof window !== "undefined") {
      const currentOrigin = window.location.origin;
      if (parsedUrl.origin === currentOrigin) {
        return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
      }
    } else if (baseUrl) {
      // Server-side: check against provided base URL
      const baseOrigin = new URL(baseUrl).origin;
      if (parsedUrl.origin === baseOrigin) {
        return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
      }
    }

    // External URLs are not allowed
    return null;
  } catch {
    // Invalid URL format
    return null;
  }
}

/**
 * Gets the base URL for the application
 * @returns The base URL (origin) of the application
 */
export function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  // Server-side fallback
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
