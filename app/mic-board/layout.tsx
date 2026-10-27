import { requireWorshipFeature } from "@/lib/worship-auth/guard";

export default async function MicBoardLayout({ children }: { children: React.ReactNode }) {
  await requireWorshipFeature("mic_board", "/mic-board");
  return children;
}
