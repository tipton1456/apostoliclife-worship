import Link from "next/link";
import { redirect } from "next/navigation";
import QueueList from "@/app/photos/social/queue/queue-list";
import WorshipLogo from "@/app/worship-logo";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";

export const metadata = { title: "Approval queue" };

export default async function SocialQueuePage() {
  const user = await getCurrentWorshipUser();
  if (!user?.active) redirect("/?next=/photos/social/queue");
  if (user.accessLevel !== "admin") redirect("/home?denied=1");

  return (
    <main className="min-h-[100dvh] bg-black text-white">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
        <WorshipLogo href="/home" className="h-9 w-auto" />
        <Link href="/photos/social" className="al-ghost px-4 py-2 text-sm">
          Social posts
        </Link>
      </header>
      <QueueList />
    </main>
  );
}
