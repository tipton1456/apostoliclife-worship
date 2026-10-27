import { listGallerySubtree, photoMetadata, relativePhotoPath, resolvePhotoPath } from "@/lib/dropbox/client";
import {
  bestFaceMatch,
  photoInFolder,
  type FaceBox,
  type FaceJob,
  type FaceReference,
  type FaceSuggestionView,
} from "@/lib/photos/face-match";
import { normalizePersonTag } from "@/lib/photos/tag-name";
import { addPhotoTag } from "@/lib/photos/tags";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_REFERENCES = 12;
const SAME_FACE_DISTANCE = 0.12;
const MAX_PHOTOS = 8;
const MAX_FACES = 30;

type QueryError = { code?: string; message?: string } | null;

type SuggestionViewRow = {
  id: number;
  dropbox_id: string;
  path: string;
  file_name: string;
  crop_jpeg: string;
  suggested_tag: string | null;
  distance: number | null;
};

type SuggestionInsert = {
  client_key: string;
  folder_path: string;
  dropbox_id: string;
  path: string;
  file_name: string;
  box: FaceBox;
  crop_jpeg: string;
  embedding: number[];
  status: "pending";
  suggested_tag: string | null;
  suggested_tag_key: string | null;
  distance: number | null;
};

export type IncomingFace = {
  box: FaceBox;
  crop: string;
  embedding: number[];
  suggestedTag: string | null;
  distance: number | null;
};

export type IncomingFacePhoto = {
  id: string;
  path: string;
  faces: IncomingFace[];
};

export type FaceDecision = {
  id: number;
  action: "approve" | "dismiss";
  tag?: string;
};

function friendlyFaceError(error: QueryError, fallback: string) {
  if (!error) return null;
  if (error.code === "42P01" || error.code === "PGRST205") return "Face recognition is not set up yet.";
  console.error(fallback, error.code || "", error.message || "");
  return fallback;
}

function chunks<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

async function selectAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: QueryError }>,
) {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(friendlyFaceError(error, "Unable to load face recognition.") || "Unable to load face recognition.");
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function folderFromInput(folderInput: string) {
  return relativePhotoPath(resolvePhotoPath(folderInput));
}

function dropboxId(value: string) {
  return /^id:[A-Za-z0-9_-]{5,200}$/.test(value);
}

function cleanCrop(value: string) {
  const trimmed = value.trim().replace(/^data:image\/jpeg;base64,/, "");
  if (trimmed.length < 100 || trimmed.length > 80_000) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return null;
  return trimmed;
}

function cleanEmbedding(value: unknown) {
  if (!Array.isArray(value) || value.length !== 128) return null;
  const embedding: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item) || item < -4 || item > 4) return null;
    embedding.push(item);
  }
  return embedding;
}

function cleanBox(value: unknown): FaceBox | null {
  if (!value || typeof value !== "object") return null;
  const box = value as Record<string, unknown>;
  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);
  const height = Number(box.height);
  if (![x, y, width, height].every((item) => Number.isFinite(item))) return null;
  if (x < -0.05 || y < -0.05 || x > 1 || y > 1) return null;
  if (width <= 0.01 || height <= 0.01 || width > 1.2 || height > 1.2) return null;
  return { x, y, width, height };
}

function cleanDistance(value: unknown) {
  if (value == null || value === "") return null;
  const distance = Number(value);
  if (!Number.isFinite(distance) || distance < 0 || distance > 2) return null;
  return distance;
}

function fileNameFromPath(path: string) {
  return path.split("/").pop() || "photo.jpg";
}

async function tagsForPhotos(ids: string[]) {
  const tags = new Map<string, string[]>();
  if (!ids.length) return tags;

  const supabase = createAdminClient();
  for (const group of chunks(ids, 100)) {
    const { data, error } = await supabase.from("worship_photo_tags").select("dropbox_id, tag").in("dropbox_id", group);
    if (error) throw new Error(friendlyFaceError(error, "Unable to load people tags.") || "Unable to load people tags.");
    for (const row of data ?? []) {
      const list = tags.get(row.dropbox_id) ?? [];
      list.push(row.tag);
      tags.set(row.dropbox_id, list);
    }
  }

  for (const list of tags.values()) {
    list.sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
  }
  return tags;
}

function toView(row: SuggestionViewRow, photoTags: string[]): FaceSuggestionView {
  return {
    id: Number(row.id),
    path: row.path,
    fileName: row.file_name,
    crop: row.crop_jpeg,
    suggestedTag: row.suggested_tag,
    distance: row.distance == null ? null : Number(row.distance),
    photoTags,
  };
}

async function listReferences(): Promise<FaceReference[]> {
  const supabase = createAdminClient();
  const rows = await selectAll<{ tag: string; tag_key: string; embedding: unknown }>((from, to) =>
    supabase.from("worship_face_references").select("tag, tag_key, embedding").order("created_at", { ascending: true }).range(from, to),
  );

  const references: FaceReference[] = [];
  for (const row of rows) {
    const embedding = cleanEmbedding(row.embedding);
    if (!embedding) continue;
    references.push({ tag: row.tag, tagKey: row.tag_key, embedding });
  }
  return references;
}

