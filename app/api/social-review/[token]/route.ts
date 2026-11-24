import { NextRequest, NextResponse } from "next/server";
import { photoPreview, photoReviewImage } from "@/lib/dropbox/client";
import { patchSubmission, submissionJson } from "@/lib/photos/social-review";
import { getReviewPhotoPath, getSubmissionByToken } from "@/lib/photos/social-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const photoId = request.nextUrl.searchParams.get("photo");

  try {
    if (photoId) {
      const path = await getReviewPhotoPath(token, photoId);
      if (!path) return new NextResponse(null, { status: 404 });
      const edit = request.nextUrl.searchParams.get("edit") === "1";
      const bytes = edit ? await photoPreview(path) : await photoReviewImage(path);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": edit ? "private, no-store" : "private, max-age=300",
        },
      });
    }

    return submissionJson(await getSubmissionByToken(token));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open that approval link.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const submission = await getSubmissionByToken(token).catch(() => null);
  if (!submission) return NextResponse.json({ error: "That approval link is not valid." }, { status: 404 });
  return patchSubmission(submission.id, request);
}
