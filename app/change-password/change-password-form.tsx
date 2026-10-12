"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { completePasswordReset } from "@/lib/worship-auth/users";
import { MENU_PATH, sanitizeNextPath } from "@/lib/worship-auth/paths";

const fieldClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none ring-[#7bbc07] transition focus:ring-2";

export default function ChangePasswordForm({ nextPath = MENU_PATH }: { nextPath?: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const redirectPath = sanitizeNextPath(nextPath);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    setMessage("Updating password...");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessage(error.message);
        setIsLoading(false);
        return;
      }

      await completePasswordReset();
      window.location.href = redirectPath;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the password.");
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="new-password" className="text-sm font-medium text-neutral-300">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <label htmlFor="confirm-password" className="text-sm font-medium text-neutral-300">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className={fieldClass}
          placeholder="Repeat the new password"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-xl bg-[#7bbc07] px-4 py-3 font-semibold text-neutral-950 transition hover:bg-[#8ed20a] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "Updating Password..." : "Update Password"}
      </button>

      {message ? (
        <p role="status" className="text-sm text-neutral-300">
          {message}
        </p>
      ) : null}
    </form>
  );
}
