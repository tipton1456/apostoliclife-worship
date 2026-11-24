import { NextRequest, NextResponse } from "next/server";
import { handleSocialCorrection } from "@/lib/photos/social-correction";
import { getSubmissionByToken } from "@/lib/photos/social-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const submission = await getSubmissionByToken(token).catch(() => null);
  if (!submission) return NextResponse.json({ error: "That approval link is not valid." }, { status: 404 });

  try {
    const result = await handleSocialCorrection(submission.id, await request.json().catch(() => null));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save that correction.";
    const status = message.includes("could not be found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
