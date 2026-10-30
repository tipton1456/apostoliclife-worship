import { documentFileResponse } from "@/lib/tech-docs/file-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return documentFileResponse(id || "");
}
