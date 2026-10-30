import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDocument } from "@/lib/tech-docs/store";

const BUCKET = "worship-tech-docs";
const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function documentFileResponse(id: string) {
  try {
    if (!DOCUMENT_ID.test(id)) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const doc = await getDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.storage.from(BUCKET).download(doc.storagePath);
    if (error || !data) {
      return NextResponse.json({ error: error?.message || "File download failed" }, { status: 500 });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const safeName = (doc.originalFilename || "document").replace(/[^\w.\- ()[\]]+/g, "_");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": doc.contentType || "application/octet-stream",
        "Content-Length": String(buffer.length),
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
