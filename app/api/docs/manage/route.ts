import { NextRequest, NextResponse } from "next/server";
import { requestHasAccess, unauthorizedResponse } from "@/lib/staff-access";
import {
  archiveDocument,
  listCategories,
  listDocuments,
  moveDocument,
  restoreDocument,
} from "@/lib/tech-docs/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    const body = (await request.json()) as {
      action?: string;
      id?: string;
      category?: string;
    };
    const action = String(body.action || "");
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const result =
      action === "move"
        ? await moveDocument(id, String(body.category || ""))
        : action === "archive"
          ? await archiveDocument(id)
          : action === "restore"
            ? await restoreDocument(id)
            : null;

    if (!result) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const [documents, categories] = await Promise.all([listDocuments(), listCategories()]);
    return NextResponse.json({
      ok: true,
      ...result,
      documents,
      categories,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
