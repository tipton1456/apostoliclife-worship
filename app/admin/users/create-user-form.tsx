"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createWorshipUserWithState,
  type WorshipActionState,
} from "@/lib/worship-auth/users";
import AdminFormButton from "./admin-form-button";
import { FeatureChecks, TextField, fieldClass } from "./fields";

const initialState: WorshipActionState = {
  message: "",
  status: "idle",
  version: 0,
};

export default function CreateUserForm() {
  const [state, formAction] = useActionState(createWorshipUserWithState, initialState);
  const [accessLevel, setAccessLevel] = useState<"admin" | "select">("select");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "success") return;
    formRef.current?.reset();
    setAccessLevel("select");
    router.refresh();
  }, [router, state.status, state.version]);

  return (
    <form ref={formRef} action={formAction} className="mt-6 space-y-5 border-t border-white/10 pt-5">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="First name" name="firstName" autoComplete="given-name" />
        <TextField label="Last name" name="lastName" autoComplete="family-name" />
        <TextField label="Email" name="email" type="email" required autoComplete="email" />
        <TextField
          label="Mobile number"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          placeholder="Used to text a password reset"
        />
        <TextField
          label="Temporary password"
          name="password"
          type="password"
          minLength={8}
          autoComplete="new-password"
          placeholder="Required for a new email"
        />
      </div>

      <p className="text-xs leading-5 text-neutral-500">
        Leave the password blank when this email already signs in to the Apostolic Life
        portal. A password entered here replaces that shared sign-in password, and the
        person must change it at the next visit.
      </p>

      <label className="block max-w-xs text-sm font-medium text-neutral-300">
        Access level
        <select
          name="accessLevel"
          value={accessLevel}
          onChange={(event) => setAccessLevel(event.target.value === "admin" ? "admin" : "select")}
          className={fieldClass}
        >
          <option value="select">Select</option>
          <option value="admin">Admin</option>
        </select>
      </label>

      <FeatureChecks selected={[]} disabled={accessLevel === "admin"} />

      <AdminFormButton pendingLabel="Saving...">Save User</AdminFormButton>

      {state.message ? (
        <p
          role="status"
          className={state.status === "error" ? "text-sm text-red-300" : "text-sm text-[#b6e36a]"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
