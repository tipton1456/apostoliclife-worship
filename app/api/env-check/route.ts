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

function plainEnv(name: string) {
  return {
    name,
    value: process.env[name] || null,
  };
}

export async function GET() {
  return NextResponse.json({
    deployment: [
      plainEnv("VERCEL_ENV"),
      plainEnv("VERCEL_URL"),
      plainEnv("VERCEL_PROJECT_PRODUCTION_URL"),
      plainEnv("VERCEL_GIT_PROVIDER"),
      plainEnv("VERCEL_GIT_REPO_OWNER"),
      plainEnv("VERCEL_GIT_REPO_SLUG"),
      plainEnv("VERCEL_GIT_COMMIT_REF"),
      plainEnv("VERCEL_GIT_COMMIT_SHA"),
    ],
    variables: [
      fingerprint("PCO_CLIENT_ID"),
      fingerprint("PCO_SECRET"),
      fingerprint("PCO_SUNDAY_AM_SERVICE_TYPE_ID"),
      fingerprint("PCO_SUNDAY_PM_SERVICE_TYPE_ID"),
      fingerprint("NEXT_PUBLIC_SITE_URL"),
    ],
  });
}
