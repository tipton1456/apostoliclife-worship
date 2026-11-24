import { extractLargestJpeg } from "@/lib/photos/raw-jpeg";
import type { GalleryImage, PhotoDetails } from "@/lib/photos/types";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "tif", "tiff", "gif", "webp", "bmp"]);
const RAW_EXTENSIONS = new Set(["cr2", "cr3", "nef", "nrw", "arw", "dng", "raf", "orf", "rw2", "raw", "pef", "srw", "heic", "heif"]);

type DropboxMedia = {
  ".tag"?: "metadata" | "pending";
  metadata?: {
    ".tag"?: string;
    dimensions?: { width?: number; height?: number };
    time_taken?: string;
    location?: { latitude?: number; longitude?: number };
  };
};

type DropboxEntry = {
  ".tag": "file" | "folder" | "deleted";
  name: string;
  id?: string;
  path_display?: string;
  path_lower?: string;
  size?: number;
  client_modified?: string;
  server_modified?: string;
  media_info?: DropboxMedia;
};

export type GalleryFolder = { name: string; path: string };
export type { GalleryImage };

export function photoRoot() {
  const root = process.env.DROPBOX_PHOTO_ROOT?.trim() || "";
  if (!root.startsWith("/")) {
    throw new Error("Dropbox photo folder is not configured.");
  }
  return root.replace(/\/$/, "");
}

function fileExtension(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return extension === name.toLowerCase() ? "" : extension;
}

export function isGalleryImage(name: string) {
  return IMAGE_EXTENSIONS.has(fileExtension(name));
}

export function isRawPhoto(name: string) {
  return RAW_EXTENSIONS.has(fileExtension(name));
}

export function isPhotoFile(name: string) {
  const extension = fileExtension(name);
  return IMAGE_EXTENSIONS.has(extension) || RAW_EXTENSIONS.has(extension);
}

export function safePhotoName(name: string) {
  const base = name.split(/[/\\]/).pop()?.trim() || "photo.jpg";
  const cleaned = base.replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/g, "");
  return cleaned || "photo.jpg";
}

export function resolvePhotoPath(relativePath: string) {
  const root = photoRoot();
  const parts = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");
  return parts.length ? `${root}/${parts.join("/")}` : root;
}

export function relativePhotoPath(fullPath: string) {
  const root = photoRoot();
  const full = fullPath.replace(/\/$/, "");
  const prefix = `${root}/`;

  if (full.toLowerCase() === root.toLowerCase()) return "";
  if (full.toLowerCase().startsWith(prefix.toLowerCase())) return full.slice(prefix.length);
  throw new Error("That folder is outside the photo library.");
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  const refresh = process.env.DROPBOX_REFRESH_TOKEN;

  if (!key || !secret || !refresh) {
    throw new Error("Dropbox is not configured on this server.");
  }

  const response = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Dropbox sign-in failed.");
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Dropbox sign-in failed.");
  const expiresIn = Number.isFinite(body.expires_in) ? Math.max(body.expires_in ?? 0, 60) : 14_400;
  cachedToken = { value: body.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return body.access_token;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dropboxJson<T>(url: string, payload: unknown, token: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after") || "2");
      const seconds = Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter, 1), 20) : 2;
      await sleep(seconds * 1000);
      continue;
    }

    if (!response.ok) {
      const details = (await response.json().catch(() => null)) as { error_summary?: string } | null;
      const summary = details?.error_summary?.split("/")[0];
      throw new Error(summary ? `Dropbox request failed (${summary}).` : `Dropbox request failed (${response.status}).`);
    }

    return (await response.json()) as T;
  }

  throw new Error("Dropbox request failed (429).");
}

type DropboxList = {
  entries: DropboxEntry[];
  cursor?: string;
  has_more?: boolean;
};

