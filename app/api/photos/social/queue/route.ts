import { NextRequest, NextResponse } from "next/server";
import { deleteUnpublishedSubmissions, listSocialSubmissions } from "@/lib/photos/social-store";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireAdmin() {
  const user = await getCurrentWorshipUser();
  if (!user?.active || user.accessLevel !== "admin") return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) {
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

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Only an administrator can manage the queue." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];

  try {
    const result = await deleteUnpublishedSubmissions(ids);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove those posts.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
