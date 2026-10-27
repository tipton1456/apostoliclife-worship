import { requireWorshipFeature } from "@/lib/worship-auth/guard";

export default async function ChoirSundayLayout({ children }: { children: React.ReactNode }) {
  await requireWorshipFeature("choir_sunday", "/choir-sunday");
  return children;
}