async function listPhotoPage(
  token: string,
  folderPath: string,
  cursor: string | null,
  options?: { recursive?: boolean; limit?: number },
) {
  if (cursor) {
    return dropboxJson<DropboxList>(
      "https://api.dropboxapi.com/2/files/list_folder/continue",
      { cursor },
      token,
    );
  }

  return dropboxJson<DropboxList>(
    "https://api.dropboxapi.com/2/files/list_folder",
    {
      path: folderPath,
      limit: options?.limit ?? 200,
      recursive: options?.recursive ?? false,
    },
    token,
  );
}

function collectEntries(entries: DropboxEntry[], includeRaw = false) {
  const folders: GalleryFolder[] = [];
  const images: GalleryImage[] = [];

  for (const entry of entries) {
    if (!entry.path_display || entry[".tag"] === "deleted") continue;
    let path = "";
    try {
      path = relativePhotoPath(entry.path_display);
    } catch {
      continue;
    }
    if (entry[".tag"] === "folder") {
      folders.push({ name: entry.name, path });
    } else if (entry[".tag"] === "file" && entry.id) {
      const raw = isRawPhoto(entry.name);
      if (!isGalleryImage(entry.name) && !(includeRaw && raw)) continue;
      images.push({
        id: entry.id,
        name: entry.name,
        path,
        size: entry.size ?? 0,
        modified: entry.client_modified ?? entry.server_modified ?? null,
        ...(raw ? { raw: true } : {}),
      });
    }
  }

  return { folders, images };
}

export async function listGallerySubtree(relativePath: string) {
  const folderPath = resolvePhotoPath(relativePath);
  const token = await accessToken();
  const images: GalleryImage[] = [];
  let cursor: string | null = null;

  do {
    const listed: DropboxList = await listPhotoPage(token, folderPath, cursor, { recursive: true, limit: 2000 });
    images.push(...collectEntries(listed.entries ?? []).images);
    cursor = listed.has_more ? listed.cursor ?? null : null;
  } while (cursor);

  images.sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "base" }));
  return images;
}

export async function listPhotoFolder(relativePath: string) {
  const folderPath = resolvePhotoPath(relativePath);
  const token = await accessToken();
  const folders: GalleryFolder[] = [];
  const images: GalleryImage[] = [];
  let cursor: string | null = null;

  do {
    const listed: DropboxList = await listPhotoPage(token, folderPath, cursor);
    const page = collectEntries(listed.entries ?? [], true);
    folders.push(...page.folders);
    images.push(...page.images);
    cursor = listed.has_more ? listed.cursor ?? null : null;
  } while (cursor);

  folders.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  images.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const current = relativePhotoPath(folderPath);
  const parent = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : current ? "" : null;

  return { path: current, parent, folders, images };
}

export async function listPhotoLibrary() {
  const folderPath = photoRoot();
  const token = await accessToken();
  const folders: GalleryFolder[] = [];
  const images: { path: string; size: number; photo: boolean }[] = [];
  let cursor: string | null = null;

  do {
    const listed: DropboxList = await listPhotoPage(token, folderPath, cursor, { recursive: true, limit: 2000 });

    for (const entry of listed.entries ?? []) {
      if (!entry.path_display || entry[".tag"] === "deleted") continue;
      let path = "";
      try {
        path = relativePhotoPath(entry.path_display);
      } catch {
        continue;
      }
      if (entry[".tag"] === "folder") folders.push({ name: entry.name, path });
      else if (entry[".tag"] === "file") {
        images.push({ path, size: entry.size ?? 0, photo: isPhotoFile(entry.name) });
      }
    }

    cursor = listed.has_more ? listed.cursor ?? null : null;
  } while (cursor);

  return { folders, images };
}

function photoDetailsFromFile(file: DropboxEntry): PhotoDetails {
  if (!file.id || !file.path_display) throw new Error("Unable to read that photo.");
  const path = relativePhotoPath(file.path_display);
  const media = file.media_info?.[".tag"] === "metadata" ? file.media_info.metadata : undefined;

  return {
    id: file.id,
    name: file.name,
    path,
    folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
    size: file.size ?? 0,
    modified: file.client_modified ?? null,
    savedAt: file.server_modified ?? null,
    taken: media?.time_taken ?? null,
    width: media?.dimensions?.width ?? null,
    height: media?.dimensions?.height ?? null,
    latitude: media?.location?.latitude ?? null,
    longitude: media?.location?.longitude ?? null,
  };
}

