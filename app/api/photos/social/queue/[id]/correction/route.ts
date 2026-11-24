import { NextRequest, NextResponse } from "next/server";
import { handleSocialCorrection } from "@/lib/photos/social-correction";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentWorshipUser();
  if (!user?.active || user.accessLevel !== "admin") {
    return NextResponse.json({ error: "Only an administrator can correct a queued photo." }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const result = await handleSocialCorrection(id, await request.json().catch(() => null));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save that correction.";
    const status = message.includes("could not be found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
