import { NextRequest, NextResponse } from "next/server";
import { createPhotoFolder } from "@/lib/dropbox/client";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) return NextResponse.json({ error: "Sign in to create a folder." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { parent?: string; name?: string } | null;

  try {
    const path = await createPhotoFolder(body?.parent || "", body?.name || "");
    const name = path.split("/").pop() || path;
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    return NextResponse.json({ path, name, parentPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create that folder.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