async function fetchPhotoMetadata(token: string, relativePath: string) {
  return dropboxJson<DropboxEntry>(
    "https://api.dropboxapi.com/2/files/get_metadata",
    { path: resolvePhotoPath(relativePath), include_media_info: true },
    token,
  );
}

export async function photoMetadata(relativePath: string) {
  if (!isPhotoFile(relativePath)) throw new Error("That file is not a photo.");

  const token = await accessToken();
  let file = await fetchPhotoMetadata(token, relativePath);
  if (file.media_info?.[".tag"] === "pending") {
    await sleep(500);
    file = await fetchPhotoMetadata(token, relativePath);
  }

  return photoDetailsFromFile(file);
}

async function dropboxThumbnail(relativePath: string, size: "w256h256" | "w640h480" | "w2048h1536") {
  const token = await accessToken();
  const response = await fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({
        resource: { ".tag": "path", path: resolvePhotoPath(relativePath) },
        format: "jpeg",
        size,
        mode: "bestfit",
      }),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Thumbnail is not available.");
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function photoThumbnail(relativePath: string) {
  return dropboxThumbnail(relativePath, "w256h256");
}

export async function photoReviewImage(relativePath: string) {
  return dropboxThumbnail(relativePath, "w640h480");
}

export async function photoPreview(relativePath: string) {
  if (!isPhotoFile(relativePath)) throw new Error("That file is not a photo.");
  return dropboxThumbnail(relativePath, "w2048h1536");
}

export async function photoTemporaryLink(relativePath: string) {
  const token = await accessToken();
  const result = await dropboxJson<{ link?: string }>(
    "https://api.dropboxapi.com/2/files/get_temporary_link",
    { path: resolvePhotoPath(relativePath) },
    token,
  );

  if (!result.link) throw new Error("Unable to open that photo.");
  return result.link;
}

function isUploadablePhoto(name: string) {
  const extension = fileExtension(name);
  return isGalleryImage(name) || extension === "heic" || extension === "heif";
}

export function safeFolderName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[\\/]+/g, " ")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new Error("Enter a folder name.");
  }
  return cleaned;
}

export async function createPhotoFolder(parent: string, name: string) {
  const folderName = safeFolderName(name);
  const relative = parent ? `${parent}/${folderName}` : folderName;
  const fullPath = resolvePhotoPath(relative);
  const token = await accessToken();

  try {
    await dropboxJson("https://api.dropboxapi.com/2/files/create_folder_v2", { path: fullPath, autorename: false }, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("(path)")) throw error;
  }

  const meta = await dropboxJson<DropboxEntry>("https://api.dropboxapi.com/2/files/get_metadata", { path: fullPath }, token);
  if (meta[".tag"] !== "folder") throw new Error("A file with that name already exists.");
  return relative;
}

export async function ensurePhotoFolder(relativePath: string) {
  const parts = relativePath
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");
  let parent = "";
  for (const part of parts) parent = await createPhotoFolder(parent, part);
  return parent;
}

export async function photoUploadLink(folder: string, filename: string) {
  const name = safePhotoName(filename);
  if (!isUploadablePhoto(name)) {
    throw new Error("Upload a JPG, PNG, TIFF, GIF, WebP, BMP, or HEIC photo.");
  }

  const token = await accessToken();
  const result = await dropboxJson<{ link?: string }>(
    "https://api.dropboxapi.com/2/files/get_temporary_upload_link",
    {
      commit_info: {
        path: resolvePhotoPath(folder ? `${folder}/${name}` : name),
        mode: "add",
        autorename: true,
        mute: true,
      },
      duration: 3600,
    },
    token,
  );

  if (!result.link) throw new Error("Unable to start the upload.");
  return { link: result.link, name };
}

