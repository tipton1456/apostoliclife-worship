import { NextRequest, NextResponse } from "next/server";
import { publishSubmission } from "@/lib/photos/social-publish";
import {
  applySocialReview,
  getSubmissionById,
  parseReviewInput,
  toPublicSubmission,
  type SocialSubmissionRecord,
} from "@/lib/photos/social-store";

export function submissionJson(record: SocialSubmissionRecord | null, missing = "That approval link is not valid.") {
  if (!record) return NextResponse.json({ error: missing }, { status: 404 });
  return NextResponse.json({ submission: toPublicSubmission(record) });
}

export async function patchSubmission(id: string, request: NextRequest) {
  try {
    const input = parseReviewInput(await request.json().catch(() => null));
    const updated = await applySocialReview(id, input);
    if (!updated) return NextResponse.json({ error: "That approval link is not valid." }, { status: 404 });

    let publishError = "";
    const due = new Date(updated.scheduledAt).getTime() <= Date.now() + 30_000;
    if (updated.status === "approved" && (input.action === "retry" || due)) {
      const published = await publishSubmission(updated.id);
      if (!published.ok && !published.skipped) publishError = published.errors.join(" ");
    }

    const fresh = await getSubmissionById(updated.id);
    return NextResponse.json({
      submission: toPublicSubmission(fresh ?? updated),
      publishError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save that review.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
