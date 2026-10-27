import { requireWorshipFeature } from "@/lib/worship-auth/guard";

export default async function ServeReportLayout({ children }: { children: React.ReactNode }) {
  await requireWorshipFeature("serve_report", "/serve-report");
  return children;
}
