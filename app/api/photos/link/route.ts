import { NextRequest, NextResponse } from "next/server";
import { isGalleryImage, photoTemporaryLink } from "@/lib/dropbox/client";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) {
    return NextResponse.json({ error: "Sign in to view photos." }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path") || "";
  if (!isGalleryImage(path)) {
    return NextResponse.json({ error: "That file is not a photo." }, { status: 400 });
  }

  try {
    const url = await photoTemporaryLink(path);
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open that photo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
