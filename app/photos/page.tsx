import Link from "next/link";
import PhotosView from "@/app/photos/photos-view";
import { requireWorshipFeature } from "@/lib/worship-auth/guard";

export const metadata = {
  title: "Photos",
};

export default async function PhotosPage() {
  await requireWorshipFeature("photos", "/photos");

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-black text-white">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-[#7bbc07]">Apostolic Worship</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Photos</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Folders on the left, photos in the middle, and details with people tags on the right.
          </p>
        </div>
        <Link href="/home" className="shrink-0 text-sm font-semibold text-[#7bbc07]">
          Menu
        </Link>
      </header>
      <PhotosView />
    </main>
  );
}
