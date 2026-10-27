"use server";

import { randomInt } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { appendSmsOptOut, normalizePhoneNumber, sendTwilioSms } from "@/lib/sms";

export type PasswordResetState = {
  message: string;
  status: "idle" | "success" | "error";
  version: number;
};

const GENERIC =
  "If that account exists, a text message was sent with a temporary password.";

function temporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*?";
  const pools = [upper, upper, lower, lower, lower, lower, lower, digits, digits, special, special];
  const chars = pools.map((pool) => pool[randomInt(pool.length)]);

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }

  return chars.join("");
}

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://apostolicworship.tech").replace(/\/$/, "");
}

export async function requestWorshipPasswordReset(
  _previous: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const version = Date.now();
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { message: GENERIC, status: "success", version };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("worship_users")
      .select("id,email,phone,active")
      .eq("email", email)
      .maybeSingle<{ id: string; email: string; phone: string | null; active: boolean | null }>();

    if (error) {
      console.error("Password reset lookup failed:", error.message);
      return { message: "Unable to start a password reset right now.", status: "error", version };
    }

    if (!data || data.active === false) {
      return { message: GENERIC, status: "success", version };
    }

    const phone = normalizePhoneNumber(data.phone ?? "");

    if (!phone) {
      return {
        message: "That account does not have a valid mobile number for text messages.",
        status: "error",
        version,
      };
    }

    const password = temporaryPassword();
    const sent = await sendTwilioSms({
      to: phone,
      body: appendSmsOptOut(
        `Apostolic Worship: your temporary password is ${password}\n\nSign in, then set a new password: ${siteOrigin()}/`,
      ),
    });

    if (!sent.ok) {
      return {
        message: "Unable to send the reset text. Try again in a moment.",
        status: "error",
        version,
      };
    }

    const { error: authError } = await admin.auth.admin.updateUserById(data.id, { password });

    if (authError) {
      return { message: "Unable to reset that password.", status: "error", version };
    }

    const { error: profileError } = await admin
      .from("worship_users")
      .update({ must_reset_password: true })
      .eq("id", data.id);

    if (profileError) {
      return { message: "Unable to reset that password.", status: "error", version };
    }

    return { message: GENERIC, status: "success", version };
  } catch (error) {
    console.error("Password reset failed:", error instanceof Error ? error.message : "unknown");
    return { message: "Unable to start a password reset right now.", status: "error", version };
  }
}
