import { NextRequest, NextResponse } from "next/server";
import { photoMetadata } from "@/lib/dropbox/client";
import { addPhotoTag, listPeople, photosForPerson, removePhotoTag } from "@/lib/photos/tags";
import { requireWorshipFeatureApi } from "@/lib/worship-auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) {
    return NextResponse.json({ error: "Sign in to view photos." }, { status: 401 });
  }

  try {
    const person = request.nextUrl.searchParams.get("person");
    if (person) {
      const result = await photosForPerson(person);
      return NextResponse.json(result);
    }

    const people = await listPeople();
    return NextResponse.json({ people });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load people tags.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) {
    return NextResponse.json({ error: "Sign in to view photos." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { path?: string; tag?: string };
    const photo = await photoMetadata(body.path || "");
    const tags = await addPhotoTag(photo, body.tag || "", user.id);
    return NextResponse.json({ tags });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add that person.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireWorshipFeatureApi("photos");
  if (!user) {
    return NextResponse.json({ error: "Sign in to view photos." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { dropboxId?: string; tag?: string };
    const tags = await removePhotoTag(body.dropboxId || "", body.tag || "");
    return NextResponse.json({ tags });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove that person.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
