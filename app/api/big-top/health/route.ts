import { NextResponse } from "next/server";
import { getSupabaseConfigDiagnostics } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Safe production diagnostics — no secret values.
 * Open: https://<your-domain>/api/big-top/health
 */
export async function GET() {
  const supabase = getSupabaseConfigDiagnostics();

  let storage: string = "unknown";
  let storageError: string | null = null;
  try {
    const { storageBackend } = await import("@/lib/big-top/store");
    storage = storageBackend();
  } catch (error) {
    storage = "error";
    storageError = error instanceof Error ? error.message : String(error);
  }

  let attendeeCount: number | null = null;
  let supabaseReadError: string | null = null;
  if (supabase.configured) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const client = createAdminClient();
      const { count, error } = await client
        .from("big_top_attendees")
        .select("*", { count: "exact", head: true });
      if (error) {
        supabaseReadError = error.message;
      } else {
        attendeeCount = count;
      }
    } catch (error) {
      supabaseReadError =
        error instanceof Error ? error.message : String(error);
    }
  }

  return NextResponse.json({
    ok: supabase.configured && storage === "supabase" && !supabaseReadError,
    storage,
    storageError,
    supabase,
    attendeeCount,
    supabaseReadError,
    hint:
      !supabase.configured
        ? "Runtime cannot see URL and/or SERVICE_ROLE_KEY. In Vercel: Settings → Environment Variables → confirm both names exactly, environments include Production, then Redeploy the Production deployment."
        : supabaseReadError
          ? "Supabase keys are visible but DB read failed (tables/RLS/project mismatch)."
          : "Looks good.",
  });
}
