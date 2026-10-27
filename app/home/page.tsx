import Image from "next/image";
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
    [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") ||
    currentUser.email;

  return (
    <main className="relative min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-20">
      <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-3 px-6 py-5">
        <span className="max-w-[14rem] truncate text-sm text-gray-300">{displayName}</span>
        {currentUser.accessLevel === "admin" ? (
          <Link
            href="/admin/users"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-[#7bbc07]/50"
          >
            Users
          </Link>
        ) : null}
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
          >
            Sign out
          </button>
        </form>
      </div>
      <div className="w-full max-w-2xl flex flex-col items-center text-center">
        <Image
          src="/apostolic-worship-icon.png"
          alt="Apostolic Worship"
          width={160}
          height={160}
          priority
          className="mb-6 rounded-2xl shadow-lg shadow-[#7bbc07]/20"
        />

        <p className="text-[#7bbc07] font-semibold tracking-wide uppercase text-sm mb-2">
          Apostolic Life
        </p>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight mb-3">
          Apostolic Worship Tech Landing Page
        </h1>
        <p className="text-gray-400 text-base sm:text-lg mb-10 max-w-lg">
          Tools for service production, photography, documentation, mic boards,
          and the serve matrix.
        </p>

        {denied ? (
          <p className="mb-6 text-sm text-amber-200">That area is not turned on for this account.</p>
        ) : null}

        <nav className="w-full space-y-3" aria-label="Main menu">
          {menuItems.length > 0 ? (
            menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block w-full rounded-2xl border border-white/15 bg-white/5 hover:bg-[#7bbc07]/15 hover:border-[#7bbc07]/50 transition-colors px-6 py-5 text-left"
              >
                <div className="text-xl sm:text-2xl font-bold text-white">{item.label}</div>
                <div className="text-sm text-gray-400 mt-1">{item.description}</div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-neutral-400">No areas are turned on for this account yet.</p>
          )}
        </nav>
      </div>
    </main>
  );
}
