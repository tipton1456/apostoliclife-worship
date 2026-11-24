import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { appendSmsOptOut, normalizePhoneNumber, sendTwilioSms } from "@/lib/sms";
import { publicSiteOrigin } from "@/lib/site-origin";
import { centralToIso } from "@/lib/photos/central-time";
import {
  isSocialPhotoName,
  SOCIAL_PHOTO_LIMIT,
  type SocialDecision,
  type SocialPhotoView,
  type SocialStatus,
  type SocialSubmissionView,
} from "@/lib/photos/social-files";

const APPROVER_EMAIL = "s.tipton@apostoliclifeupci.com";

type SubmissionRow = {
  id: string;
  token_hash: string;
  media_key: string;
  folder_path: string;
  caption: string;
  scheduled_at: string;
  status: SocialStatus;
  submitted_by_name: string | null;
  publish_error: string | null;
  facebook_post_id: string | null;
  instagram_post_id: string | null;
  created_at: string;
};

type PhotoRow = {
  id: string;
  submission_id: string;
  dropbox_id: string;
  path: string;
  file_name: string;
  decision: SocialDecision;
  sort_order: number;
  feed_path: string | null;
  story_path: string | null;
  facebook_story_id: string | null;
  instagram_story_id: string | null;
};

export type SocialPhotoRecord = {
  id: string;
  dropboxId: string;
  path: string;
  fileName: string;
  decision: SocialDecision;
  sortOrder: number;
  feedPath: string | null;
  storyPath: string | null;
  facebookStoryId: string | null;
  instagramStoryId: string | null;
};

export type SocialSubmissionRecord = {
  id: string;
  mediaKey: string;
  folderPath: string;
  caption: string;
  scheduledAt: string;
  status: SocialStatus;
  submittedByName: string;
  publishError: string | null;
  facebookPostId: string | null;
  instagramPostId: string | null;
  createdAt: string;
  photos: SocialPhotoRecord[];
};

export type ReviewAction = "save" | "approve" | "retry";

