import { createHash } from "crypto";
import { NextResponse } from "next/server";

function envValue(name: string) {
  return process.env[name]?.trim().replace(/^['"]|['"]$/g, "");
}

function fingerprint(name: string) {
  const value = envValue(name);

  return {
    name,
    present: Boolean(value),
    length: value?.length ?? 0,
    sha256Prefix: value
      ? createHash("sha256").update(value).digest("hex").slice(0, 12)
      : null,
  };
}

export async function GET() {
  return NextResponse.json({
    variables: [
      fingerprint("PCO_CLIENT_ID"),
      fingerprint("PCO_SECRET"),
      fingerprint("PCO_SUNDAY_AM_SERVICE_TYPE_ID"),
      fingerprint("PCO_SUNDAY_PM_SERVICE_TYPE_ID"),
      fingerprint("NEXT_PUBLIC_SITE_URL"),
    ],
  });
}
