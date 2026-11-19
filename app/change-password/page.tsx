import { redirect } from "next/navigation";
import WorshipLogo from "@/app/worship-logo";
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
      <div className="al-card w-full max-w-md p-8">
        <WorshipLogo href="/home" className="h-11 w-auto" />
        <p className="al-eyebrow mt-6">Apostolic Worship</p>
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
