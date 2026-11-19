import { NextRequest, NextResponse } from "next/server";
import { downloadPhotos, photoPaths } from "@/lib/dropbox/client";
import { zipStoredFiles } from "@/lib/photos/zip";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_DOWNLOAD_BYTES = 150 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) return NextResponse.json({ error: "Sign in to view photos." }, { status: 401 });

  try {
    const body = (await request.json().catch(() => null)) as { paths?: unknown; folder?: string } | null;
    const paths = photoPaths(body?.paths);
    if (!paths.length) return NextResponse.json({ error: "Choose at least one photo." }, { status: 400 });

    const files = await downloadPhotos(paths, MAX_DOWNLOAD_BYTES);
    const zip = zipStoredFiles(files);
    const folderName = (body?.folder || "photos").split("/").pop()?.replace(/[^\w.\- ]+/g, "").trim() || "photos";

    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${folderName}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to download those photos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
