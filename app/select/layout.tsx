import { requireWorshipFeature } from "@/lib/worship-auth/guard";

export default async function SelectBoardLayout({ children }: { children: React.ReactNode }) {
  await requireWorshipFeature("select_board", "/select");
  return children;
}
