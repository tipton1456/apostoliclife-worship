import { redirect } from "next/navigation";
import WorshipLogo from "@/app/worship-logo";
import { hasSupabaseBrowserConfig } from "@/lib/supabase/client";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";
import { sanitizeNextPath } from "@/lib/worship-auth/paths";
import LoginForm from "./login-form";

export const metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const nextPath = sanitizeNextPath(params.next);
  const currentUser = await getCurrentWorshipUser();

  if (currentUser?.active && currentUser.mustResetPassword) {
    redirect(`/change-password?next=${encodeURIComponent(nextPath)}`);
  }

  if (currentUser?.active) {
    redirect(nextPath);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <div className="flex justify-center">
          <WorshipLogo />
        </div>
        {hasSupabaseBrowserConfig() ? (
          <LoginForm nextPath={nextPath} />
        ) : (
          <p className="mt-8 text-sm leading-6 text-neutral-300">
            Sign-in needs the public Supabase key on this server. Add
            NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
            then redeploy.
          </p>
        )}
      </div>
    </main>
  );
}
