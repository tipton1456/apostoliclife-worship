import { NextResponse } from "next/server";
import { listSocialSubmissions } from "@/lib/photos/social-store";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentWorshipUser();
  if (!user?.active || user.accessLevel !== "admin") {
    return NextResponse.json({ error: "Only an administrator can open the approval queue." }, { status: 401 });
  }

  try {
    const submissions = await listSocialSubmissions();
    return NextResponse.json({ submissions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load the approval queue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
