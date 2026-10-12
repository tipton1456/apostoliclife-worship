import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import {
  getCurrentWorshipUser,
  listWorshipAuditLogs,
  listWorshipUsers,
  worshipUserTableReady,
} from "@/lib/worship-auth/users";
import CreateUserForm from "./create-user-form";
import UserEditor from "./user-editor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Users",
};

export default async function WorshipUsersPage() {
  if (!hasSupabaseAdminConfig() || !(await worshipUserTableReady())) {
    return (
      <main className="min-h-screen bg-black px-6 py-8 text-white">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-[#7bbc07]">Administration</p>
          <h1 className="mt-3 text-3xl font-bold">User tables are not ready</h1>
          <p className="mt-3 leading-6 text-neutral-400">
            Supabase still needs the Worship user tables before anyone can be assigned
            access. Apply <span className="text-neutral-200">supabase/migrations/202610120001_worship_users.sql</span> with{" "}
            <span className="text-neutral-200">npm run auth:migrate</span> after adding a
            Supabase access token or database URL.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm font-semibold text-[#7bbc07]">
            Back to the landing page
          </Link>
        </div>
      </main>
    );
  }

  const currentUser = await getCurrentWorshipUser();

  if (!currentUser?.active) {
    redirect("/login?next=/admin/users");
  }

  if (currentUser.mustResetPassword) {
    redirect("/change-password?next=/admin/users");
  }

  if (currentUser.accessLevel !== "admin") {
    return (
      <main className="min-h-screen bg-black px-6 py-8 text-white">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-[#7bbc07]">Administration</p>
          <h1 className="mt-3 text-3xl font-bold">Access restricted</h1>
          <p className="mt-3 text-neutral-400">
            Only Worship administrators can assign users and feature access.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm font-semibold text-[#7bbc07]">
            Back to the landing page
          </Link>
        </div>
      </main>
    );
  }

  const [users, auditLogs] = await Promise.all([listWorshipUsers(), listWorshipAuditLogs()]);

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-[#7bbc07]">Administration</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight">Worship Users</h1>
            <p className="mt-3 max-w-3xl text-neutral-400">
              Create sign-ins and assign an access level. Administrators can open every
              feature. Member checkboxes are saved now and will be enforced as each tool
              is connected.
            </p>
          </div>
          <Link href="/" className="text-sm font-semibold text-[#7bbc07]">
            Landing page
          </Link>
        </header>

        <details className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-2xl font-semibold">
            <span>Add User</span>
            <span className="rounded-xl bg-[#7bbc07] px-4 py-2 text-sm font-semibold text-neutral-950">
              Add User
            </span>
          </summary>
          <CreateUserForm />
        </details>

        <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="grid grid-cols-[1.1fr_1.5fr_0.7fr_1.2fr_1fr] gap-4 border-b border-white/10 px-5 py-3 text-xs uppercase tracking-[0.18em] text-neutral-500 max-lg:hidden">
            <span>Name</span>
            <span>Email</span>
            <span>Access</span>
            <span>Features</span>
            <span>Last sign-in</span>
          </div>
          {users.length > 0 ? (
            <div className="divide-y divide-white/10">
              {users.map((user) => (
                <details key={user.id} className="group">
                  <summary className="grid cursor-pointer list-none gap-3 px-5 py-4 marker:hidden hover:bg-white/[0.04] lg:grid-cols-[1.1fr_1.5fr_0.7fr_1.2fr_1fr] lg:items-center lg:gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 lg:hidden">Name</p>
                      <p className="font-semibold text-neutral-100">
                        {[user.firstName, user.lastName].filter(Boolean).join(" ") || "Name not set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 lg:hidden">Email</p>
                      <p className="break-all text-neutral-300">{user.email}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 lg:hidden">Access</p>
                      <p className={user.active ? "text-neutral-100" : "text-neutral-500"}>
                        {user.accessLevel === "admin" ? "Admin" : "Member"}
                        {user.active ? "" : " · off"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 lg:hidden">Features</p>
                      <p className="text-neutral-300">
                        {user.accessLevel === "admin" ? "All features" : `${user.features.length} assigned`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 lg:hidden">Last sign-in</p>
                      <p className="text-neutral-300">{formatDateTime(user.lastSignInAt)}</p>
                    </div>
                  </summary>
                  <UserEditor user={user} isSelf={user.id === currentUser.id} />
                </details>
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-neutral-400">No Worship users yet.</p>
          )}
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-2xl font-semibold">Recent changes</h2>
          </div>
          {auditLogs.length > 0 ? (
            <div className="divide-y divide-white/10">
              {auditLogs.map((log) => (
                <div key={log.id} className="grid gap-2 px-5 py-4 text-sm lg:grid-cols-[1fr_1fr_1.2fr_1.2fr]">
                  <p className="text-neutral-400">{formatDateTime(log.createdAt)}</p>
                  <p className="text-neutral-100">{formatAction(log.action)}</p>
                  <p className="break-all text-neutral-300">{log.targetEmail || "Unknown user"}</p>
                  <p className="break-all text-neutral-500">{log.actorEmail}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-4 text-sm text-neutral-400">No user changes have been recorded yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAction(action: string) {
  return action
    .replace("worship_user.", "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
