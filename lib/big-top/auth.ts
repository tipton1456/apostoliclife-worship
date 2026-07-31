import { NextRequest, NextResponse } from "next/server";

/**
 * Optional shared password for Big Top check-in (staff only).
 * Set BIG_TOP_ACCESS_CODE in Vercel env to enable.
 * Clients send it as header `x-big-top-code` or query `?code=`.
 */
export function getAccessCode(): string | null {
  const code = process.env.BIG_TOP_ACCESS_CODE?.trim();
  return code || null;
}

export function isAccessConfigured(): boolean {
  return Boolean(getAccessCode());
}

export function requestHasAccess(request: NextRequest): boolean {
  const expected = getAccessCode();
  if (!expected) return true;

  const header = request.headers.get("x-big-top-code")?.trim();
  if (header && header === expected) return true;

  const query = request.nextUrl.searchParams.get("code")?.trim();
  if (query && query === expected) return true;

  return false;
}

export function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: "Unauthorized",
      message:
        "Big Top check-in requires the staff access code (BIG_TOP_ACCESS_CODE).",
    },
    { status: 401 }
  );
}
