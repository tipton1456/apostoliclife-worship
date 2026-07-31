import { NextRequest, NextResponse } from "next/server";
import {
  isAccessConfigured,
  requestHasAccess,
  unauthorizedResponse,
} from "@/lib/big-top/auth";
import {
  listCategories,
  listDocuments,
  listUploaders,
  uploadDocument,
} from "@/lib/tech-docs/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    const category = request.nextUrl.searchParams.get("category") || undefined;
    const q = request.nextUrl.searchParams.get("q") || undefined;

    const [documents, categories, uploaders] = await Promise.all([
      listDocuments({ category, q }),
      listCategories(),
      listUploaders(),
    ]);

    return NextResponse.json({
      documents,
      categories,
      uploaders,
      accessRequired: isAccessConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    const form = await request.formData();
    const title = String(form.get("title") || "");
    const category = String(form.get("category") || "");
    const description = String(form.get("description") || "");
    const uploadedBy = String(form.get("uploadedBy") || "");
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const doc = await uploadDocument({
      title,
      category,
      description,
      uploadedBy,
      file,
      originalFilename: file.name,
      contentType: file.type,
    });

    const [documents, categories, uploaders] = await Promise.all([
      listDocuments(),
      listCategories(),
      listUploaders(),
    ]);

    return NextResponse.json({
      ok: true,
      document: doc,
      documents,
      categories,
      uploaders,
      message: `Uploaded “${doc.title}”`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
