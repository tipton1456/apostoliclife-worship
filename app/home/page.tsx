import Link from "next/link";
import { redirect } from "next/navigation";
import WorshipLogo from "@/app/worship-logo";
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
    <main className="min-h-screen text-white">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <WorshipLogo href="/home" className="h-10 w-auto" />
        <div className="flex items-center gap-3 text-sm">
          <span className="max-w-[14rem] truncate text-[#a9b2c8]">{displayName}</span>
          <form action="/auth/logout" method="post">
            <button type="submit" className="al-ghost px-4 py-2 text-sm">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 pb-16">
        {denied ? (
          <p className="mb-6 text-sm text-amber-200">That area is not turned on for this account.</p>
        ) : null}
        <p className="al-eyebrow">Apostolic Worship</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">Tech Portal</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#a9b2c8]">
          File and knowledge sharing for the Apostolic Worship department at Apostolic Life.
        </p>
        {menuItems.length === 0 ? (
          <p className="mt-10 text-sm text-[#a9b2c8]">No areas are turned on for this account yet.</p>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="al-card block p-6 transition hover:-translate-y-0.5 hover:border-[#93a9f5]"
              >
                <p className="text-lg font-bold text-white">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-[#a9b2c8]">{item.description}</p>
              </Link>
            ))}
            {currentUser.accessLevel === "admin" ? (
              <Link
                href="/admin/users"
                className="al-card block p-6 transition hover:-translate-y-0.5 hover:border-[#93a9f5]"
              >
                <p className="text-lg font-bold text-white">Users</p>
                <p className="mt-2 text-sm leading-6 text-[#a9b2c8]">
                  Add people and choose which areas they can open.
                </p>
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