export type ReviewInput = {
  action: ReviewAction;
  caption: string;
  scheduledAt: string;
  decisions: { id: string; decision: SocialDecision }[];
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function mapPhoto(row: PhotoRow): SocialPhotoRecord {
  return {
    id: row.id,
    dropboxId: row.dropbox_id,
    path: row.path,
    fileName: row.file_name,
    decision: row.decision,
    sortOrder: row.sort_order,
    feedPath: row.feed_path,
    storyPath: row.story_path,
    facebookStoryId: row.facebook_story_id,
    instagramStoryId: row.instagram_story_id,
  };
}

function mapSubmission(row: SubmissionRow, photos: PhotoRow[]): SocialSubmissionRecord {
  return {
    id: row.id,
    mediaKey: row.media_key,
    folderPath: row.folder_path,
    caption: row.caption,
    scheduledAt: row.scheduled_at,
    status: row.status,
    submittedByName: row.submitted_by_name || "",
    publishError: row.publish_error,
    facebookPostId: row.facebook_post_id,
    instagramPostId: row.instagram_post_id,
    createdAt: row.created_at,
    photos: photos.map(mapPhoto),
  };
}

export function toPublicSubmission(record: SocialSubmissionRecord): SocialSubmissionView {
  return {
    id: record.id,
    folderPath: record.folderPath,
    caption: record.caption,
    scheduledAt: record.scheduledAt,
    status: record.status,
    submittedByName: record.submittedByName,
    publishError: record.publishError,
    facebookPostId: record.facebookPostId,
    instagramPostId: record.instagramPostId,
    createdAt: record.createdAt,
    photos: record.photos.map((photo) => ({
      id: photo.id,
      fileName: photo.fileName,
      decision: photo.decision,
      facebookStoryId: photo.facebookStoryId,
      instagramStoryId: photo.instagramStoryId,
    })),
  };
}

async function loadPhotos(submissionId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("worship_social_photos")
    .select("id, submission_id, dropbox_id, path, file_name, decision, sort_order, feed_path, story_path, facebook_story_id, instagram_story_id")
    .eq("submission_id", submissionId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PhotoRow[];
}

async function loadSubmission(row: SubmissionRow) {
  return mapSubmission(row, await loadPhotos(row.id));
}

const SUBMISSION_COLUMNS =
  "id, token_hash, media_key, folder_path, caption, scheduled_at, status, submitted_by_name, publish_error, facebook_post_id, instagram_post_id, created_at";

export async function getSubmissionById(id: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("worship_social_submissions").select(SUBMISSION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return loadSubmission(data as SubmissionRow);
}

export async function getSubmissionByToken(token: string) {
  const trimmed = token.trim();
  if (trimmed.length < 20) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("worship_social_submissions")
    .select(SUBMISSION_COLUMNS)
    .eq("token_hash", hashToken(trimmed))
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return loadSubmission(data as SubmissionRow);
}

async function approverPhone() {
  const override = normalizePhoneNumber(process.env.SOCIAL_APPROVER_PHONE || "");
  if (override) return override;

  const email = (process.env.SOCIAL_APPROVER_EMAIL || APPROVER_EMAIL).trim().toLowerCase();
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("worship_users").select("phone").ilike("email", email).maybeSingle();
  if (error) return "";
  return normalizePhoneNumber((data?.phone as string | null) ?? "");
}

export async function createSocialSubmission(input: {
  folderPath: string;
  caption: string;
  scheduledAt: string;
  submittedBy: string;
  submittedByName: string;
  photos: { dropboxId: string; path: string; fileName: string }[];
}) {
  const caption = input.caption.trim();
  if (caption.length < 1 || caption.length > 2000) {
    throw new Error("Write a caption of 2,000 characters or less.");
  }

  const scheduledAt = centralToIso(input.scheduledAt);
  const when = new Date(scheduledAt).getTime();
  if (when < Date.now() - 60_000) throw new Error("Choose a time that has not already passed.");
  if (when > Date.now() + 30 * 24 * 60 * 60 * 1000) throw new Error("Choose a time within the next 30 days.");

  const photos = input.photos.slice(0, SOCIAL_PHOTO_LIMIT);
  if (!photos.length || photos.length > SOCIAL_PHOTO_LIMIT) {
    throw new Error(`Choose 1 to ${SOCIAL_PHOTO_LIMIT} photos.`);
  }
  if (photos.some((photo) => !photo.path || !photo.dropboxId || !isSocialPhotoName(photo.fileName))) {
    throw new Error("Choose JPG, PNG, WebP, or HEIC photos.");
  }

  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const mediaKey = randomBytes(24).toString("base64url");
  const supabase = createAdminClient();
  const { error } = await supabase.from("worship_social_submissions").insert({
    id,
    token_hash: hashToken(token),
    media_key: mediaKey,
    folder_path: input.folderPath,
    caption,
    scheduled_at: scheduledAt,
    status: "pending_review",
    submitted_by: input.submittedBy,
    submitted_by_name: input.submittedByName,
  });
  if (error) throw error;

  const { error: photoError } = await supabase.from("worship_social_photos").insert(
    photos.map((photo, index) => ({
      id: randomUUID(),
      submission_id: id,
      dropbox_id: photo.dropboxId,
      path: photo.path,
      file_name: photo.fileName,
      decision: "pending",
      sort_order: index,
    })),
  );
  if (photoError) throw photoError;

  const folderLabel = input.folderPath.split("/").filter(Boolean).pop() || "the photo library";
  const reviewUrl = `${publicSiteOrigin()}/social-review/${token}`;
  const phone = await approverPhone();
  let smsOk = false;
  let smsError = "";

  if (!phone) {
    smsError = "No mobile number is saved for the approver.";
  } else {
    const sms = await sendTwilioSms({
      to: phone,
      body: appendSmsOptOut(
        `Apostolic Worship: photos are ready for social media approval (${folderLabel}). ${reviewUrl}`,
      ),
    });
    smsOk = sms.ok;
    if (!sms.ok) smsError = sms.failureMessage;
  }

  return { id, smsOk, smsError };
}

export async function listSocialSubmissions() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("worship_social_submissions")
    .select("id, folder_path, caption, scheduled_at, status, submitted_by_name, publish_error, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    folderPath: row.folder_path as string,
    caption: row.caption as string,
    scheduledAt: row.scheduled_at as string,
    status: row.status as SocialStatus,
    submittedByName: (row.submitted_by_name as string | null) || "",
    publishError: (row.publish_error as string | null) || null,
    createdAt: row.created_at as string,
  }));
}

export function parseReviewInput(body: unknown): ReviewInput {
  const value = (body ?? {}) as {
    action?: string;
    caption?: string;
    scheduledAt?: string;
    decisions?: { id?: string; decision?: string }[];
  };
  if (value.action !== "save" && value.action !== "approve" && value.action !== "retry") {
    throw new Error("Choose what to do with this set.");
  }

  const decisions: { id: string; decision: SocialDecision }[] = [];
  for (const item of value.decisions ?? []) {
    if (!item?.id) continue;
    if (item.decision !== "approved" && item.decision !== "rejected" && item.decision !== "pending") continue;
    decisions.push({ id: item.id, decision: item.decision });
  }

  return {
    action: value.action,
    caption: String(value.caption ?? ""),
    scheduledAt: String(value.scheduledAt ?? ""),
    decisions,
  };
}

export async function getReviewPhotoPath(token: string, photoId: string) {
  const submission = await getSubmissionByToken(token);
  return submission?.photos.find((photo) => photo.id === photoId)?.path ?? null;
}

