import Link from "next/link";
import WorshipLogo from "@/app/worship-logo";
import ForgotPasswordForm from "./forgot-password-form";

export const metadata = {
  title: "Forgot password",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <div className="flex justify-center">
          <WorshipLogo />
        </div>
        <h1 className="mt-6 text-2xl font-bold">Forgot password</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Enter the email on your Apostolic Worship account. If we find it, we will text a
          temporary password. Sign in with that password and you will be asked to choose a new one.
        </p>
        <ForgotPasswordForm />
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-[#7bbc07]">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
