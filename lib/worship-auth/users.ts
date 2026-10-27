"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizePhoneNumber } from "@/lib/sms";
import {
  WORSHIP_FEATURES,
  isWorshipFeatureKey,
  type WorshipFeatureKey,
} from "@/lib/worship-auth/features";

export type WorshipAccessLevel = "admin" | "select";

export type WorshipUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  accessLevel: WorshipAccessLevel;
  phone: string;
  features: WorshipFeatureKey[];
  active: boolean;
  mustResetPassword: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};

export type WorshipAuditLog = {
  id: number;
  action: string;
  actorEmail: string;
  targetEmail: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type WorshipActionState = {
  message: string;
  status: "idle" | "success" | "error";
  version: number;
};

type WorshipProfileRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  access_level: string | null;
  phone: string | null;
  active: boolean | null;
  must_reset_password: boolean | null;
  created_at: string;
  worship_user_features: { feature: string }[] | null;
};

const PROFILE_SELECT =
  "id,email,first_name,last_name,access_level,phone,active,must_reset_password,created_at,worship_user_features(feature)";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rethrowFrameworkError(error: unknown) {
  if (
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string" &&
    (error.digest.startsWith("NEXT_REDIRECT") || error.digest.startsWith("NEXT_NOT_FOUND"))
  ) {
    throw error;
  }
}

function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function parseAccessLevel(value: FormDataEntryValue | null): WorshipAccessLevel {
  return value === "admin" ? "admin" : "select";
}

function parsePhone(value: FormDataEntryValue | null, required: boolean) {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    if (required) {
      throw new Error("Enter a mobile number so a password reset can be texted.");
    }
    return "";
  }

  if (!normalizePhoneNumber(trimmed)) {
    throw new Error("Enter a valid 10-digit mobile number.");
  }

  return trimmed;
}

function parseFeatures(formData: FormData): WorshipFeatureKey[] {
  const features = new Set<WorshipFeatureKey>();

  for (const value of formData.getAll("features")) {
    const key = String(value);
    if (isWorshipFeatureKey(key)) features.add(key);
  }

  return WORSHIP_FEATURES.map((feature) => feature.key).filter((key) => features.has(key));
}

function featuresFor(accessLevel: WorshipAccessLevel, stored: WorshipFeatureKey[]) {
  if (accessLevel === "admin") {
    return WORSHIP_FEATURES.map((feature) => feature.key);
  }

  return stored;
}

function mapProfile(
  profile: WorshipProfileRow,
  lastSignInAt: string | null = null,
): WorshipUser {
  const accessLevel: WorshipAccessLevel =
    profile.access_level === "admin" ? "admin" : "select";
  const stored = (profile.worship_user_features ?? [])
    .map((row) => row.feature)
    .filter(isWorshipFeatureKey);

  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.first_name ?? "",
    lastName: profile.last_name ?? "",
    accessLevel,
    phone: profile.phone ?? "",
    features: featuresFor(accessLevel, stored),
    active: profile.active !== false,
    mustResetPassword: Boolean(profile.must_reset_password),
    createdAt: profile.created_at,
    lastSignInAt,
  };
}

async function listAuthUsers(admin: SupabaseClient) {
  const users: { id: string; email: string; lastSignInAt: string | null }[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });

    if (error) {
      throw new Error(error.message);
    }

    users.push(
      ...data.users.map((user) => ({
        id: user.id,
        email: user.email ?? "",
        lastSignInAt: user.last_sign_in_at ?? null,
      })),
    );

    if (data.users.length < 200) break;
  }

  return users;
}

export async function getCurrentWorshipUser(): Promise<WorshipUser | null> {
  const supabase = await createClient();

  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("worship_users")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle<WorshipProfileRow>();

  if (error || !data) {
    if (error && error.code !== "PGRST205") {
      console.error("Worship profile lookup failed:", error.message);
    }
    return null;
  }

  return mapProfile(data, user.last_sign_in_at ?? null);
}

export async function worshipUserTableReady() {
  if (!hasSupabaseAdminConfig()) return false;

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("worship_users").select("id").limit(1);
    return !error;
  } catch (error) {
    console.error("Worship table check failed:", error);
    return false;
  }
}

async function requireWorshipAdmin() {
  const currentUser = await getCurrentWorshipUser();

  if (!currentUser || currentUser.accessLevel !== "admin" || !currentUser.active) {
    throw new Error("Only an active Worship administrator can manage users.");
  }

  return currentUser;
}

