const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "tif", "tiff", "gif", "webp", "bmp"]);

type DropboxEntry = {
  ".tag": "file" | "folder" | "deleted";
  name: string;
  path_display?: string;
  path_lower?: string;
  size?: number;
};

export type GalleryFolder = { name: string; path: string };
export type GalleryImage = { name: string; path: string; size: number };

export function photoRoot() {
  const root = process.env.DROPBOX_PHOTO_ROOT?.trim() || "";
  if (!root.startsWith("/")) {
    throw new Error("Dropbox photo folder is not configured.");
  }
  return root.replace(/\/$/, "");
}

export function isGalleryImage(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(extension);
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

async function dropboxJson<T>(url: string, payload: unknown, token: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Dropbox request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

type DropboxList = {
  entries: DropboxEntry[];
  cursor?: string;
  has_more?: boolean;
};

async function listPhotoPage(token: string, folderPath: string, cursor: string | null) {
  if (cursor) {
    return dropboxJson<DropboxList>(
      "https://api.dropboxapi.com/2/files/list_folder/continue",
      { cursor },
      token,
    );
  }

  return dropboxJson<DropboxList>(
    "https://api.dropboxapi.com/2/files/list_folder",
    { path: folderPath, limit: 200 },
    token,
  );
}

export async function listPhotoFolder(relativePath: string) {
  const folderPath = resolvePhotoPath(relativePath);
  const token = await accessToken();
  const folders: GalleryFolder[] = [];
  const images: GalleryImage[] = [];
  let cursor: string | null = null;

  do {
    const listed: DropboxList = await listPhotoPage(token, folderPath, cursor);

    for (const entry of listed.entries ?? []) {
      if (!entry.path_display || entry[".tag"] === "deleted") continue;
      const path = relativePhotoPath(entry.path_display);
      if (entry[".tag"] === "folder") {
        folders.push({ name: entry.name, path });
      } else if (entry[".tag"] === "file" && isGalleryImage(entry.name)) {
        images.push({ name: entry.name, path, size: entry.size ?? 0 });
      }
    }

    cursor = listed.has_more ? listed.cursor ?? null : null;
  } while (cursor);

  folders.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  images.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const current = relativePhotoPath(folderPath);
  const parent = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : current ? "" : null;

  return { path: current, parent, folders, images };
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
