import { NextRequest, NextResponse } from "next/server";

/**
 * Optional shared staff code used by documentation and the booth tools.
 * Set BIG_TOP_ACCESS_CODE to require it. Clients send `x-big-top-code`.
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
      message: "Staff access code required.",
    },
    { status: 401 },
  );
}
