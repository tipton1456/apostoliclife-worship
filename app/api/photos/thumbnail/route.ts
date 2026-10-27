import { NextRequest, NextResponse } from "next/server";
import { photoThumbnail } from "@/lib/dropbox/client";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) return new NextResponse(null, { status: 401 });

  const path = request.nextUrl.searchParams.get("path") || "";

  try {
    const bytes = await photoThumbnail(path);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
