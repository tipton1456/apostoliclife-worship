"use client";

import { useActionState } from "react";
import {
  requestWorshipPasswordReset,
  type PasswordResetState,
} from "@/lib/worship-auth/password-reset";

const initialState: PasswordResetState = {
  message: "",
  status: "idle",
  version: 0,
};

const fieldClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none ring-[#7bbc07] transition focus:ring-2";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestWorshipPasswordReset, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <label htmlFor="email" className="text-sm font-medium text-neutral-300">
        Email address
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={fieldClass}
          placeholder="you@example.com"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[#7bbc07] px-4 py-3 font-semibold text-neutral-950 transition hover:bg-[#8ed20a] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending..." : "Text a temporary password"}
      </button>
      {state.message ? (
        <p role="status" className={state.status === "error" ? "text-sm text-red-300" : "text-sm text-neutral-300"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