export async function photoOverwriteUploadLink(relativePath: string) {
  const name = safePhotoName(relativePath.split("/").pop() || "photo.jpg");
  if (!isUploadablePhoto(name)) {
    throw new Error("Upload a JPG, PNG, TIFF, GIF, WebP, BMP, or HEIC photo.");
  }

  const path = relativePhotoPath(resolvePhotoPath(relativePath));
  const token = await accessToken();
  const result = await dropboxJson<{ link?: string }>(
    "https://api.dropboxapi.com/2/files/get_temporary_upload_link",
    {
      commit_info: {
        path: resolvePhotoPath(path),
        mode: "overwrite",
        autorename: false,
        mute: true,
      },
      duration: 3600,
    },
    token,
  );

  if (!result.link) throw new Error("Unable to start the upload.");
  return { link: result.link, path, name };
}

const MAX_RAW_BYTES = 180 * 1024 * 1024;

function parentFolder(relativePath: string) {
  const slash = relativePath.lastIndexOf("/");
  return slash === -1 ? "" : relativePath.slice(0, slash);
}

export function photoPaths(input: unknown, limit = 100) {
  if (!Array.isArray(input)) return [];
  const paths: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const path = value.trim();
    if (!path || path.length > 500 || paths.includes(path)) continue;
    paths.push(path);
    if (paths.length >= limit) break;
  }
  return paths;
}

async function findPhotos(relativePaths: string[]) {
  const grouped = new Map<string, string[]>();
  for (const path of relativePaths) {
    if (!isPhotoFile(path)) continue;
    const folder = parentFolder(path);
    const list = grouped.get(folder) ?? [];
    list.push(path);
    grouped.set(folder, list);
  }

  const found = new Map<string, GalleryImage>();
  for (const folder of grouped.keys()) {
    const listed = await listPhotoFolder(folder);
    for (const image of listed.images) found.set(image.path, image);
  }

  return relativePaths.map((path) => found.get(path) ?? null);
}

async function downloadDropboxBytes(token: string, fileId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({ path: fileId }),
      },
      cache: "no-store",
    });

    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after") || "2");
      const seconds = Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter, 1), 20) : 2;
      await sleep(seconds * 1000);
      continue;
    }

    if (!response.ok) throw new Error("Unable to read that file from Dropbox.");
    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error("Unable to read that file from Dropbox.");
}

export async function downloadPhotoFile(relativePath: string) {
  const token = await accessToken();
  return downloadDropboxBytes(token, resolvePhotoPath(relativePath));
}

export async function uploadGalleryBytes(folder: string, filename: string, bytes: Buffer) {
  const { link, name } = await photoUploadLink(folder, filename);
  const response = await fetch(link, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(bytes),
  });

  if (!response.ok) throw new Error("Dropbox did not accept the JPG.");
  const file = (await response.json().catch(() => null)) as DropboxEntry | null;
  if (!file?.path_display || !file.id) throw new Error("Dropbox did not accept the JPG.");
  return {
    id: file.id,
    name: file.name || name,
    path: relativePhotoPath(file.path_display),
    size: file.size ?? bytes.length,
    modified: file.client_modified ?? file.server_modified ?? null,
  } satisfies GalleryImage;
}

export async function deletePhotos(relativePaths: string[]) {
  const images = await findPhotos(relativePaths);
  const token = await accessToken();
  const removed: GalleryImage[] = [];
  const failed: { name: string; error: string }[] = [];

  for (let index = 0; index < relativePaths.length; index += 1) {
    const image = images[index];
    const label = image?.name || relativePaths[index]?.split("/").pop() || "photo";
    if (!image) {
      failed.push({ name: label, error: "That photo is no longer in this folder." });
      continue;
    }

    try {
      await dropboxJson("https://api.dropboxapi.com/2/files/delete_v2", { path: image.id }, token);
      removed.push(image);
    } catch (error) {
      failed.push({ name: image.name, error: error instanceof Error ? error.message : "Unable to delete that photo." });
    }
  }

  return { removed, failed };
}

