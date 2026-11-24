import Link from "next/link";
import PhotosView from "@/app/photos/photos-view";
import WorshipLogo from "@/app/worship-logo";
import { requireWorshipFeature } from "@/lib/worship-auth/guard";

export const metadata = {
  title: "Photos",
};

export default async function PhotosPage() {
  const user = await requireWorshipFeature("photos", "/photos");

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-black text-white">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <WorshipLogo href="/home" className="h-9 w-auto" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Photos</h1>
            <p className="mt-0.5 truncate text-sm text-[#a9b2c8]">
              Upload from the camera or library, then send a set through Social posts.
            </p>
          </div>
        </div>
        <Link href="/home" className="al-ghost shrink-0 px-4 py-2 text-sm">
          Menu
        </Link>
      </header>
      <PhotosView isAdmin={user.accessLevel === "admin"} />
    </main>
  );
}
