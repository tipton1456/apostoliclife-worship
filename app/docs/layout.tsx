import { requireWorshipFeature } from "@/lib/worship-auth/guard";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  await requireWorshipFeature("docs", "/docs");
  return children;
}
