import { redirect } from "next/navigation";
import type { WorshipFeatureKey } from "@/lib/worship-auth/features";
import { getCurrentWorshipUser, type WorshipUser } from "@/lib/worship-auth/users";

export async function requireWorshipFeature(
  feature: WorshipFeatureKey,
  nextPath: string,
): Promise<WorshipUser> {
  const currentUser = await getCurrentWorshipUser();

  if (!currentUser?.active) {
    redirect(`/?next=${encodeURIComponent(nextPath)}`);
  }

  if (currentUser.mustResetPassword) {
    redirect(`/change-password?next=${encodeURIComponent(nextPath)}`);
  }

  if (!currentUser.features.includes(feature)) {
    redirect("/home?denied=1");
  }

  return currentUser;
}

export async function requireWorshipFeatureApi(feature: WorshipFeatureKey) {
  const currentUser = await getCurrentWorshipUser();

  if (!currentUser?.active || currentUser.mustResetPassword) return null;
  if (!currentUser.features.includes(feature)) return null;
  return currentUser;
}
