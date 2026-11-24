"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PhotoDetail from "@/app/photos/photo-detail";
import PhotoManageDialog, { type ManageStep } from "@/app/photos/photo-manage";
import PhotoTree, { type PhotoBrowserMode } from "@/app/photos/photo-tree";

const FaceReview = dynamic(() => import("@/app/photos/face-review"), {
  ssr: false,
  loading: () => <p className="mt-8 text-neutral-400">Loading face recognition…</p>,
});
import { formatBytes, formatPhotoCount } from "@/lib/photos/format";
import { buildFolderTree, bumpFolderStats, findFolder } from "@/lib/photos/folder-tree";
import type { FolderStat, GalleryImage, PersonSummary, PhotoDetails } from "@/lib/photos/types";

function failureText(failed: { name: string; error: string }[]) {
  return failed
    .slice(0, 3)
    .map((item) => `${item.name}: ${item.error}`)
    .join(" ");
}

function FolderThumb({ path, raw }: { path: string; raw?: boolean }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative">
      {failed ? (
        <span className="flex aspect-square w-full items-center justify-center bg-neutral-900 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Raw
        </span>
      ) : (
        /* Thumbnails come from the signed-in photo API, not a static file. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`/api/photos/thumbnail?path=${encodeURIComponent(path)}`}
          alt=""
          className="aspect-square w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {raw ? (
        <span className="absolute bottom-2 left-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          RAW
        </span>
      ) : null}
    </div>
  );
}

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
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PhotoDetails | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [manageStep, setManageStep] = useState<ManageStep>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [convertScope, setConvertScope] = useState<"selection" | "folder">("folder");
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
    setManaging(false);
    setPickedIds([]);
    setManageStep(null);
    setNotice("");
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
    setManaging(false);
    setPickedIds([]);
    setManageStep(null);
    setNotice("");
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

  async function createFolder() {
    if (mode.type !== "folder" || creatingFolder) return;
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setGalleryError("");
    const response = await fetch("/api/photos/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent: mode.path, name }),
    });
    const body = (await response.json().catch(() => null)) as { path?: string; name?: string; parentPath?: string; error?: string } | null;
    setCreatingFolder(false);
    if (!response.ok || !body?.path || !body.name) {
      setGalleryError(body?.error || "Unable to create that folder.");
      return;
    }
    const created = body.path;
    setStats((current) =>
      current.some((item) => item.path === created)
        ? current
        : [...current, { path: created, name: body.name || name, parentPath: body.parentPath ?? "", photoCount: 0, sizeBytes: 0 }],
    );
    setNewFolderName("");
    setNewFolderOpen(false);
    setNotice(`Created ${body.name}.`);
    await selectFolder(created);
    void refreshTree(true);
  }

  const picked = new Set(pickedIds);
  const selectedImages = images.filter((image) => picked.has(image.id));
  const rawImages = images.filter((image) => image.raw);
  const selectedRaw = selectedImages.filter((image) => image.raw);
  const convertCount = (convertScope === "selection" ? selectedRaw : rawImages).length;

  async function adjustTotals(folder: string, count: number, sizeBytes: number) {
    if (!count && !sizeBytes) return;
    setStats((current) => bumpFolderStats(current, folder, count, sizeBytes));
    const saved = await fetch("/api/photos/tree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder, count, sizeBytes }),
    });
    const savedBody = (await saved.json().catch(() => null)) as { updated?: boolean } | null;
    if (!saved.ok || savedBody?.updated === false) void refreshTree(true);
  }

  function toggleManage() {
    if (busy) return;
    if (managing) {
      setManaging(false);
      setPickedIds([]);
      setManageStep(null);
      return;
    }
    setFaceOpen(false);
    closeDetail();
    setManaging(true);
  }

  function togglePicked(id: string) {
    setPickedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function deleteSelected() {
    if (mode.type !== "folder" || !selectedImages.length || busy) return;
    const folder = mode.path;
    const targets = selectedImages;
    setBusy("Deleting selected files…");
    setGalleryError("");
    setNotice("");
    const response = await fetch("/api/photos/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", paths: targets.map((image) => image.path) }),
    });
    const body = (await response.json().catch(() => null)) as {
      removed?: GalleryImage[];
      failed?: { name: string; error: string }[];
      error?: string;
    } | null;
    setBusy("");
    if (!response.ok || !body || body.error) {
      setGalleryError(body?.error || "Unable to delete those photos.");
      return;
    }
    const removed = body.removed ?? [];
    await adjustTotals(folder, -removed.length, -removed.reduce((sum, image) => sum + image.size, 0));
    setManageStep(null);
    await selectFolder(folder);
    const failed = failureText(body.failed ?? []);
    if (removed.length) setNotice(`Deleted ${removed.length} file${removed.length === 1 ? "" : "s"}.${failed ? ` ${failed}` : ""}`);
    else if (failed) setGalleryError(failed);
  }

  async function moveSelected(destination: string) {
    if (mode.type !== "folder" || !selectedImages.length || busy) return;
    const folder = mode.path;
    const targets = selectedImages;
    setBusy("Moving selected files…");
    setGalleryError("");
    setNotice("");
    const response = await fetch("/api/photos/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", paths: targets.map((image) => image.path), destination }),
    });
    const body = (await response.json().catch(() => null)) as {
      destination?: string;
      moved?: { from: GalleryImage }[];
      failed?: { name: string; error: string }[];
      error?: string;
    } | null;
    setBusy("");
    if (!response.ok || !body || body.error) {
      setGalleryError(body?.error || "Unable to move those photos.");
      return;
    }
    const moved = body.moved ?? [];
    const bytes = moved.reduce((sum, item) => sum + item.from.size, 0);
    await adjustTotals(folder, -moved.length, -bytes);
    await adjustTotals(body.destination ?? destination, moved.length, bytes);
    setManageStep(null);
    await selectFolder(folder);
    const failed = failureText(body.failed ?? []);
    if (moved.length) setNotice(`Moved ${moved.length} file${moved.length === 1 ? "" : "s"}.${failed ? ` ${failed}` : ""}`);
    else if (failed) setGalleryError(failed);
  }

  async function downloadSelected() {
    if (mode.type !== "folder" || !selectedImages.length || busy) return;
    const bytes = selectedImages.reduce((sum, image) => sum + image.size, 0);
    if (bytes > 150 * 1024 * 1024) {
      setGalleryError("Select fewer files. Downloads are limited to 150 MB at a time.");
      return;
    }
    const folder = mode.path;
    const count = selectedImages.length;
    setBusy("Preparing the download…");
    setGalleryError("");
    setNotice("");
    const response = await fetch("/api/photos/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: selectedImages.map((image) => image.path), folder }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setBusy("");
      setGalleryError(body?.error || "Unable to download those photos.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${folder.split("/").pop() || "photos"}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBusy("");
    setManageStep(null);
    setNotice(`Downloaded ${count} file${count === 1 ? "" : "s"}.`);
  }

  async function tagSelected(tags: string[]) {
    if (mode.type !== "folder" || !selectedImages.length || busy) return;
    setBusy("Tagging selected files…");
    setGalleryError("");
    setNotice("");
    const response = await fetch("/api/photos/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "tag", paths: selectedImages.map((image) => image.path), tags }),
    });
    const body = (await response.json().catch(() => null)) as {
      tagged?: number;
      failed?: { name: string; error: string }[];
      error?: string;
    } | null;
    setBusy("");
    if (!response.ok || !body || body.error) {
      setGalleryError(body?.error || "Unable to tag those photos.");
      return;
    }
    await loadPeople();
    setManageStep(null);
    const tagged = body.tagged ?? 0;
    const failed = failureText(body.failed ?? []);
    if (tagged) setNotice(`Tagged ${tagged} file${tagged === 1 ? "" : "s"}.${failed ? ` ${failed}` : ""}`);
    else if (failed) setGalleryError(failed);
  }

  async function convertRaw() {
    const targets = convertScope === "selection" ? selectedRaw : rawImages;
    if (mode.type !== "folder" || !targets.length || busy) return;
    const folder = mode.path;
    setGalleryError("");
    setNotice("");
    let added = 0;
    let addedBytes = 0;
    const errors: string[] = [];
    for (let index = 0; index < targets.length; index += 1) {
      const image = targets[index];
      setBusy(`Converting ${index + 1} of ${targets.length}: ${image.name}`);
      const response = await fetch("/api/photos/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert", path: image.path }),
      });
      const body = (await response.json().catch(() => null)) as { image?: GalleryImage; error?: string } | null;
      if (!response.ok || !body?.image) {
        errors.push(`${image.name}: ${body?.error || "Unable to convert that file."}`);
        continue;
      }
      added += 1;
      addedBytes += body.image.size;
    }
    setBusy("");
    setManageStep(null);
    if (added) await adjustTotals(folder, added, addedBytes);
    await selectFolder(folder);
    const failed = errors.slice(0, 2).join(" ");
    if (added) setNotice(`Added ${added} JPG file${added === 1 ? "" : "s"} to this folder.${failed ? ` ${failed}` : ""}`);
    else setGalleryError(failed || "Unable to convert those RAW files.");
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
            <p className="mt-1 text-sm text-neutral-400">
              {subtitle}
              {managing ? ` · ${pickedIds.length} selected` : ""}
            </p>
            {busy || notice ? <p className={`mt-1 text-sm ${busy ? "text-[#c9d3f7]" : "text-neutral-300"}`}>{busy || notice}</p> : null}
          </div>
          {mode.type === "folder" ? (
            <div className="flex flex-wrap gap-2">
              {!faceOpen && !galleryLoading && images.length > 0 ? (
                <button
                  type="button"
                  aria-pressed={managing}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                    managing ? "border-[#93a9f5] bg-[#7f98f0]/15 text-white" : "border-white/15 text-white hover:bg-white/5"
                  }`}
                  onClick={toggleManage}
                  disabled={Boolean(busy)}
                >
                  Mass manage
                </button>
              ) : null}
              {managing && pickedIds.length > 0 ? (
                <button
                  type="button"
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-60"
                  onClick={() => setManageStep("options")}
                  disabled={Boolean(busy)}
                >
                  Choose options
                </button>
              ) : null}
              {managing ? (
                <button
                  type="button"
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60"
                  onClick={() => setPickedIds(pickedIds.length === images.length ? [] : images.map((image) => image.id))}
                  disabled={Boolean(busy)}
                >
                  {pickedIds.length === images.length ? "Clear selection" : "Select all"}
                </button>
              ) : null}
              {!managing && !faceOpen && !galleryLoading && rawImages.length > 0 ? (
                <button
                  type="button"
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setConvertScope("folder");
                    setManageStep("convert");
                  }}
                >
                  Convert RAW to JPG
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
                onClick={() => {
                  setManaging(false);
                  setPickedIds([]);
                  setManageStep(null);
                  setFaceOpen((open) => !open);
                }}
              >
                {faceOpen ? "Close faces" : "Find faces"}
              </button>
              <Link
                href={`/photos/social?folder=${encodeURIComponent(mode.path)}`}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
              >
                Social posts
              </Link>
              <button
                type="button"
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
                onClick={() => setNewFolderOpen((open) => !open)}
              >
                New folder
              </button>
              <label className="cursor-pointer rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5">
                Camera
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={Boolean(uploading)}
                  onChange={(event) => {
                    void uploadFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
              <label className="cursor-pointer rounded-xl al-fill px-4 py-2 text-sm font-semibold text-[#101536]">
                {uploading ? `Uploading ${uploading}` : "Upload photos"}
                <input
                  type="file"
                  accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.tif,.tiff,.gif,.webp,.bmp"
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

        {mode.type === "folder" && newFolderOpen ? (
          <form
            className="mt-4 flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createFolder();
            }}
          >
            <label className="text-sm text-neutral-300" htmlFor="new-folder">
              Folder name
              <input
                id="new-folder"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="Sunday morning"
                className="ml-2 rounded-xl border border-white/15 bg-black px-3 py-2 text-white"
              />
            </label>
            <button type="submit" className="al-fill px-4 py-2 text-sm" disabled={creatingFolder || !newFolderName.trim()}>
              {creatingFolder ? "Creating…" : "Create folder"}
            </button>
          </form>
        ) : null}

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
              const checked = picked.has(image.id);
              const open = selectedId === image.id;
              return (
                <button
                  key={image.id}
                  type="button"
                  aria-pressed={managing ? checked : undefined}
                  aria-label={managing ? `${checked ? "Deselect" : "Select"} ${image.name}` : undefined}
                  onClick={() => {
                    if (managing) togglePicked(image.id);
                    else void openPhoto(image);
                  }}
                  className={`relative overflow-hidden rounded-2xl border bg-neutral-950 text-left ${
                    (managing ? checked : open) ? "border-[#93a9f5] ring-2 ring-[#7f98f0]" : "border-white/10"
                  }`}
                >
                  {managing ? (
                    <span
                      className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border text-sm font-bold ${
                        checked ? "border-[#93a9f5] al-fill text-[#101536]" : "border-white/80 bg-black/55 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  ) : null}
                  <FolderThumb path={image.path} raw={image.raw} />
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

      <PhotoManageDialog
        step={manageStep}
        selectedCount={selectedImages.length}
        convertCount={convertCount}
        canConvert={rawImages.length > 0}
        busy={busy}
        people={people}
        folders={stats}
        currentFolder={mode.type === "folder" ? mode.path : ""}
        rootName={rootName}
        onClose={() => {
          if (!busy) setManageStep(null);
        }}
        onStep={(step) => {
          if (step === "convert") setConvertScope(selectedRaw.length ? "selection" : "folder");
          setManageStep(step);
        }}
        onDelete={() => void deleteSelected()}
        onMove={(destination) => void moveSelected(destination)}
        onDownload={() => void downloadSelected()}
        onTag={(tags) => void tagSelected(tags)}
        onConvert={() => void convertRaw()}
      />
    </div>
  );
}
