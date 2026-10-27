"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PhotoDetail from "@/app/photos/photo-detail";
import PhotoTree, { type PhotoBrowserMode } from "@/app/photos/photo-tree";

const FaceReview = dynamic(() => import("@/app/photos/face-review"), {
  ssr: false,
  loading: () => <p className="mt-8 text-neutral-400">Loading face recognition…</p>,
});
import { formatBytes, formatPhotoCount } from "@/lib/photos/format";
import { buildFolderTree, bumpFolderStats, findFolder } from "@/lib/photos/folder-tree";
import type { FolderStat, GalleryImage, PersonSummary, PhotoDetails } from "@/lib/photos/types";

function galleryTitle(mode: PhotoBrowserMode, rootName: string) {
  if (mode.type === "person") return mode.tag;
  if (!mode.path) return rootName;
  return mode.path.slice(mode.path.lastIndexOf("/") + 1);
}

export default function PhotosView() {
  const [stats, setStats] = useState<FolderStat[]>([]);
  const [rootName, setRootName] = useState("Photos");
  const [indexedAt, setIndexedAt] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "": true });
  const [mode, setMode] = useState<PhotoBrowserMode>({ type: "folder", path: "" });
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState("");
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [peopleError, setPeopleError] = useState("");
  const [uploading, setUploading] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PhotoDetails | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);
  const galleryRequest = useRef(0);
  const detailRequest = useRef(0);
  const treeRequest = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const root = useMemo(() => buildFolderTree(stats), [stats]);
  const selectedFolder = mode.type === "folder" ? findFolder(root, mode.path) : null;

  const refreshTree = useCallback(async (refresh: boolean) => {
    const requestId = ++treeRequest.current;
    setTreeLoading(true);
    setTreeError("");
    const response = await fetch(`/api/photos/tree${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | { rootName?: string; indexedAt?: string; folders?: FolderStat[]; error?: string }
      | null;
    if (requestId !== treeRequest.current) return;
    setTreeLoading(false);

    if (!response.ok || !body || body.error) {
      setTreeError(body?.error || "Unable to load folders.");
      return;
    }

    setStats(body.folders ?? []);
    setRootName(body.rootName || "Photos");
    setIndexedAt(body.indexedAt ?? null);
  }, []);

  const loadPeople = useCallback(async () => {
    const response = await fetch("/api/photos/tags", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { people?: PersonSummary[]; error?: string } | null;
    if (!response.ok || !body || body.error) {
      setPeopleError(body?.error || "Unable to load people.");
      return;
    }
    setPeopleError("");
    setPeople(body.people ?? []);
  }, []);

  const selectFolder = useCallback(async (path: string) => {
    const requestId = ++galleryRequest.current;
    setFaceOpen(false);
    setMode({ type: "folder", path });
    setExpanded((current) => ({ ...current, [path]: true }));
    setGalleryLoading(true);
    setGalleryError("");
    const response = await fetch(`/api/photos?path=${encodeURIComponent(path)}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { images?: GalleryImage[]; error?: string } | null;
    if (requestId !== galleryRequest.current) return;
    setGalleryLoading(false);

    if (!response.ok || !body || body.error) {
      setImages([]);
      setGalleryError(body?.error || "Unable to load this folder.");
      return;
    }

    setImages(body.images ?? []);
  }, []);

  const selectPerson = useCallback(async (tag: string) => {
    const requestId = ++galleryRequest.current;
    setFaceOpen(false);
    setMode({ type: "person", tag });
    setGalleryLoading(true);
    setGalleryError("");
    const response = await fetch(`/api/photos/tags?person=${encodeURIComponent(tag)}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { tag?: string; images?: GalleryImage[]; error?: string } | null;
    if (requestId !== galleryRequest.current) return;
    setGalleryLoading(false);

    if (!response.ok || !body || body.error) {
      setImages([]);
      setGalleryError(body?.error || "Unable to load photos for that person.");
      return;
    }

    if (body.tag) setMode({ type: "person", tag: body.tag });
    setImages(body.images ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshTree(false);
      void selectFolder("");
      void loadPeople();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPeople, refreshTree, selectFolder]);

  useEffect(() => {
    if (!selectedId) return;
    if (images.some((image) => image.id === selectedId)) return;
    detailRequest.current += 1;
    setDetailOpen(false);
    setSelectedId(null);
    setDetail(null);
  }, [images, selectedId]);

  const openPhoto = useCallback(async (image: GalleryImage) => {
    const requestId = ++detailRequest.current;
    setSelectedId(image.id);
    setDetailOpen(true);
    setDetail(null);
    setTags([]);
    setPreviewUrl("");
    setDetailError("");
    setDetailLoading(true);

    const [metaResponse, linkResponse] = await Promise.all([
      fetch(`/api/photos/meta?path=${encodeURIComponent(image.path)}`, { cache: "no-store" }),
      fetch(`/api/photos/link?path=${encodeURIComponent(image.path)}`, { cache: "no-store" }),
    ]);
    const metaBody = (await metaResponse.json().catch(() => null)) as
      | { photo?: PhotoDetails; tags?: string[]; error?: string }
      | null;
    const linkBody = (await linkResponse.json().catch(() => null)) as { url?: string } | null;
    if (requestId !== detailRequest.current) return;

    setDetailLoading(false);
    if (!metaResponse.ok || !metaBody?.photo) {
      setDetailError(metaBody?.error || "Unable to read that photo.");
      return;
    }

    setDetail(metaBody.photo);
    setTags(metaBody.tags ?? []);
    if (linkBody?.url) setPreviewUrl(linkBody.url);
  }, []);

  function closeDetail() {
    detailRequest.current += 1;
    setDetailOpen(false);
    setSelectedId(null);
    setDetail(null);
    setPreviewUrl("");
  }

  async function addTag(tag: string) {
    if (!detail) return false;
    setSavingTag(true);
    setDetailError("");
    const response = await fetch("/api/photos/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: detail.path, tag }),
    });
    const body = (await response.json().catch(() => null)) as { tags?: string[]; error?: string } | null;
    setSavingTag(false);

    if (!response.ok || !body || body.error) {
      setDetailError(body?.error || "Unable to add that person.");
      return false;
    }

    setTags(body.tags ?? []);
    await loadPeople();
    if (modeRef.current.type === "person") await selectPerson(modeRef.current.tag);
    return true;
  }

  async function removeTag(tag: string) {
    if (!detail) return;
    setSavingTag(true);
    setDetailError("");
    const response = await fetch("/api/photos/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropboxId: detail.id, tag }),
    });
    const body = (await response.json().catch(() => null)) as { tags?: string[]; error?: string } | null;
    setSavingTag(false);

    if (!response.ok || !body || body.error) {
      setDetailError(body?.error || "Unable to remove that person.");
      return;
    }

    setTags(body.tags ?? []);
    await loadPeople();
    if (modeRef.current.type === "person") await selectPerson(modeRef.current.tag);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || mode.type !== "folder") return;
    const folder = mode.path;
    setGalleryError("");
    let added = 0;
    let addedBytes = 0;

    for (const file of Array.from(files)) {
      setUploading(file.name);
      const linkResponse = await fetch("/api/photos/upload-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, name: file.name }),
      });
      const linkBody = (await linkResponse.json().catch(() => null)) as { link?: string; error?: string } | null;

      if (!linkResponse.ok || !linkBody?.link) {
        setGalleryError(linkBody?.error || `Unable to upload ${file.name}.`);
        setUploading("");
        break;
      }

      const uploadResponse = await fetch(linkBody.link, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });

      if (!uploadResponse.ok) {
        setGalleryError(`Dropbox did not accept ${file.name}.`);
        setUploading("");
        break;
      }

      added += 1;
      addedBytes += file.size;
    }

    setUploading("");
    if (added > 0) {
      setStats((current) => bumpFolderStats(current, folder, added, addedBytes));
      const saved = await fetch("/api/photos/tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, count: added, sizeBytes: addedBytes }),
      });
      const savedBody = (await saved.json().catch(() => null)) as { updated?: boolean } | null;
      if (!saved.ok || savedBody?.updated === false) void refreshTree(true);
    }
    await selectFolder(folder);
  }

  const person = mode.type === "person" ? people.find((item) => item.tag === mode.tag) : null;
  const subtitle =
    mode.type === "person"
      ? person
        ? `${formatPhotoCount(person.count)} · ${formatBytes(person.sizeBytes)}`
        : formatPhotoCount(images.length)
      : selectedFolder && selectedFolder.photoCount !== images.length
        ? `${formatPhotoCount(images.length)} in this folder · ${formatPhotoCount(selectedFolder.photoCount)} · ${formatBytes(selectedFolder.sizeBytes)} with subfolders`
        : `${formatPhotoCount(selectedFolder?.photoCount ?? images.length)} · ${formatBytes(selectedFolder?.sizeBytes ?? images.reduce((sum, image) => sum + image.size, 0))}`;

  const crumbs = mode.type === "folder" && mode.path ? mode.path.split("/") : [];

  return (
    <div className="relative flex min-h-0 flex-1 border-t border-white/10">
      <PhotoTree
        root={root}
        indexedAt={indexedAt}
        loading={treeLoading}
        mode={mode}
        expanded={expanded}
        people={people}
        peopleError={peopleError}
        error={treeError}
        onToggle={(path) => setExpanded((current) => ({ ...current, [path]: !current[path] }))}
        onSelectFolder={(path) => void selectFolder(path)}
        onSelectPerson={(tag) => void selectPerson(tag)}
        onRefresh={() => void refreshTree(true)}
      />

      <section className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6" aria-label="Photos">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {crumbs.length > 0 ? (
              <nav className="mb-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500" aria-label="Current folder">
                <button type="button" className="hover:text-white" onClick={() => void selectFolder("")}>
                  {rootName}
                </button>
                {crumbs.map((crumb, index) => {
                  const crumbPath = crumbs.slice(0, index + 1).join("/");
                  return (
                    <span key={crumbPath} className="flex items-center gap-2">
                      <span>/</span>
                      <button type="button" className="hover:text-white" onClick={() => void selectFolder(crumbPath)}>
                        {crumb}
                      </button>
                    </span>
                  );
                })}
              </nav>
            ) : null}
            <h2 className="truncate text-2xl font-bold">{galleryTitle(mode, rootName)}</h2>
            <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
          </div>
          {mode.type === "folder" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
                onClick={() => setFaceOpen((open) => !open)}
              >
                {faceOpen ? "Close faces" : "Find faces"}
              </button>
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
          ) : (
            <p className="text-sm text-neutral-500">Photos tagged {mode.tag}</p>
          )}
        </div>

        {mode.type === "folder" && faceOpen ? (
          <FaceReview
            folder={mode.path}
            folderName={galleryTitle(mode, rootName)}
            people={people}
            onPeopleChange={() => void loadPeople()}
            onClose={() => setFaceOpen(false)}
          />
        ) : null}

        {galleryError ? <p className="mt-4 text-sm text-red-300">{galleryError}</p> : null}
        {!faceOpen && galleryLoading ? <p className="mt-8 text-neutral-400">Loading photos…</p> : null}

        {!faceOpen && !galleryLoading && images.length === 0 ? (
          <p className="mt-8 text-neutral-400">
            {mode.type === "person"
              ? "No photos are tagged with this person."
              : selectedFolder && selectedFolder.children.length > 0 && selectedFolder.photoCount === 0
                ? "No photo files are in this folder or its subfolders yet."
                : selectedFolder && selectedFolder.photoCount > images.length
                  ? "Open a subfolder to see more of these photos. The count includes subfolders."
                  : "This folder is empty. Upload photos or add them in Dropbox."}
          </p>
        ) : null}

        {!faceOpen && images.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {images.map((image) => {
              const selected = selectedId === image.id;
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => void openPhoto(image)}
                  className={`overflow-hidden rounded-2xl border bg-neutral-950 text-left ${
                    selected ? "border-[#7bbc07] ring-2 ring-[#7bbc07]" : "border-white/10"
                  }`}
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
              );
            })}
          </div>
        ) : null}
      </section>

      {detailOpen ? (
        <PhotoDetail
          key={selectedId || "detail"}
          photo={detail}
          tags={tags}
          people={people}
          previewUrl={previewUrl}
          rootName={rootName}
          loading={detailLoading}
          saving={savingTag}
          error={detailError}
          onClose={closeDetail}
          onAdd={addTag}
          onRemove={removeTag}
        />
      ) : null}
    </div>
  );
}
