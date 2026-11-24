import { NextRequest, NextResponse } from "next/server";
import { suggestSocialCaption } from "@/lib/photos/social-caption";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) return NextResponse.json({ error: "Sign in to write a caption." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { notes?: string; folder?: string } | null;

  try {
    const caption = await suggestSocialCaption({
      notes: body?.notes || "",
      folderPath: body?.folder || "",
    });
    return NextResponse.json({ caption });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Caption help is unavailable right now.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
