import { NextRequest, NextResponse } from "next/server";
import { publishDueSubmissions } from "@/lib/photos/social-publish";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function cronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function runPublish(request: NextRequest) {
  if (!cronAuthorized(request)) {
    const user = await getCurrentWorshipUser();
    if (!user?.active || user.accessLevel !== "admin") {
      return NextResponse.json({ error: "Not allowed." }, { status: 401 });
    }
  }

  try {
    const result = await publishDueSubmissions();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to post the approved photos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  return runPublish(request);
}

export async function POST(request: NextRequest) {
  return runPublish(request);
}
