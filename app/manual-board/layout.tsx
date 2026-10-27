import { requireWorshipFeature } from "@/lib/worship-auth/guard";

export default async function ManualBoardLayout({ children }: { children: React.ReactNode }) {
  await requireWorshipFeature("manual_board", "/manual-board");
  return children;
}
