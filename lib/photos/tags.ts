import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePersonTag } from "@/lib/photos/tag-name";
import type { GalleryImage, PersonSummary, PhotoDetails } from "@/lib/photos/types";

type TagRow = {
  dropbox_id: string;
  path: string;
  file_name: string;
  size_bytes: number | string;
  client_modified: string | null;
  tag: string;
  tag_key: string;
};

function friendlyTagError(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return null;
  if (error.code === "42P01" || error.code === "PGRST205") return "Photo tags are not set up yet.";
  console.error(fallback, error.code || "", error.message || "");
  return fallback;
}

async function selectAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
) {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(friendlyTagError(error, "Unable to load photo tags.") || "Unable to load photo tags.");
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

export async function listPeople(): Promise<PersonSummary[]> {
  const supabase = createAdminClient();
  const rows = await selectAll<{ tag: string; tag_key: string; size_bytes: number | string }>((from, to) =>
    supabase.from("worship_photo_tags").select("tag, tag_key, size_bytes").range(from, to),
  );

  const grouped = new Map<string, PersonSummary>();
  for (const row of rows) {
    const current = grouped.get(row.tag_key) ?? { tag: row.tag, count: 0, sizeBytes: 0 };
    current.count += 1;
    current.sizeBytes += Number(row.size_bytes) || 0;
    grouped.set(row.tag_key, current);
  }

  return [...grouped.values()].sort((left, right) =>
    left.tag.localeCompare(right.tag, "en", { sensitivity: "base" }),
  );
}

export async function listTagsForPhoto(dropboxId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("worship_photo_tags").select("tag").eq("dropbox_id", dropboxId);
  const message = friendlyTagError(error, "Unable to load people for this photo.");
  if (message) throw new Error(message);

  return (data ?? [])
    .map((row) => row.tag)
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
}

export async function photosForPerson(tag: string): Promise<{ tag: string; images: GalleryImage[] }> {
  const normalized = normalizePersonTag(tag);
  if (!normalized) throw new Error("Choose a person from the list.");

  const supabase = createAdminClient();
  const existing = await supabase
    .from("worship_photo_tags")
    .select("tag")
    .eq("tag_key", normalized.tagKey)
    .limit(1)
    .maybeSingle();
  const existingMessage = friendlyTagError(existing.error, "Unable to load that person.");
  if (existingMessage) throw new Error(existingMessage);

  const displayTag = existing.data?.tag ?? normalized.tag;
  const rows = await selectAll<TagRow>((from, to) =>
    supabase
      .from("worship_photo_tags")
      .select("dropbox_id, path, file_name, size_bytes, client_modified, tag, tag_key")
      .eq("tag_key", normalized.tagKey)
      .order("file_name", { ascending: true })
      .range(from, to),
  );

  const images = rows
    .map((row) => ({
      id: row.dropbox_id,
      name: row.file_name,
      path: row.path,
      size: Number(row.size_bytes) || 0,
      modified: row.client_modified,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));

  return { tag: displayTag, images };
}

export async function addPhotoTag(photo: PhotoDetails, rawTag: string, userId: string) {
  const normalized = normalizePersonTag(rawTag);
  if (!normalized) {
    throw new Error("Enter a person's name using letters, numbers, spaces, apostrophes, or hyphens.");
  }

  const supabase = createAdminClient();
  const existing = await supabase
    .from("worship_photo_tags")
    .select("tag")
    .eq("tag_key", normalized.tagKey)
    .limit(1)
    .maybeSingle();
  const existingMessage = friendlyTagError(existing.error, "Unable to add that person.");
  if (existingMessage) throw new Error(existingMessage);

  const tag = existing.data?.tag ?? normalized.tag;
  const { error } = await supabase.from("worship_photo_tags").insert({
    dropbox_id: photo.id,
    path: photo.path,
    file_name: photo.name,
    size_bytes: photo.size,
    client_modified: photo.modified,
    tag,
    tag_key: normalized.tagKey,
    created_by: userId,
  });

  if (error?.code === "23505") {
    await supabase
      .from("worship_photo_tags")
      .update({
        path: photo.path,
        file_name: photo.name,
        size_bytes: photo.size,
        client_modified: photo.modified,
      })
      .eq("dropbox_id", photo.id)
      .eq("tag_key", normalized.tagKey);
  } else if (error) {
    throw new Error(friendlyTagError(error, "Unable to add that person.") || "Unable to add that person.");
  }

  return listTagsForPhoto(photo.id);
}

export async function removePhotoTag(dropboxId: string, rawTag: string) {
  const normalized = normalizePersonTag(rawTag);
  if (!normalized || !dropboxId) throw new Error("Choose a person to remove.");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("worship_photo_tags")
    .delete()
    .eq("dropbox_id", dropboxId)
    .eq("tag_key", normalized.tagKey);
  const message = friendlyTagError(error, "Unable to remove that person.");
  if (message) throw new Error(message);

  return listTagsForPhoto(dropboxId);
}

export async function syncTaggedFiles(files: GalleryImage[]) {
  if (!files.length) return;

  const supabase = createAdminClient();
  const byId = new Map(files.map((file) => [file.id, file]));
  const ids = [...byId.keys()];
  const existing: { dropbox_id: string; path: string; file_name: string; size_bytes: number | string }[] = [];

  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { data, error } = await supabase
      .from("worship_photo_tags")
      .select("dropbox_id, path, file_name, size_bytes")
      .in("dropbox_id", chunk);
    if (error) {
      console.error("photo tag sync", error.code || "", error.message || "");
      return;
    }
    existing.push(...(data ?? []));
  }

  const seen = new Set<string>();
  const updates = existing.filter((row) => {
    if (seen.has(row.dropbox_id)) return false;
    seen.add(row.dropbox_id);
    const file = byId.get(row.dropbox_id);
    if (!file) return false;
    return file.path !== row.path || file.name !== row.file_name || file.size !== Number(row.size_bytes);
  });

  await Promise.all(
    updates.map((row) => {
      const file = byId.get(row.dropbox_id);
      if (!file) return Promise.resolve();
      return supabase
        .from("worship_photo_tags")
        .update({
          path: file.path,
          file_name: file.name,
          size_bytes: file.size,
          client_modified: file.modified,
        })
        .eq("dropbox_id", file.id);
    }),
  );
}
