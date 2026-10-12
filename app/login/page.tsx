import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/lib/worship-auth/paths";

export default async function LegacyLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const nextPath = sanitizeNextPath(params.next);
  redirect(`/?next=${encodeURIComponent(nextPath)}`);
}
