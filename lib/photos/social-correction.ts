import { ensurePhotoFolder, photoOverwriteUploadLink, relativePhotoPath, resolvePhotoPath } from "@/lib/dropbox/client";
import { getSubmissionById, toPublicSubmission } from "@/lib/photos/social-store";
import { createAdminClient } from "@/lib/supabase/admin";

const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function correctionPath(submissionId: string, photoId: string) {
  return `_Social queue/${submissionId}/${photoId}-source.jpg`;
}

function correctionLabel(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/-correction$/i, "").trim() || "photo";
  const cleaned = base.replace(/[^\w.\- ()]+/g, "_").slice(0, 80);
  return `${cleaned || "photo"}-correction.jpg`;
}

async function editablePhoto(submissionId: string, photoId: string) {
  if (!RECORD_ID.test(submissionId) || !RECORD_ID.test(photoId)) {
    throw new Error("That photo is not in this set.");
  }
  const current = await getSubmissionById(submissionId);
  if (!current) throw new Error("That photo set could not be found.");
  if (current.status === "published" || current.status === "publishing") {
    throw new Error("This set is already being posted.");
  }
  const photo = current.photos.find((item) => item.id === photoId);
  if (!photo) throw new Error("That photo is not in this set.");
  return photo;
}

export async function handleSocialCorrection(submissionId: string, body: unknown) {
  const value = (body ?? {}) as { photoId?: string; dropboxId?: string; path?: string; fileName?: string };
  const photoId = String(value.photoId || "");
  const photo = await editablePhoto(submissionId, photoId);
  const expected = correctionPath(submissionId, photoId);

  if (!value.dropboxId && !value.path) {
    await ensurePhotoFolder(`_Social queue/${submissionId}`);
    const upload = await photoOverwriteUploadLink(expected);
    return { link: upload.link, path: upload.path, name: upload.name };
  }

  const savedPath = relativePhotoPath(resolvePhotoPath(String(value.path || "")));
  if (savedPath.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Save the correction onto this post.");
  }
  const dropboxId = String(value.dropboxId || "");
  if (!dropboxId.startsWith("id:") || dropboxId.length > 200) {
    throw new Error("Dropbox did not accept the correction.");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("worship_social_photos")
    .update({
      dropbox_id: dropboxId,
      path: savedPath,
      file_name: correctionLabel(photo.fileName),
      feed_path: null,
      story_path: null,
    })
    .eq("id", photoId)
    .eq("submission_id", submissionId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That photo is not in this set.");

  const updated = await getSubmissionById(submissionId);
  if (!updated) throw new Error("That photo set could not be found.");
  return { submission: toPublicSubmission(updated) };
}