export async function getSocialMediaPath(photoId: string, kind: "feed" | "story", key: string) {
  if (!photoId || !key) return null;
  const supabase = createAdminClient();
  const { data: photo, error } = await supabase
    .from("worship_social_photos")
    .select("submission_id, feed_path, story_path")
    .eq("id", photoId)
    .maybeSingle();
  if (error || !photo) return null;

  const { data: submission, error: submissionError } = await supabase
    .from("worship_social_submissions")
    .select("media_key")
    .eq("id", photo.submission_id)
    .maybeSingle();
  if (submissionError || !submission?.media_key || submission.media_key !== key) return null;
  const path = kind === "feed" ? photo.feed_path : photo.story_path;
  return typeof path === "string" && path ? path : null;
}

export async function applySocialReview(id: string, input: ReviewInput) {
  const current = await getSubmissionById(id);
  if (!current) return null;
  if (current.status === "published" || current.status === "publishing") {
    throw new Error("This set is already being posted.");
  }
  if (input.action === "retry" && current.status !== "failed") {
    throw new Error("Only a set that failed to post can be tried again.");
  }

  const caption = input.caption.trim();
  if ((input.action === "approve" || input.action === "retry") && (caption.length < 1 || caption.length > 2000)) {
    throw new Error("Write a caption of 2,000 characters or less.");
  }
  if (caption.length > 2000) throw new Error("Write a caption of 2,000 characters or less.");

  const scheduledAt = input.action === "retry" ? new Date().toISOString() : centralToIso(input.scheduledAt);
  const when = new Date(scheduledAt).getTime();
  if (input.action !== "retry" && when < Date.now() - 60_000) {
    throw new Error("Choose a time that has not already passed.");
  }

  const decisions = new Map(input.decisions.map((item) => [item.id, item.decision]));
  const nextPhotos = current.photos.map((photo) => {
    const decision = decisions.get(photo.id) ?? photo.decision;
    return decision === "approved" || decision === "rejected" ? decision : photo.decision;
  });
  const approvedCount = nextPhotos.filter((decision) => decision === "approved").length;
  if ((input.action === "approve" || input.action === "retry") && nextPhotos.some((decision) => decision === "pending")) {
    throw new Error("Approve or reject each photo.");
  }

  let status: SocialStatus = current.status === "failed" ? "failed" : "pending_review";
  if (input.action === "approve") status = approvedCount ? "approved" : "rejected";
  if (input.action === "retry") {
    if (!approvedCount) throw new Error("Approve at least one photo before posting again.");
    status = "approved";
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("worship_social_submissions")
    .update({
      caption: caption || current.caption,
      scheduled_at: scheduledAt,
      status,
      publish_error: input.action === "retry" ? null : current.publishError,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  await Promise.all(
    current.photos.map((photo, index) =>
      supabase
        .from("worship_social_photos")
        .update({ decision: nextPhotos[index] })
        .eq("id", photo.id)
        .eq("submission_id", id),
    ),
  );

  return getSubmissionById(id);
}

export async function listDueSubmissions() {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await supabase
    .from("worship_social_submissions")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("status", "publishing")
    .lt("updated_at", cutoff);

  const { data, error } = await supabase
    .from("worship_social_submissions")
    .select("id")
    .eq("status", "approved")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5);
  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
}

export async function claimSubmission(id: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("worship_social_submissions")
    .update({ status: "publishing", publish_error: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function savePhotoAsset(
  photoId: string,
  patch: { feedPath?: string; storyPath?: string; facebookStoryId?: string; instagramStoryId?: string },
) {
  const supabase = createAdminClient();
  const update: Record<string, string> = {};
  if (patch.feedPath) update.feed_path = patch.feedPath;
  if (patch.storyPath) update.story_path = patch.storyPath;
  if (patch.facebookStoryId) update.facebook_story_id = patch.facebookStoryId;
  if (patch.instagramStoryId) update.instagram_story_id = patch.instagramStoryId;
  if (!Object.keys(update).length) return;
  const { error } = await supabase.from("worship_social_photos").update(update).eq("id", photoId);
  if (error) throw error;
}

export async function saveSubmissionPost(id: string, patch: { facebookPostId?: string; instagramPostId?: string }) {
  const supabase = createAdminClient();
  const update: Record<string, string> = { updated_at: new Date().toISOString() };
  if (patch.facebookPostId) update.facebook_post_id = patch.facebookPostId;
  if (patch.instagramPostId) update.instagram_post_id = patch.instagramPostId;
  const { error } = await supabase.from("worship_social_submissions").update(update).eq("id", id);
  if (error) throw error;
}

export async function finishSubmission(id: string, status: "published" | "failed", publishError: string | null) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("worship_social_submissions")
    .update({
      status,
      publish_error: publishError,
      published_at: status === "published" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
