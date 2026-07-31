import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function envTrim(name: string): string {
  return (process.env[name] || "").trim().replace(/^['"]|['"]$/g, "");
}

/**
 * Supabase is ready when URL + service role are present.
 * Also accepts SUPABASE_URL as alias for NEXT_PUBLIC_SUPABASE_URL.
 */
export function hasSupabaseAdminConfig(): boolean {
  const url =
    envTrim("NEXT_PUBLIC_SUPABASE_URL") || envTrim("SUPABASE_URL");
  const serviceRoleKey = envTrim("SUPABASE_SERVICE_ROLE_KEY");
  return Boolean(url && serviceRoleKey);
}

export function createAdminClient(): SupabaseClient {
  const url =
    envTrim("NEXT_PUBLIC_SUPABASE_URL") || envTrim("SUPABASE_URL");
  const serviceRoleKey = envTrim("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured. On Vercel, set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for Production, then Redeploy."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
