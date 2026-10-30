import Link from "next/link";
import { redirect } from "next/navigation";
import { WORSHIP_FEATURES } from "@/lib/worship-auth/features";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";
import { MENU_PATH } from "@/lib/worship-auth/paths";

export default async function MenuPage({
  searchParams,
}: {
  searchParams?: Promise<{ denied?: string }>;
}) {
  const currentUser = await getCurrentWorshipUser();
  const denied = (await searchParams)?.denied === "1";
  const menuItems = WORSHIP_FEATURES.filter((feature) => {
    if (feature.key === "control_panel" && process.env.NODE_ENV !== "development") return false;
    return Boolean(currentUser?.features.includes(feature.key));
  });

  if (!currentUser?.active) {
    redirect(`/?next=${encodeURIComponent(MENU_PATH)}`);
  }

  if (currentUser.mustResetPassword) {
    redirect(`/change-password?next=${encodeURIComponent(MENU_PATH)}`);
  }

  const displayName =
    [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || currentUser.email;

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
        <p className="pt-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#7bbc07]">Apostolic Worship</p>
        <nav className="flex max-w-3xl flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm font-semibold" aria-label="Portal">
          {menuItems.map((item) => (
            <Link key={item.href} href={item.href} className="text-neutral-200 hover:text-[#7bbc07]">
              {item.label}
            </Link>
          ))}
          {currentUser.accessLevel === "admin" ? (
            <Link href="/admin/users" className="text-neutral-200 hover:text-[#7bbc07]">
              Users
            </Link>
          ) : null}
          <span className="max-w-[12rem] truncate font-normal text-neutral-400">{displayName}</span>
          <form action="/auth/logout" method="post">
            <button type="submit" className="font-semibold text-neutral-200 hover:text-white">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-16">
        {denied ? <p className="mb-6 text-sm text-amber-200">That area is not turned on for this account.</p> : null}
        {menuItems.length === 0 ? (
          <p className="mb-6 text-sm text-neutral-400">No areas are turned on for this account yet.</p>
        ) : null}
        <p className="text-xl leading-relaxed text-neutral-100 sm:text-2xl">
          Welcome to the Apostolic Worship Tech Hub. This is designed for file and knowledge sharing for all of the
          Apostolic Worship department at Apostolic Life
        </p>
      </div>
    </main>
  );
}