export async function listWorshipUsers(): Promise<WorshipUser[]> {
  await requireWorshipAdmin();
  const admin = createAdminClient();
  const [{ data, error }, authUsers] = await Promise.all([
    admin.from("worship_users").select(PROFILE_SELECT).order("email", { ascending: true }),
    listAuthUsers(admin),
  ]);

  if (error) {
    console.error("Worship user list failed:", error.message);
    throw new Error("Unable to load Worship users.");
  }

  const authById = new Map(authUsers.map((user) => [user.id, user]));

  return ((data ?? []) as WorshipProfileRow[]).map((profile) =>
    mapProfile(profile, authById.get(profile.id)?.lastSignInAt ?? null),
  );
}

export async function listWorshipAuditLogs(): Promise<WorshipAuditLog[]> {
  await requireWorshipAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("worship_user_audit_logs")
    .select("id,action,actor_email,target_email,details,created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    console.error("Worship audit log failed:", error.message);
    throw new Error("Unable to load the user history.");
  }

  return (data ?? []).map((row) => ({
    id: row.id as number,
    action: String(row.action),
    actorEmail: String(row.actor_email ?? ""),
    targetEmail: String(row.target_email ?? ""),
    details: (row.details ?? {}) as Record<string, unknown>,
    createdAt: String(row.created_at),
  }));
}