export async function listFaceJob(folderInput: string): Promise<FaceJob> {
  const folder = folderFromInput(folderInput);
  const images = await listGallerySubtree(folder);
  const supabase = createAdminClient();
  const scanned = new Set<string>();

  for (const group of chunks(images.map((image) => image.id), 100)) {
    const { data, error } = await supabase.from("worship_face_scans").select("dropbox_id").in("dropbox_id", group);
    if (error) throw new Error(friendlyFaceError(error, "Unable to load checked photos.") || "Unable to load checked photos.");
    for (const row of data ?? []) scanned.add(row.dropbox_id);
  }

  const fresh = images.filter((image) => !scanned.has(image.id));
  const freshTags = await tagsForPhotos(fresh.map((image) => image.id));
  const pendingRows = await selectAll<SuggestionViewRow>((from, to) =>
    supabase
      .from("worship_face_suggestions")
      .select("id, dropbox_id, path, file_name, crop_jpeg, suggested_tag, distance")
      .eq("status", "pending")
      .order("file_name", { ascending: true })
      .range(from, to),
  );
  const pendingInFolder = pendingRows.filter((row) => photoInFolder(row.path, folder));
  const pendingTags = await tagsForPhotos(pendingInFolder.map((row) => row.dropbox_id));

  return {
    folder,
    images: fresh.map((image) => ({ ...image, tags: freshTags.get(image.id) ?? [] })),
    pending: pendingInFolder.map((row) => toView(row, pendingTags.get(row.dropbox_id) ?? [])),
    references: await listReferences(),
    skipped: images.length - fresh.length,
    total: images.length,
  };
}

