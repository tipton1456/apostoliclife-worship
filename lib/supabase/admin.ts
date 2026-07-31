import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function envRaw(name: string): string {
  const value = process.env[name];
  if (value == null) return "";
  return String(value);
}

/** Normalize env values from Vercel (trim, strip quotes/newlines/BOM). */
export function envTrim(name: string): string {
  return envRaw(name)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[\r\n\t]+/g, "");
}

const URL_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
] as const;

const SERVICE_ROLE_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_SECRET_KEY",
] as const;

export function getSupabaseUrl(): string {
  for (const key of URL_KEYS) {
    const v = envTrim(key);
    if (v) return v;
  }
  return "";
}

export function getSupabaseServiceRoleKey(): string {
  for (const key of SERVICE_ROLE_KEYS) {
    const v = envTrim(key);
    if (v) return v;
  }
  return "";
}

/**
 * Safe diagnostics for production debugging — never includes secret values.
 */
export function getSupabaseConfigDiagnostics() {
  const urlKeyPresent = URL_KEYS.filter((k) => Boolean(envTrim(k)));
  const serviceKeyPresent = SERVICE_ROLE_KEYS.filter((k) => Boolean(envTrim(k)));
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  // List related env key *names* available at runtime (helps catch typos)
  const relatedKeyNames = Object.keys(process.env)
    .filter((k) => /supabase|big_top|blob/i.test(k))
    .sort();

  return {
    configured: Boolean(url && serviceRoleKey),
    hasUrl: Boolean(url),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    urlKeyUsed: urlKeyPresent[0] || null,
    serviceRoleKeyUsed: serviceKeyPresent[0] || null,
    urlLength: url.length,
    serviceRoleKeyLength: serviceRoleKey.length,
    urlLooksValid: /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url),
    serviceRoleLooksLikeJwt: serviceRoleKey.startsWith("eyJ"),
    relatedKeyNames,
    vercelEnv: process.env.VERCEL_ENV || null,
    vercel: Boolean(process.env.VERCEL),
  };
}

/**
 * Supabase is ready when URL + service role are present.
 */
export function hasSupabaseAdminConfig(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

export function createAdminClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url || !serviceRoleKey) {
    const d = getSupabaseConfigDiagnostics();
    throw new Error(
      `Supabase is not configured on this runtime. hasUrl=${d.hasUrl} hasServiceRoleKey=${d.hasServiceRoleKey} vercelEnv=${d.vercelEnv} relatedKeys=${d.relatedKeyNames.join(",") || "(none)"}. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for Production and Redeploy.`
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
