const SOCIAL_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

export const SOCIAL_PHOTO_LIMIT = 10;

export function isSocialPhotoName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (!extension || extension === name.toLowerCase()) return false;
  return SOCIAL_EXTENSIONS.has(extension);
}

export type SocialStatus = "pending_review" | "approved" | "publishing" | "published" | "rejected" | "failed";

export type SocialDecision = "pending" | "approved" | "rejected";

export type SocialPhotoView = {
  id: string;
  fileName: string;
  decision: SocialDecision;
  facebookStoryId: string | null;
  instagramStoryId: string | null;
};

export type SocialSubmissionView = {
  id: string;
  folderPath: string;
  caption: string;
  scheduledAt: string;
  status: SocialStatus;
  submittedByName: string;
  publishError: string | null;
  facebookPostId: string | null;
  instagramPostId: string | null;
  createdAt: string;
  photos: SocialPhotoView[];
};
