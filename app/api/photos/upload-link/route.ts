import { NextRequest, NextResponse } from "next/server";
import { photoUploadLink } from "@/lib/dropbox/client";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) {
    return NextResponse.json({ error: "Sign in to upload photos." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { folder?: string; name?: string } | null;

  try {
    const upload = await photoUploadLink(body?.folder || "", body?.name || "");
    return NextResponse.json(upload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start the upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
