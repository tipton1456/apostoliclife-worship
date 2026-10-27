"use client";

import { useCallback, useEffect, useState } from "react";

type GalleryFolder = { name: string; path: string };
type GalleryImage = { name: string; path: string; size: number };

type FolderListing = {
  path: string;
  parent: string | null;
  folders: GalleryFolder[];
  images: GalleryImage[];
};

export default function PhotosView() {
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState("");
  const [selected, setSelected] = useState<GalleryImage | null>(null);
  const [fullUrl, setFullUrl] = useState("");

  const load = useCallback(async (nextPath: string) => {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/photos?path=${encodeURIComponent(nextPath)}`, {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as (FolderListing & { error?: string }) | null;
    setLoading(false);

    if (!response.ok || !body || body.error) {
      setListing(null);
      setError(body?.error || "Unable to load this folder.");
      return;
    }

    setPath(body.path);
    setListing(body);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openPhoto(image: GalleryImage) {
    setSelected(image);
    setFullUrl("");
    const response = await fetch(`/api/photos/link?path=${encodeURIComponent(image.path)}`, {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response.ok || !body?.url) {
      setError(body?.error || "Unable to open that photo.");
      setSelected(null);
      return;
    }
    setFullUrl(body.url);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");

    for (const file of Array.from(files)) {
      setUploading(file.name);
      const linkResponse = await fetch("/api/photos/upload-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: path, name: file.name }),
      });
      const linkBody = (await linkResponse.json().catch(() => null)) as { link?: string; error?: string } | null;

      if (!linkResponse.ok || !linkBody?.link) {
        setError(linkBody?.error || `Unable to upload ${file.name}.`);
        setUploading("");
        return;
      }

      const uploadResponse = await fetch(linkBody.link, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });

      if (!uploadResponse.ok) {
        setError(`Dropbox did not accept ${file.name}.`);
        setUploading("");
        return;
      }
    }

    setUploading("");
    await load(path);
  }

  const crumbs = path ? path.split("/") : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-neutral-400" aria-label="Folders">
          <button type="button" className="font-semibold text-[#b6e36a]" onClick={() => void load("")}>
            Photos
          </button>
          {crumbs.map((crumb, index) => {
            const crumbPath = crumbs.slice(0, index + 1).join("/");
            return (
              <span key={crumbPath} className="flex items-center gap-2">
                <span>/</span>
                <button type="button" className="hover:text-white" onClick={() => void load(crumbPath)}>
                  {crumb}
                </button>
              </span>
            );
          })}
        </nav>
        <label className="cursor-pointer rounded-xl bg-[#7bbc07] px-4 py-2 text-sm font-semibold text-neutral-950">
          {uploading ? `Uploading ${uploading}` : "Upload photos"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/tiff,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.tif,.tiff,.gif,.webp,.bmp"
            multiple
            className="hidden"
            disabled={Boolean(uploading)}
            onChange={(event) => {
              void uploadFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {loading ? <p className="mt-8 text-neutral-400">Loading photos…</p> : null}

      {!loading && listing && listing.folders.length === 0 && listing.images.length === 0 ? (
        <p className="mt-8 text-neutral-400">This folder is empty. Upload photos or add them in Dropbox.</p>
      ) : null}

      {listing && listing.folders.length > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listing.folders.map((folder) => (
            <button
              key={folder.path}
              type="button"
              onClick={() => void load(folder.path)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left hover:border-[#7bbc07]/50"
            >
              <span className="block text-xs uppercase tracking-[0.16em] text-[#7bbc07]">Folder</span>
              <span className="mt-1 block font-semibold">{folder.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {listing && listing.images.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listing.images.map((image) => (
            <button
              key={image.path}
              type="button"
              onClick={() => void openPhoto(image)}
              className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 text-left"
            >
              {/* Thumbnails come from the signed-in photo API, not a static file. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/thumbnail?path=${encodeURIComponent(image.path)}`}
                alt={image.name}
                className="aspect-square w-full object-cover"
              />
              <span className="block truncate px-3 py-2 text-xs text-neutral-300">{image.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" role="dialog">
          <button
            type="button"
            className="absolute right-4 top-4 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold"
            onClick={() => {
              setSelected(null);
              setFullUrl("");
            }}
          >
            Close
          </button>
          <div className="max-h-full max-w-6xl">
            {fullUrl ? (
              // Full photo is a short-lived Dropbox link.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fullUrl} alt={selected.name} className="max-h-[85vh] max-w-full rounded-xl" />
            ) : (
              <p className="text-neutral-300">Opening {selected.name}…</p>
            )}
            <p className="mt-3 text-center text-sm text-neutral-300">{selected.name}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
