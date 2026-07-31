import { NextRequest, NextResponse } from "next/server";
import {
  requestHasAccess,
  unauthorizedResponse,
} from "@/lib/big-top/auth";
import { createSignedDownloadUrl } from "@/lib/tech-docs/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const signed = await createSignedDownloadUrl(id, 180);
    return NextResponse.json(signed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
