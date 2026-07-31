import { NextRequest, NextResponse } from "next/server";
import {
  requestHasAccess,
  unauthorizedResponse,
} from "@/lib/big-top/auth";
import { ensureCategory, ensureUploader, listCategories, listUploaders } from "@/lib/tech-docs/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Add a category or uploader without uploading a file. */
export async function POST(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    const body = (await request.json()) as {
      type?: "category" | "uploader";
      name?: string;
    };

    const name = (body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (body.type === "category") {
      await ensureCategory(name);
    } else if (body.type === "uploader") {
      await ensureUploader(name);
    } else {
      return NextResponse.json(
        { error: 'type must be "category" or "uploader"' },
        { status: 400 }
      );
    }

    const [categories, uploaders] = await Promise.all([
      listCategories(),
      listUploaders(),
    ]);

    return NextResponse.json({ ok: true, categories, uploaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
