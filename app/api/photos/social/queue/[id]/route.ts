import { NextRequest, NextResponse } from "next/server";
import { photoReviewImage } from "@/lib/dropbox/client";
import { patchSubmission, submissionJson } from "@/lib/photos/social-review";
import { getSubmissionById } from "@/lib/photos/social-store";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function requireAdmin() {
  const user = await getCurrentWorshipUser();
  if (!user?.active || user.accessLevel !== "admin") return null;
  return user;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Only an administrator can review photos." }, { status: 401 });
  }
  const { id } = await context.params;
  const photoId = request.nextUrl.searchParams.get("photo");
  try {
    const submission = await getSubmissionById(id);
    if (photoId) {
      const path = submission?.photos.find((photo) => photo.id === photoId)?.path;
      if (!path) return new NextResponse(null, { status: 404 });
      const bytes = await photoReviewImage(path);
      return new NextResponse(new Uint8Array(bytes), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
      });
    }
    return submissionJson(submission, "That photo set could not be found.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open that photo set.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Only an administrator can review photos." }, { status: 401 });
  }
  const { id } = await context.params;
  return patchSubmission(id, request);
}
