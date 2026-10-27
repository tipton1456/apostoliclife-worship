import { NextRequest, NextResponse } from "next/server";
import { decideFaces, listFaceJob, saveFaceScan, type FaceDecision, type IncomingFacePhoto } from "@/lib/photos/faces";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) return NextResponse.json({ error: "Sign in to view photos." }, { status: 401 });

  try {
    const job = await listFaceJob(request.nextUrl.searchParams.get("folder") || "");
    return NextResponse.json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load faces.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) return NextResponse.json({ error: "Sign in to view photos." }, { status: 401 });

  try {
    const body = (await request.json()) as {
      action?: string;
      folder?: string;
      photos?: IncomingFacePhoto[];
      items?: FaceDecision[];
    };

    if (body.action === "save") {
      const suggestions = await saveFaceScan(body.folder || "", body.photos || [], user.id);
      return NextResponse.json({ suggestions });
    }

    if (body.action === "decide") {
      const result = await decideFaces(body.items || [], user.id);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unable to update those faces." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update those faces.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
