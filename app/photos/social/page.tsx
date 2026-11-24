import Link from "next/link";
import SocialWizard from "@/app/photos/social/social-wizard";
import WorshipLogo from "@/app/worship-logo";
import { requireWorshipFeature } from "@/lib/worship-auth/guard";

export const metadata = { title: "Social posts", referrer: "strict-origin-when-cross-origin" };

export default async function SocialPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const user = await requireWorshipFeature("photos", "/photos/social");
  const params = await searchParams;
  const folder = typeof params.folder === "string" ? params.folder : "";

  return (
    <main className="flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
        <WorshipLogo href="/home" className="h-9 w-auto" />
        <Link href="/home" className="al-ghost px-4 py-2 text-sm">
          Menu
        </Link>
      </header>
      <SocialWizard
        folder={folder}
        photographer={user.firstName}
        adobeClientId={process.env.ADOBE_EXPRESS_CLIENT_ID || ""}
        isAdmin={user.accessLevel === "admin"}
      />
    </main>
  );
}
