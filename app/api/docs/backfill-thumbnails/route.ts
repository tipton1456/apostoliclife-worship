import { NextRequest, NextResponse } from "next/server";
import {
  requestHasAccess,
  unauthorizedResponse,
} from "@/lib/big-top/auth";
import { backfillPdfThumbnails } from "@/lib/tech-docs/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Generate missing PDF first-page thumbnails for existing uploads. */
export async function POST(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    const result = await backfillPdfThumbnails();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
