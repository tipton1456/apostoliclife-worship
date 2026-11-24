import { NextRequest, NextResponse } from "next/server";
import { relativePhotoPath, resolvePhotoPath } from "@/lib/dropbox/client";
import { getTwilioConfig } from "@/lib/sms";
import { socialPublishingReady } from "@/lib/photos/social-publish";
import { isSocialPhotoName, SOCIAL_PHOTO_LIMIT } from "@/lib/photos/social-files";
import { createSocialSubmission } from "@/lib/photos/social-store";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function insideFolder(folder: string, path: string) {
  if (!folder) return true;
  return path === folder || path.startsWith(`${folder}/`);
}

export async function GET() {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) return NextResponse.json({ error: "Sign in to prepare social posts." }, { status: 401 });

  return NextResponse.json({
    adobe: Boolean(process.env.NEXT_PUBLIC_ADOBE_EXPRESS_CLIENT_ID),
    ai: Boolean(process.env.XAI_API_KEY),
    publishing: socialPublishingReady(),
    sms: Boolean(getTwilioConfig()),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) return NextResponse.json({ error: "Sign in to submit photos." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    folder?: string;
    caption?: string;
    scheduledAt?: string;
    photos?: { dropboxId?: string; path?: string; fileName?: string }[];
  } | null;

  try {
    const folderPath = relativePhotoPath(resolvePhotoPath(body?.folder || ""));
    const photos = (body?.photos ?? []).slice(0, SOCIAL_PHOTO_LIMIT).map((photo) => {
      const path = relativePhotoPath(resolvePhotoPath(photo.path || ""));
      const fileName = path.split("/").pop() || "";
      return { dropboxId: String(photo.dropboxId || ""), path, fileName };
    });

    if (photos.some((photo) => !insideFolder(folderPath, photo.path) || !isSocialPhotoName(photo.fileName))) {
      return NextResponse.json({ error: "Choose photos from this folder." }, { status: 400 });
    }

    const result = await createSocialSubmission({
      folderPath,
      caption: body?.caption || "",
      scheduledAt: body?.scheduledAt || "",
      submittedBy: user.id,
      submittedByName: `${user.firstName} ${user.lastName}`.trim(),
      photos,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit those photos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
