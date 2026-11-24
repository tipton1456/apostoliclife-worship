import { downloadPhotoFile, ensurePhotoFolder, photoPreview, photoTemporaryLink, uploadGalleryBytes } from "@/lib/dropbox/client";
import { publicSiteOrigin } from "@/lib/site-origin";
import { renderFeedJpeg, renderStoryJpeg } from "@/lib/photos/story-frame";
import {
  claimSubmission,
  finishSubmission,
  getSubmissionById,
  listDueSubmissions,
  savePhotoAsset,
  saveSubmissionPost,
  type SocialPhotoRecord,
  type SocialSubmissionRecord,
} from "@/lib/photos/social-store";

// Adobe Express Content Scheduler has no public API. Approved posts go out
// through the Meta Graph API for the Facebook Page and its Instagram account.
const GRAPH = "https://graph.facebook.com/v25.0";

type GraphBody = {
  id?: string;
  post_id?: string;
  error?: { message?: string; error_user_msg?: string };
};

type MetaConfig = { pageId: string; igId: string; token: string };

function metaConfig(): MetaConfig | null {
  const pageId = process.env.META_PAGE_ID?.trim() || "";
  const igId = process.env.META_IG_USER_ID?.trim() || "";
  const token = process.env.META_PAGE_ACCESS_TOKEN?.trim() || "";
  if (!pageId || !igId || !token) return null;
  return { pageId, igId, token };
}

export function socialPublishingReady() {
  return Boolean(metaConfig());
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graph(path: string, token: string, body?: Record<string, string>) {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
    body: body ? new URLSearchParams(body) : undefined,
    cache: "no-store",
  });
  const json = (await response.json().catch(() => null)) as GraphBody | null;
  if (!response.ok || json?.error) {
    throw new Error(json?.error?.error_user_msg || json?.error?.message || `Meta request failed (${response.status}).`);
  }
  return json ?? {};
}

function mediaUrl(submission: SocialSubmissionRecord, photoId: string, kind: "feed" | "story") {
  return `${publicSiteOrigin()}/api/social-media/${photoId}/${kind}.jpg?key=${encodeURIComponent(submission.mediaKey)}`;
}

async function sourceBytes(photo: SocialPhotoRecord) {
  const extension = photo.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "heic" || extension === "heif") return photoPreview(photo.path);
  try {
    const bytes = await downloadPhotoFile(photo.path);
    if (bytes.length > 18 * 1024 * 1024) return photoPreview(photo.path);
    return bytes;
  } catch {
    return photoPreview(photo.path);
  }
}

async function ensureRendered(submission: SocialSubmissionRecord, photo: SocialPhotoRecord) {
  const folder = await ensurePhotoFolder(`_Social queue/${submission.id}`);
  let feedPath = photo.feedPath;
  let storyPath = photo.storyPath;
  if (feedPath && storyPath) return { feedPath, storyPath };

  const source = await sourceBytes(photo);
  if (!feedPath) {
    const feed = await renderFeedJpeg(source);
    const saved = await uploadGalleryBytes(folder, `${photo.id}-feed.jpg`, feed);
    feedPath = saved.path;
    await savePhotoAsset(photo.id, { feedPath });
  }
  if (!storyPath) {
    const story = await renderStoryJpeg(source);
    const saved = await uploadGalleryBytes(folder, `${photo.id}-story.jpg`, story);
    storyPath = saved.path;
    await savePhotoAsset(photo.id, { storyPath });
  }
  return { feedPath, storyPath };
}

