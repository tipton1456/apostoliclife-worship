import Link from "next/link";
import PhotosView from "@/app/photos/photos-view";
import { requireWorshipFeature } from "@/lib/worship-auth/guard";

export const metadata = {
  title: "Photos",
};

export default async function PhotosPage() {
  await requireWorshipFeature("photos", "/photos");

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-[#7bbc07]">Apostolic Worship</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">Photos</h1>
            <p className="mt-2 max-w-2xl text-neutral-400">
              Browse the service photography folders and upload pictures. Files stay in Dropbox.
            </p>
          </div>
          <Link href="/home" className="text-sm font-semibold text-[#7bbc07]">
            Menu
          </Link>
        </div>
        <div className="mt-8">
          <PhotosView />
        </div>
      </div>
    </main>
  );
}
