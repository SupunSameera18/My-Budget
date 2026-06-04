import { createClient } from "@/lib/supabase/server";

/**
 * Returns an authenticated Supabase client + verified User, or null.
 *
 * Wraps getUser() in try/catch so an unhandled network fault never reaches
 * the caller. Returns null for all failure modes (no session, expired token,
 * transient auth service error, SDK throw) so callers can treat null as a
 * uniform "not authenticated" signal without distinguishing the cause.
 *
 * The (app)/layout.tsx middleware gate already protects every app route, so
 * null from this helper in a server component/action means a transient fault
 * on a genuinely authenticated user — return an error Result (or null for
 * components) rather than silently mis-behaving.
 */
export async function requireUser() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { supabase, user: data.user };
  } catch {
    return null;
  }
}
