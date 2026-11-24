import { NextRequest, NextResponse } from "next/server";
import { downloadPhotoFile } from "@/lib/dropbox/client";
import { getSocialMediaPath } from "@/lib/photos/social-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest, context: { params: Promise<{ photoId: string; kind: string }> }) {
  const { photoId, kind: kindParam } = await context.params;
  const kind = kindParam === "feed.jpg" ? "feed" : kindParam === "story.jpg" ? "story" : "";
  const key = request.nextUrl.searchParams.get("key") || "";
  if (!kind || !key) return new NextResponse(null, { status: 404 });

  try {
    const path = await getSocialMediaPath(photoId, kind, key);
    if (!path) return new NextResponse(null, { status: 404 });
    const bytes = await downloadPhotoFile(path);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
