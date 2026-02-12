/**
 * Providers component
 * No longer needed since we're using Supabase Auth via cookies
 * Kept for compatibility in case we need to add other providers later
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