async function waitForInstagram(token: string, creationId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const url = new URL(`${GRAPH}/${creationId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", token);
    const response = await fetch(url, { cache: "no-store" });
    const json = (await response.json().catch(() => null)) as { status_code?: string; error?: { message?: string } } | null;
    const code = json?.status_code || "";
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(json?.error?.message || "Instagram could not process that image.");
    }
    if (code === "FINISHED" || code === "PUBLISHED") return;
    await sleep(2000);
  }
}

async function publishInstagram(igId: string, token: string, creationId: string) {
  await waitForInstagram(token, creationId);
  const published = await graph(`${igId}/media_publish`, token, { creation_id: creationId });
  if (!published.id) throw new Error("Instagram did not return a post id.");
  return published.id;
}

async function publishFacebookFeed(config: MetaConfig, submission: SocialSubmissionRecord, photos: SocialPhotoRecord[]) {
  if (submission.facebookPostId) return submission.facebookPostId;
  const mediaIds: string[] = [];
  for (const photo of photos) {
    const uploaded = await graph(`${config.pageId}/photos`, config.token, {
      url: mediaUrl(submission, photo.id, "feed"),
      published: "false",
    });
    if (!uploaded.id) throw new Error(`Facebook did not accept ${photo.fileName}.`);
    mediaIds.push(uploaded.id);
  }

  const body: Record<string, string> = { message: submission.caption };
  mediaIds.forEach((mediaId, index) => {
    body[`attached_media[${index}]`] = JSON.stringify({ media_fbid: mediaId });
  });
  const post = await graph(`${config.pageId}/feed`, config.token, body);
  if (!post.id) throw new Error("Facebook did not return a post id.");
  await saveSubmissionPost(submission.id, { facebookPostId: post.id });
  return post.id;
}

async function publishInstagramFeed(config: MetaConfig, submission: SocialSubmissionRecord, photos: SocialPhotoRecord[]) {
  if (submission.instagramPostId) return submission.instagramPostId;

  if (photos.length === 1) {
    const container = await graph(`${config.igId}/media`, config.token, {
      image_url: mediaUrl(submission, photos[0].id, "feed"),
      caption: submission.caption,
    });
    if (!container.id) throw new Error("Instagram did not accept the photo.");
    const id = await publishInstagram(config.igId, config.token, container.id);
    await saveSubmissionPost(submission.id, { instagramPostId: id });
    return id;
  }

  const children: string[] = [];
  for (const photo of photos) {
    const container = await graph(`${config.igId}/media`, config.token, {
      image_url: mediaUrl(submission, photo.id, "feed"),
      is_carousel_item: "true",
    });
    if (!container.id) throw new Error(`Instagram did not accept ${photo.fileName}.`);
    await waitForInstagram(config.token, container.id);
    children.push(container.id);
  }
  const parent = await graph(`${config.igId}/media`, config.token, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption: submission.caption,
  });
  if (!parent.id) throw new Error("Instagram did not accept the carousel.");
  const id = await publishInstagram(config.igId, config.token, parent.id);
  await saveSubmissionPost(submission.id, { instagramPostId: id });
  return id;
}

async function publishStories(config: MetaConfig, submission: SocialSubmissionRecord, photos: SocialPhotoRecord[]) {
  for (const photo of photos) {
    const storyUrl = mediaUrl(submission, photo.id, "story");
    if (!photo.facebookStoryId) {
      const uploaded = await graph(`${config.pageId}/photos`, config.token, { url: storyUrl, published: "false" });
      if (!uploaded.id) throw new Error(`Facebook did not accept the story for ${photo.fileName}.`);
      const story = await graph(`${config.pageId}/photo_stories`, config.token, { photo_id: uploaded.id });
      const storyId = story.post_id || story.id;
      if (!storyId) throw new Error(`Facebook did not post the story for ${photo.fileName}.`);
      await savePhotoAsset(photo.id, { facebookStoryId: storyId });
      photo.facebookStoryId = storyId;
    }
    if (!photo.instagramStoryId) {
      const container = await graph(`${config.igId}/media`, config.token, {
        image_url: storyUrl,
        media_type: "STORIES",
      });
      if (!container.id) throw new Error(`Instagram did not accept the story for ${photo.fileName}.`);
      const storyId = await publishInstagram(config.igId, config.token, container.id);
      await savePhotoAsset(photo.id, { instagramStoryId: storyId });
      photo.instagramStoryId = storyId;
    }
  }
}

export async function publishSubmission(id: string) {
  const config = metaConfig();
  if (!config) {
    return { ok: false as const, skipped: false as const, errors: ["Facebook and Instagram are not connected yet."] };
  }

  const claimed = await claimSubmission(id);
  if (!claimed) return { ok: false as const, skipped: true as const, errors: [] as string[] };

  const errors: string[] = [];
  try {
    const submission = await getSubmissionById(id);
    if (!submission) throw new Error("That photo set could not be found.");
    const photos = submission.photos.filter((photo) => photo.decision === "approved");
    if (!photos.length) throw new Error("Approve at least one photo.");

    for (const photo of photos) {
      const rendered = await ensureRendered(submission, photo);
      photo.feedPath = rendered.feedPath;
      photo.storyPath = rendered.storyPath;
    }

    // Touch the Dropbox links once so a missing file fails before Meta is called.
    await photoTemporaryLink(photos[0].feedPath || photos[0].path);

    try {
      await publishFacebookFeed(config, submission, photos);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Facebook post failed.");
    }
    try {
      await publishInstagramFeed(config, submission, photos);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Instagram post failed.");
    }
    try {
      await publishStories(config, submission, photos);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Story posting failed.");
    }

    if (errors.length) {
      await finishSubmission(id, "failed", errors.join(" "));
      return { ok: false as const, skipped: false as const, errors };
    }

    await finishSubmission(id, "published", null);
    return { ok: true as const, skipped: false as const, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Posting failed.";
    await finishSubmission(id, "failed", message);
    return { ok: false as const, skipped: false as const, errors: [message] };
  }
}

export async function publishDueSubmissions() {
  if (!metaConfig()) return { published: 0, failed: 0, waiting: true as const };
  const ids = await listDueSubmissions();
  let published = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await publishSubmission(id);
    if (result.ok) published += 1;
    else if (!result.skipped) failed += 1;
  }
  return { published, failed, waiting: false as const };
}
