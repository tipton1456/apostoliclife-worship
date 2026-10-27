import { NextRequest, NextResponse } from "next/server";
import { bumpFolderIndex, getFolderIndex } from "@/lib/photos/folder-index";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) {
    return NextResponse.json({ error: "Sign in to view photos." }, { status: 401 });
  }

  try {
    const index = await getFolderIndex({ refresh: request.nextUrl.searchParams.get("refresh") === "1" });
    return NextResponse.json({
      rootName: index.rootName,
      indexedAt: index.indexedAt,
      folders: index.folders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to count the photo folders.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) {
    return NextResponse.json({ error: "Sign in to view photos." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { folder?: string; count?: number; sizeBytes?: number };
    const result = await bumpFolderIndex(body.folder || "", Number(body.count), Number(body.sizeBytes));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update folder totals.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
