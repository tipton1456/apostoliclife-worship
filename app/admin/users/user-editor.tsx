"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  removeWorshipAccessWithState,
  updateWorshipUserWithState,
  type WorshipActionState,
  type WorshipUser,
} from "@/lib/worship-auth/users";
import AdminFormButton from "./admin-form-button";
import { FeatureChecks, TextField, fieldClass } from "./fields";

const initialState: WorshipActionState = {
  message: "",
  status: "idle",
  version: 0,
};

export default function UserEditor({
  user,
  isSelf,
}: {
  user: WorshipUser;
  isSelf: boolean;
}) {
  const [accessLevel, setAccessLevel] = useState(user.accessLevel);
  const [updateState, updateAction] = useActionState(updateWorshipUserWithState, initialState);
  const [removeState, removeAction] = useActionState(removeWorshipAccessWithState, initialState);
  const router = useRouter();

  useEffect(() => {
    if (updateState.status !== "success" && removeState.status !== "success") return;
    router.refresh();
  }, [removeState.status, removeState.version, router, updateState.status, updateState.version]);

  return (
    <div className="px-5 pb-5">
      <form action={updateAction} className="space-y-5 rounded-xl border border-white/10 bg-neutral-950/40 p-5">
        <input type="hidden" name="id" value={user.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="First name" name="firstName" defaultValue={user.firstName} />
          <TextField label="Last name" name="lastName" defaultValue={user.lastName} />
          <TextField label="Email" name="email" type="email" required defaultValue={user.email} />
          <TextField
            label="New password"
            name="password"
            type="password"
            minLength={8}
            autoComplete="new-password"
            placeholder="Leave blank to keep the current password"
          />
        </div>
        <p className="text-xs leading-5 text-neutral-500">
          A new password replaces the shared Apostolic Life portal password and must be
          changed at the next sign-in.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-neutral-300">
            Access level
            {isSelf ? <input type="hidden" name="accessLevel" value="admin" /> : null}
            <select
              name={isSelf ? undefined : "accessLevel"}
              value={accessLevel}
              disabled={isSelf}
              onChange={(event) =>
                setAccessLevel(event.target.value === "admin" ? "admin" : "member")
              }
              className={fieldClass}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="flex items-end gap-3 pb-3 text-sm text-neutral-300">
            {isSelf ? <input type="hidden" name="active" value="on" /> : null}
            <input
              type="checkbox"
              name={isSelf ? undefined : "active"}
              defaultChecked={user.active}
              disabled={isSelf}
              className="h-4 w-4 rounded border-white/20 bg-neutral-900 accent-[#7bbc07] disabled:opacity-60"
            />
            Account is active
          </label>
        </div>
        {isSelf ? (
          <p className="text-xs text-neutral-500">
            Your own admin access stays on while you are signed in with this account.
          </p>
        ) : null}

        <FeatureChecks selected={user.features} disabled={accessLevel === "admin"} />
        <AdminFormButton pendingLabel="Saving..." className="w-fit">
          Save User
        </AdminFormButton>
        {updateState.message ? (
          <p
            role="status"
            className={
              updateState.status === "error" ? "text-sm text-red-300" : "text-sm text-[#b6e36a]"
            }
          >
            {updateState.message}
          </p>
        ) : null}
      </form>

      <form
        action={removeAction}
        className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
        onSubmit={(event) => {
          if (isSelf) {
            event.preventDefault();
            return;
          }

          const confirmed = window.confirm(
            `Remove Apostolic Worship access for ${user.email}? Their portal sign-in stays in place.`,
          );

          if (!confirmed) event.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={user.id} />
        <p className="text-xs text-neutral-500">
          Removing access does not delete the email from Supabase Auth.
        </p>
        <AdminFormButton pendingLabel="Removing..." variant="danger" disabled={isSelf}>
          Remove Worship Access
        </AdminFormButton>
        {removeState.message ? (
          <p
            role="status"
            className={
              removeState.status === "error" ? "text-sm text-red-300" : "text-sm text-[#b6e36a]"
            }
          >
            {removeState.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
