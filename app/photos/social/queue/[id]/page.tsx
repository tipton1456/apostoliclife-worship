import Link from "next/link";
import { redirect } from "next/navigation";
import ReviewPanel from "@/app/social-review/review-panel";
import WorshipLogo from "@/app/worship-logo";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";

export const metadata = { title: "Review photos" };

export default async function AdminReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentWorshipUser();
  if (!user?.active) redirect("/?next=/photos/social/queue");
  if (user.accessLevel !== "admin") redirect("/home?denied=1");
  const { id } = await params;

  return (
    <main className="min-h-[100dvh] bg-black px-4 py-4 text-white sm:px-6">
      <header className="mx-auto mb-6 flex w-full max-w-3xl items-center justify-between">
        <WorshipLogo href="/home" className="h-9 w-auto" />
        <Link href="/photos/social/queue" className="al-ghost px-4 py-2 text-sm">
          Queue
        </Link>
      </header>
      <ReviewPanel endpoint={`/api/photos/social/queue/${id}`} />
    </main>
  );
}
