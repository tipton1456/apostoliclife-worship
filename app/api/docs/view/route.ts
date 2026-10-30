import { NextRequest } from "next/server";
import { documentFileResponse } from "@/lib/tech-docs/file-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim() || "";
  return documentFileResponse(id);
}