export async function saveFaceScan(folderInput: string, photos: IncomingFacePhoto[], userId: string) {
  if (!Array.isArray(photos) || photos.length === 0 || photos.length > MAX_PHOTOS) {
    throw new Error("Send a small batch of photos.");
  }

  const folder = folderFromInput(folderInput);
  const supabase = createAdminClient();
  const accepted = photos.filter((photo) => photo && dropboxId(photo.id) && photoInFolder(photo.path, folder));
  if (!accepted.length) return [];

  const ids = accepted.map((photo) => photo.id);
  const { data: existing, error: existingError } = await supabase
    .from("worship_face_scans")
    .select("dropbox_id")
    .in("dropbox_id", ids);
  if (existingError) {
    throw new Error(friendlyFaceError(existingError, "Unable to save face results.") || "Unable to save face results.");
  }

  const already = new Set((existing ?? []).map((row) => row.dropbox_id));
  const fresh = accepted.filter((photo) => !already.has(photo.id));
  if (!fresh.length) return [];

  const knownTags = await tagsForPhotos(fresh.map((photo) => photo.id));
  const suggestionRows: SuggestionInsert[] = [];
  const seeds: { tag: string; tagKey: string; dropboxId: string; embedding: number[] }[] = [];
  for (const photo of fresh) {
    const faces = Array.isArray(photo.faces) ? photo.faces.slice(0, MAX_FACES) : [];
    const prepared = faces.flatMap((face) => {
      const box = cleanBox(face?.box);
      const crop = typeof face?.crop === "string" ? cleanCrop(face.crop) : null;
      const embedding = cleanEmbedding(face?.embedding);
      if (!box || !crop || !embedding) return [];
      const normalized = face.suggestedTag ? normalizePersonTag(face.suggestedTag) : null;
      return [{ box, crop, embedding, normalized, distance: cleanDistance(face.distance) }];
    });

    const only = prepared.length === 1 ? prepared[0] : null;
    const existingTag =
      only?.normalized &&
      (knownTags.get(photo.id) ?? []).find((tag) => tag.toLocaleLowerCase("en") === only.normalized?.tagKey);
    if (only?.normalized && existingTag) {
      seeds.push({
        tag: existingTag,
        tagKey: only.normalized.tagKey,
        dropboxId: photo.id,
        embedding: only.embedding,
      });
      continue;
    }

    prepared.forEach((face, index) => {
      suggestionRows.push({
        client_key: `${photo.id}#${index}`,
        folder_path: folder,
        dropbox_id: photo.id,
        path: photo.path,
        file_name: fileNameFromPath(photo.path),
        box: face.box,
        crop_jpeg: face.crop,
        embedding: face.embedding,
        status: "pending",
        suggested_tag: face.normalized?.tag ?? null,
        suggested_tag_key: face.normalized?.tagKey ?? null,
        distance: face.normalized ? face.distance : null,
      });
    });
  }

  let saved: SuggestionViewRow[] = [];
  if (suggestionRows.length) {
    const { error } = await supabase.from("worship_face_suggestions").upsert(suggestionRows, {
      onConflict: "client_key",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(friendlyFaceError(error, "Unable to save face results.") || "Unable to save face results.");

    const keys = suggestionRows.map((row) => row.client_key);
    const { data, error: readError } = await supabase
      .from("worship_face_suggestions")
      .select("id, dropbox_id, path, file_name, crop_jpeg, suggested_tag, distance")
      .in("client_key", keys)
      .eq("status", "pending");
    if (readError) throw new Error(friendlyFaceError(readError, "Unable to save face results.") || "Unable to save face results.");
    saved = (data ?? []) as SuggestionViewRow[];
  }

  for (const seed of seeds) {
    await rememberFace(seed.tag, seed.tagKey, seed.dropboxId, seed.embedding, userId);
  }

  const { error: scanError } = await supabase.from("worship_face_scans").upsert(
    fresh.map((photo) => ({ dropbox_id: photo.id, folder_path: folder })),
    { onConflict: "dropbox_id", ignoreDuplicates: true },
  );
  if (scanError) throw new Error(friendlyFaceError(scanError, "Unable to save face results.") || "Unable to save face results.");

  const photoTags = await tagsForPhotos(saved.map((row) => row.dropbox_id));
  return saved.map((row) => toView(row, photoTags.get(row.dropbox_id) ?? []));
}

async function rememberFace(tag: string, tagKey: string, dropboxId: string, embedding: number[], userId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("worship_face_references")
    .select("id, embedding, created_at")
    .eq("tag_key", tagKey)
    .order("created_at", { ascending: true });
  if (error) throw new Error(friendlyFaceError(error, "Unable to remember that face.") || "Unable to remember that face.");

  const existing = data ?? [];
  const match = bestFaceMatch(
    embedding,
    existing.flatMap((row) => {
      const saved = cleanEmbedding(row.embedding);
      return saved ? [{ tag, tagKey, embedding: saved }] : [];
    }),
    SAME_FACE_DISTANCE,
  );
  if (match) return;

  const extras = existing.length >= MAX_REFERENCES ? existing.slice(0, existing.length - MAX_REFERENCES + 1) : [];
  if (extras.length) {
    const { error: deleteError } = await supabase
      .from("worship_face_references")
      .delete()
      .in(
        "id",
        extras.map((row) => row.id),
      );
    if (deleteError) {
      throw new Error(friendlyFaceError(deleteError, "Unable to remember that face.") || "Unable to remember that face.");
    }
  }

  const { error: insertError } = await supabase.from("worship_face_references").insert({
    tag,
    tag_key: tagKey,
    dropbox_id: dropboxId,
    embedding,
    created_by: userId,
  });
  if (insertError) throw new Error(friendlyFaceError(insertError, "Unable to remember that face.") || "Unable to remember that face.");
}

export async function decideFaces(items: FaceDecision[], userId: string) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 80) {
    throw new Error("Choose a smaller group of faces.");
  }

  const supabase = createAdminClient();
  const ids = items.map((item) => Number(item.id)).filter((id) => Number.isInteger(id) && id > 0);
  const { data, error } = await supabase
    .from("worship_face_suggestions")
    .select("id, dropbox_id, path, status, suggested_tag, embedding")
    .in("id", ids);
  if (error) throw new Error(friendlyFaceError(error, "Unable to update those faces.") || "Unable to update those faces.");

  const byId = new Map((data ?? []).map((row) => [Number(row.id), row]));
  const done: number[] = [];
  const failed: { id: number; error: string }[] = [];

  for (const item of items) {
    const id = Number(item.id);
    const row = byId.get(id);
    if (!row || row.status !== "pending") {
      failed.push({ id, error: "That face is no longer waiting for approval." });
      continue;
    }

    if (item.action === "dismiss") {
      const { error: updateError } = await supabase.from("worship_face_suggestions").update({ status: "dismissed" }).eq("id", id);
      if (updateError) {
        failed.push({ id, error: friendlyFaceError(updateError, "Unable to skip that face.") || "Unable to skip that face." });
        continue;
      }
      done.push(id);
      continue;
    }

    if (item.action !== "approve") {
      failed.push({ id, error: "Choose approve or remove." });
      continue;
    }

    const normalized = normalizePersonTag(item.tag || row.suggested_tag || "");
    if (!normalized) {
      failed.push({ id, error: "Enter a person's name using letters, numbers, spaces, apostrophes, or hyphens." });
      continue;
    }

    try {
      const photo = await photoMetadata(row.path);
      const tags = await addPhotoTag(photo, normalized.tag, userId);
      const display = tags.find((tag) => tag.toLocaleLowerCase("en") === normalized.tagKey) ?? normalized.tag;
      const embedding = cleanEmbedding(row.embedding);
      if (embedding) await rememberFace(display, normalized.tagKey, photo.id, embedding, userId);
      const { error: updateError } = await supabase
        .from("worship_face_suggestions")
        .update({
          status: "approved",
          suggested_tag: display,
          suggested_tag_key: normalized.tagKey,
          dropbox_id: photo.id,
        })
        .eq("id", id);
      if (updateError) throw new Error(friendlyFaceError(updateError, "Unable to approve that face.") || "Unable to approve that face.");
      done.push(id);
    } catch (caught) {
      failed.push({ id, error: caught instanceof Error ? caught.message : "Unable to approve that face." });
    }
  }

  return { done, failed };
}
