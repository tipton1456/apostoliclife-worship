import { NextRequest, NextResponse } from "next/server";
import { convertRawPhoto, deletePhotos, movePhotos, photoMetadata, photoPaths } from "@/lib/dropbox/client";
import { normalizePersonTag } from "@/lib/photos/tag-name";
import { addPhotoTag, relocateTaggedFile, removeTagsForPhotos } from "@/lib/photos/tags";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type ManageBody = {
  action?: string;
  paths?: unknown;
  path?: string;
  destination?: string;
  tags?: unknown;
};

export async function POST(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) return NextResponse.json({ error: "Sign in to view photos." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as ManageBody | null;
  if (!body?.action) return NextResponse.json({ error: "Choose an action." }, { status: 400 });

  try {
    if (body.action === "delete") {
      const paths = photoPaths(body.paths);
      if (!paths.length) return NextResponse.json({ error: "Choose at least one photo." }, { status: 400 });
      const result = await deletePhotos(paths);
      try {
        await removeTagsForPhotos(result.removed.map((image) => image.id));
      } catch (error) {
        console.error("photo tag delete", error instanceof Error ? error.message : "failed");
      }
      return NextResponse.json(result);
    }

    if (body.action === "move") {
      const paths = photoPaths(body.paths);
      if (!paths.length) return NextResponse.json({ error: "Choose at least one photo." }, { status: 400 });
      const result = await movePhotos(paths, body.destination || "");
      await Promise.all(
        result.moved.map((item) =>
          relocateTaggedFile(item.to).catch((error: unknown) => {
            console.error("photo tag move", error instanceof Error ? error.message : "failed");
          }),
        ),
      );
      return NextResponse.json(result);
    }

    if (body.action === "tag") {
      const paths = photoPaths(body.paths);
      const tags = Array.isArray(body.tags)
        ? body.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 20)
        : [];
      if (!paths.length) return NextResponse.json({ error: "Choose at least one photo." }, { status: 400 });
      if (!tags.length || tags.some((tag) => !normalizePersonTag(tag))) {
        return NextResponse.json({ error: "Choose a person to add." }, { status: 400 });
      }

      const failed: { name: string; error: string }[] = [];
      let tagged = 0;
      for (const path of paths) {
        try {
          const photo = await photoMetadata(path);
          for (const tag of tags) await addPhotoTag(photo, tag, user.id);
          tagged += 1;
        } catch (error) {
          failed.push({
            name: path.split("/").pop() || "photo",
            error: error instanceof Error ? error.message : "Unable to add that person.",
          });
        }
      }
      return NextResponse.json({ tagged, failed });
    }

    if (body.action === "convert") {
      const path = typeof body.path === "string" ? body.path.trim() : "";
      if (!path) return NextResponse.json({ error: "Choose a RAW file." }, { status: 400 });
      const image = await convertRawPhoto(path);
      return NextResponse.json({ image });
    }

    return NextResponse.json({ error: "Choose an action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update those photos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
