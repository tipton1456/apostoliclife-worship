import { NextRequest, NextResponse } from "next/server";
import { listPhotoFolder } from "@/lib/dropbox/client";
import { syncTaggedFiles } from "@/lib/photos/tags";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) {
    return NextResponse.json({ error: "Sign in to view photos." }, { status: 401 });
  }

  try {
    const folder = await listPhotoFolder(request.nextUrl.searchParams.get("path") || "");
    try {
      await syncTaggedFiles(folder.images);
    } catch (error) {
      console.error("photo tag path sync", error instanceof Error ? error.message : "failed");
    }
    return NextResponse.json(folder);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load photos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
