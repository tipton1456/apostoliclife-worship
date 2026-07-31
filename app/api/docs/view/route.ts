import { NextRequest, NextResponse } from "next/server";
import {
  requestHasAccess,
  unauthorizedResponse,
} from "@/lib/big-top/auth";
import { getDocument } from "@/lib/tech-docs/store";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "worship-tech-docs";

/**
 * Stream a document through our origin for in-browser viewing.
 * Avoids Chrome handing PDFs off to Acrobat via external signed URLs in iframes.
 */
export async function GET(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const doc = await getDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(doc.storagePath);

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "File download failed" },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const safeName = (doc.originalFilename || "document").replace(
      /[^\w.\- ()[\]]+/g,
      "_"
    );

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": doc.contentType || "application/octet-stream",
        "Content-Length": String(buffer.length),
        // Critical: inline so viewers treat it as display, not attachment
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
