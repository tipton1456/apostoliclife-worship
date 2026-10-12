"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MENU_PATH, sanitizeNextPath } from "@/lib/worship-auth/paths";

const fieldClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none ring-[#7bbc07] transition focus:ring-2";

export default function LoginForm({ nextPath = MENU_PATH }: { nextPath?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const redirectPath = sanitizeNextPath(nextPath);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("Signing in...");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage(error.message);
        setIsLoading(false);
        return;
      }

      if (!data.session) {
        setMessage("No session was returned. Try again.");
        setIsLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("worship_users")
        .select("active, must_reset_password")
        .eq("id", data.session.user.id)
        .maybeSingle();

      if (profileError) {
        await supabase.auth.signOut();
        setMessage(
          profileError.code === "PGRST205"
            ? "Worship accounts are not ready yet. The user tables still need to be created."
            : profileError.message,
        );
        setIsLoading(false);
        return;
      }

      if (!profile) {
        await supabase.auth.signOut();
        setMessage("This account does not have access to Apostolic Worship.");
        setIsLoading(false);
        return;
      }

      if (!profile.active) {
        await supabase.auth.signOut();
        setMessage("This account is turned off. Ask an administrator.");
        setIsLoading(false);
        return;
      }

      if (!rememberMe) {
        convertSupabaseCookiesToSessionCookies();
      }

      if (profile.must_reset_password) {
        window.location.href = `/change-password?next=${encodeURIComponent(redirectPath)}`;
        return;
      }

      window.location.href = redirectPath;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected sign-in error.");
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleLogin} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="text-sm font-medium text-neutral-300">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-medium text-neutral-300">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
          placeholder="Enter password"
        />
      </div>

      <label className="flex items-center gap-3 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-neutral-900 accent-[#7bbc07]"
        />
        Remember me
      </label>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-xl bg-[#7bbc07] px-4 py-3 font-semibold text-neutral-950 transition hover:bg-[#8ed20a] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "Signing In..." : "Sign In"}
      </button>

      {message ? (
        <p role="status" className="text-sm text-neutral-300">
          {message}
        </p>
      ) : null}
    </form>
  );
}

function convertSupabaseCookiesToSessionCookies() {
  const isSecure = window.location.protocol === "https:";
  const cookieAttributes = `path=/; SameSite=Lax${isSecure ? "; Secure" : ""}`;

  document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith("sb-"))
    .forEach((cookie) => {
      const separatorIndex = cookie.indexOf("=");
      if (separatorIndex === -1) return;

      const name = cookie.slice(0, separatorIndex);
      const value = cookie.slice(separatorIndex + 1);
      document.cookie = `${name}=${value}; ${cookieAttributes}`;
    });
}