async function logWorshipUserEvent(input: {
  action: string;
  actor: { id: string; email: string };
  target: { id?: string; email: string };
  details: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("worship_user_audit_logs").insert({
    action: input.action,
    actor_user_id: input.actor.id,
    actor_email: input.actor.email,
    target_user_id: input.target.id ?? null,
    target_email: input.target.email,
    details: input.details,
  });

  if (error) {
    console.error("Worship audit insert failed:", error.message);
  }
}

async function saveFeatures(
  admin: SupabaseClient,
  userId: string,
  accessLevel: WorshipAccessLevel,
  features: WorshipFeatureKey[],
) {
  const { error: deleteError } = await admin
    .from("worship_user_features")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (accessLevel === "admin" || features.length === 0) return;

  const { error: insertError } = await admin.from("worship_user_features").insert(
    features.map((feature) => ({
      user_id: userId,
      feature,
    })),
  );

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function saveProfile(
  admin: SupabaseClient,
  input: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    accessLevel: WorshipAccessLevel;
    phone: string;
    active: boolean;
    mustResetPassword: boolean;
    features: WorshipFeatureKey[];
  },
) {
  const { error } = await admin.from("worship_users").upsert(
    {
      id: input.id,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      access_level: input.accessLevel,
      phone: input.phone,
      active: input.active,
      must_reset_password: input.mustResetPassword,
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  await saveFeatures(admin, input.id, input.accessLevel, input.features);
}

export async function createWorshipUser(formData: FormData) {
  const currentUser = await requireWorshipAdmin();
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") || "").trim();
  const firstName = normalizeText(formData.get("firstName"));
  const lastName = normalizeText(formData.get("lastName"));
  const accessLevel = parseAccessLevel(formData.get("accessLevel"));
  const phone = parsePhone(formData.get("phone"), true);
  const features = parseFeatures(formData);

  if (!EMAIL_PATTERN.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (password && password.length < 8) {
    throw new Error("Passwords must be at least 8 characters.");
  }

  const admin = createAdminClient();
  const authUsers = await listAuthUsers(admin);
  const existing = authUsers.find((user) => user.email.trim().toLowerCase() === email);
  let userId = existing?.id ?? "";
  let passwordSet = false;

  if (existing) {
    const update: {
      email: string;
      password?: string;
      user_metadata: { first_name: string; last_name: string };
    } = {
      email,
      user_metadata: { first_name: firstName, last_name: lastName },
    };

    if (password) {
      update.password = password;
      passwordSet = true;
    }

    const { error } = await admin.auth.admin.updateUserById(existing.id, update);

    if (error) {
      throw new Error(error.message);
    }
  } else {
    if (password.length < 8) {
      throw new Error("A new account needs an email and a password of at least 8 characters.");
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? "Unable to create the user.");
    }

    userId = data.user.id;
    passwordSet = true;
  }

  await saveProfile(admin, {
    id: userId,
    email,
    firstName,
    lastName,
    accessLevel,
    phone,
    active: true,
    mustResetPassword: passwordSet,
    features,
  });

  await logWorshipUserEvent({
    action: "worship_user.created",
    actor: currentUser,
    target: { id: userId, email },
    details: {
      firstName,
      lastName,
      accessLevel,
      features: accessLevel === "admin" ? "all" : features,
      linkedExistingLogin: Boolean(existing),
      passwordSet,
    },
  });

  revalidatePath("/admin/users");
}

export async function createWorshipUserWithState(
  _previousState: WorshipActionState,
  formData: FormData,
): Promise<WorshipActionState> {
  try {
    await createWorshipUser(formData);
    return {
      message: "User saved.",
      status: "success",
      version: Date.now(),
    };
  } catch (error) {
    rethrowFrameworkError(error);
    return {
      message: error instanceof Error ? error.message : "Unable to create the user.",
      status: "error",
      version: Date.now(),
    };
  }
}

export async function updateWorshipUser(formData: FormData) {
  const currentUser = await requireWorshipAdmin();
  const id = String(formData.get("id") || "");
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") || "").trim();
  const firstName = normalizeText(formData.get("firstName"));
  const lastName = normalizeText(formData.get("lastName"));
  let accessLevel = parseAccessLevel(formData.get("accessLevel"));
  let active = formData.get("active") === "on";
  const phone = parsePhone(formData.get("phone"), false);
  const features = parseFeatures(formData);

  if (!id || !EMAIL_PATTERN.test(email)) {
    throw new Error("A user and a valid email address are required.");
  }

  if (password && password.length < 8) {
    throw new Error("Passwords must be at least 8 characters.");
  }

  if (currentUser.id === id) {
    accessLevel = "admin";
    active = true;
  }

  const admin = createAdminClient();
  const update: {
    email: string;
    password?: string;
    user_metadata: { first_name: string; last_name: string };
  } = {
    email,
    user_metadata: { first_name: firstName, last_name: lastName },
  };

  if (password) update.password = password;

  const { error } = await admin.auth.admin.updateUserById(id, update);

  if (error) {
    throw new Error(error.message);
  }

  const { data: before } = await admin
    .from("worship_users")
    .select("must_reset_password")
    .eq("id", id)
    .maybeSingle<{ must_reset_password: boolean | null }>();

  await saveProfile(admin, {
    id,
    email,
    firstName,
    lastName,
    accessLevel,
    phone,
    active,
    mustResetPassword: password ? true : Boolean(before?.must_reset_password),
    features,
  });

  await logWorshipUserEvent({
    action: "worship_user.updated",
    actor: currentUser,
    target: { id, email },
    details: {
      firstName,
      lastName,
      accessLevel,
      active,
      features: accessLevel === "admin" ? "all" : features,
      passwordChanged: Boolean(password),
    },
  });

  revalidatePath("/admin/users");
}

export async function updateWorshipUserWithState(
  _previousState: WorshipActionState,
  formData: FormData,
): Promise<WorshipActionState> {
  try {
    await updateWorshipUser(formData);
    return {
      message: "User updated.",
      status: "success",
      version: Date.now(),
    };
  } catch (error) {
    rethrowFrameworkError(error);
    return {
      message: error instanceof Error ? error.message : "Unable to update the user.",
      status: "error",
      version: Date.now(),
    };
  }
}

export async function removeWorshipAccess(formData: FormData) {
  const currentUser = await requireWorshipAdmin();
  const id = String(formData.get("id") || "");

  if (!id) throw new Error("A user is required.");
  if (currentUser.id === id) {
    throw new Error("You cannot remove access from the account you are signed in with.");
  }

  const admin = createAdminClient();
  const { data: before, error: lookupError } = await admin
    .from("worship_users")
    .select("email,access_level")
    .eq("id", id)
    .maybeSingle<{ email: string; access_level: string }>();

  if (lookupError) throw new Error(lookupError.message);

  const { error } = await admin.from("worship_users").delete().eq("id", id);

  if (error) throw new Error(error.message);

  await logWorshipUserEvent({
    action: "worship_user.access_removed",
    actor: currentUser,
    target: { id, email: before?.email ?? "" },
    details: {
      accessLevel: before?.access_level ?? null,
      authAccountKept: true,
    },
  });

  revalidatePath("/admin/users");
}

export async function removeWorshipAccessWithState(
  _previousState: WorshipActionState,
  formData: FormData,
): Promise<WorshipActionState> {
  try {
    await removeWorshipAccess(formData);
    return {
      message: "Worship access removed. The shared sign-in account was kept.",
      status: "success",
      version: Date.now(),
    };
  } catch (error) {
    rethrowFrameworkError(error);
    return {
      message: error instanceof Error ? error.message : "Unable to remove access.",
      status: "error",
      version: Date.now(),
    };
  }
}

export async function completePasswordReset() {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Sign-in is not configured on this server.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sign in before changing the password.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("worship_users")
    .update({ must_reset_password: false })
    .eq("id", user.id);

  if (error) {
    throw new Error("Unable to finish the password change.");
  }

  await logWorshipUserEvent({
    action: "worship_user.password_reset_completed",
    actor: { id: user.id, email: user.email ?? "" },
    target: { id: user.id, email: user.email ?? "" },
    details: {},
  });
}