export async function movePhotos(relativePaths: string[], destinationFolder: string) {
  const destination = relativePhotoPath(resolvePhotoPath(destinationFolder));
  const images = await findPhotos(relativePaths);
  const token = await accessToken();
  const moved: { from: GalleryImage; to: GalleryImage }[] = [];
  const failed: { name: string; error: string }[] = [];

  for (let index = 0; index < relativePaths.length; index += 1) {
    const image = images[index];
    const label = image?.name || relativePaths[index]?.split("/").pop() || "photo";
    if (!image) {
      failed.push({ name: label, error: "That photo is no longer in this folder." });
      continue;
    }
    if (parentFolder(image.path) === destination) {
      failed.push({ name: image.name, error: "That photo is already in the chosen folder." });
      continue;
    }

    try {
      const result = await dropboxJson<{ metadata?: DropboxEntry }>(
        "https://api.dropboxapi.com/2/files/move_v2",
        {
          from_path: image.id,
          to_path: resolvePhotoPath(destination ? `${destination}/${image.name}` : image.name),
          autorename: true,
        },
        token,
      );
      const file = result.metadata;
      if (!file?.id || !file.path_display) throw new Error("Dropbox did not move that photo.");
      moved.push({
        from: image,
        to: {
          id: file.id,
          name: file.name,
          path: relativePhotoPath(file.path_display),
          size: file.size ?? image.size,
          modified: file.client_modified ?? file.server_modified ?? image.modified,
          ...(image.raw ? { raw: true } : {}),
        },
      });
    } catch (error) {
      failed.push({ name: image.name, error: error instanceof Error ? error.message : "Unable to move that photo." });
    }
  }

  return { destination, moved, failed };
}

export async function downloadPhotos(relativePaths: string[], maxBytes: number) {
  const images = await findPhotos(relativePaths);
  const found = images.filter((image): image is GalleryImage => image !== null);
  const missing = relativePaths.filter((_, index) => !images[index]);
  const total = found.reduce((sum, image) => sum + image.size, 0);
  if (missing.length) throw new Error("One of the selected photos is no longer in this folder.");
  if (!found.length) throw new Error("Choose at least one photo.");
  if (total > maxBytes) throw new Error("Select fewer files. Downloads are limited to 150 MB at a time.");

  const token = await accessToken();
  const files: { name: string; data: Buffer }[] = [];
  for (const image of found) {
    files.push({ name: image.name, data: await downloadDropboxBytes(token, image.id) });
  }
  return files;
}

export async function convertRawPhoto(relativePath: string) {
  if (!isRawPhoto(relativePath)) throw new Error("That file is not a RAW photo.");

  const token = await accessToken();
  const meta = await fetchPhotoMetadata(token, relativePath);
  if (!meta.id || !meta.path_display) throw new Error("Unable to read that RAW file.");
  if ((meta.size ?? 0) > MAX_RAW_BYTES) throw new Error("That RAW file is too large to convert here.");

  // One file at a time. The camera JPEG inside the RAW is saved back into the same Dropbox folder.
  const raw = await downloadDropboxBytes(token, meta.id);
  let jpeg = extractLargestJpeg(raw);
  if (!jpeg || jpeg.length < 80_000) {
    try {
      const preview = await dropboxThumbnail(relativePath, "w2048h1536");
      if (!jpeg || preview.length > jpeg.length) jpeg = preview;
    } catch {
      if (!jpeg) throw new Error("No JPG preview was found in that RAW file.");
    }
  }
  if (!jpeg) throw new Error("No JPG preview was found in that RAW file.");

  const folder = parentFolder(relativePhotoPath(meta.path_display));
  const base = meta.name.replace(/\.[^.]+$/, "") || "photo";
  return uploadGalleryBytes(folder, `${base}.jpg`, jpeg);
}
