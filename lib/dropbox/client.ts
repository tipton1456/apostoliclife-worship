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

async function accessToken() {
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

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Dropbox sign-in failed.");
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
      throw new Error(`Dropbox request failed (${response.status}).`);
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

function collectEntries(entries: DropboxEntry[]) {
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
    } else if (entry[".tag"] === "file" && entry.id && isGalleryImage(entry.name)) {
      images.push({
        id: entry.id,
        name: entry.name,
        path,
        size: entry.size ?? 0,
        modified: entry.client_modified ?? entry.server_modified ?? null,
      });
    }
  }

  return { folders, images };
}

export async function listPhotoFolder(relativePath: string) {
  const folderPath = resolvePhotoPath(relativePath);
  const token = await accessToken();
  const folders: GalleryFolder[] = [];
  const images: GalleryImage[] = [];
  let cursor: string | null = null;

  do {
    const listed: DropboxList = await listPhotoPage(token, folderPath, cursor);
    const page = collectEntries(listed.entries ?? []);
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
  if (!isGalleryImage(relativePath)) throw new Error("That file is not a photo.");

  const token = await accessToken();
  let file = await fetchPhotoMetadata(token, relativePath);
  if (file.media_info?.[".tag"] === "pending") {
    await sleep(500);
    file = await fetchPhotoMetadata(token, relativePath);
  }

  return photoDetailsFromFile(file);
}

export async function photoThumbnail(relativePath: string) {
  const token = await accessToken();
  const response = await fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({
        resource: { ".tag": "path", path: resolvePhotoPath(relativePath) },
        format: "jpeg",
        size: "w256h256",
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

export async function photoUploadLink(folder: string, filename: string) {
  const name = safePhotoName(filename);
  if (!isGalleryImage(name)) {
    throw new Error("Upload a JPG, PNG, TIFF, GIF, WebP, or BMP file.");
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
