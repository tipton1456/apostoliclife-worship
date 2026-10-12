import { redirect } from "next/navigation";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";
import { sanitizeNextPath } from "@/lib/worship-auth/paths";
import ChangePasswordForm from "./change-password-form";

export const metadata = {
  title: "Change password",
};

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const currentUser = await getCurrentWorshipUser();

  if (!currentUser?.active) {
    redirect("/");
  }

  const params = (await searchParams) ?? {};
  const nextPath = sanitizeNextPath(params.next);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-8 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <p className="text-sm uppercase tracking-[0.3em] text-[#7bbc07]">
          Apostolic Worship
        </p>
        <h1 className="mt-3 text-3xl font-bold">Change Password</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          {currentUser.mustResetPassword
            ? "Your temporary password needs to be replaced before continuing. This password is also the sign-in for the Apostolic Life portal."
            : "Choose a new password. This password is also the sign-in for the Apostolic Life portal."}
        </p>
        <ChangePasswordForm nextPath={nextPath} />
      </div>
    </main>
  );
}
