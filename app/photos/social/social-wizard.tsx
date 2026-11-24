"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { editPhotoInExpress, fileToBase64 } from "@/app/photos/social/express-editor";
import { defaultScheduleInput } from "@/lib/photos/central-time";
import { isSocialPhotoName, SOCIAL_PHOTO_LIMIT } from "@/lib/photos/social-files";

type Photo = { id: string; name: string; path: string };

type Step = "edit" | "choose" | "details" | "done";

function toggleId(current: string[], id: string) {
  if (current.includes(id)) return current.filter((item) => item !== id);
  if (current.length >= SOCIAL_PHOTO_LIMIT) return current;
  return [...current, id];
}

function editedCopyName(name: string) {
  return /-edited\.[^.]+$/i.test(name);
}

function sourceBase(name: string) {
  return name.replace(/-edited(?=\.[^.]+$)/i, "");
}

function photosForPost(images: Photo[], savedNames: string[], sourceNames: string[]) {
  const saved = new Set(savedNames);
  const sources = new Set(sourceNames);
  return images
    .filter((photo) => saved.has(photo.name) || sources.has(photo.name))
    .sort((left, right) => {
      const base = sourceBase(left.name).localeCompare(sourceBase(right.name), "en", { sensitivity: "base" });
      if (base !== 0) return base;
      return Number(editedCopyName(left.name)) - Number(editedCopyName(right.name));
    })
    .slice(0, SOCIAL_PHOTO_LIMIT)
    .map((photo) => photo.id);
}

async function editedBlob(data: string | Blob) {
  if (data instanceof Blob) return data;
  if (data.startsWith("http") || data.startsWith("blob:")) {
    const response = await fetch(data);
    if (!response.ok) throw new Error("Unable to read the edited image.");
    return response.blob();
  }
  const cleaned = data.replace(/^data:image\/\w+;base64,/, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "image/jpeg" });
}

export default function SocialWizard({
  folder,
  photographer,
  adobeClientId,
  isAdmin,
}: {
  folder: string;
  photographer: string;
  adobeClientId: string;
  isAdmin: boolean;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>("edit");
  const [editIds, setEditIds] = useState<string[]>([]);
  const [postIds, setPostIds] = useState<string[]>([]);
  const [editing, setEditing] = useState("");
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState(defaultScheduleInput);
  const [helping, setHelping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [smsNote, setSmsNote] = useState("");
  const [ready, setReady] = useState({ adobe: Boolean(adobeClientId), ai: false, publishing: false, sms: false });

  async function loadPhotos() {
    const response = await fetch(`/api/photos?path=${encodeURIComponent(folder)}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { images?: Photo[]; error?: string } | null;
    if (!response.ok || !body || body.error) throw new Error(body?.error || "Unable to load this folder.");
    return (body.images ?? []).filter((photo) => isSocialPhotoName(photo.name));
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [images, status] = await Promise.all([
          loadPhotos(),
          fetch("/api/photos/social", { cache: "no-store" }).then((response) => response.json().catch(() => null)),
        ]);
        if (cancelled) return;
        setPhotos(images);
        if (status && !status.error) {
          setReady({
            adobe: Boolean(status.adobe || adobeClientId),
            ai: Boolean(status.ai),
            publishing: Boolean(status.publishing),
            sms: Boolean(status.sms),
          });
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load this folder.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The folder is chosen before this screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  const folderName = folder.split("/").filter(Boolean).pop() || "Photo library";
  const postPhotos = photos.filter((photo) => postIds.includes(photo.id));

  async function editSelected() {
    const selected = photos.filter((photo) => editIds.includes(photo.id));
    if (!selected.length || !adobeClientId || editing) return;
    setError("");
    const savedNames: string[] = [];

    for (let index = 0; index < selected.length; index += 1) {
      const photo = selected[index];
      setEditing(`Opening ${index + 1} of ${selected.length}: ${photo.name}`);
      try {
        const preview = await fetch(`/api/photos/preview?path=${encodeURIComponent(photo.path)}`);
        if (!preview.ok) throw new Error(`Unable to open ${photo.name}.`);
        const base64 = await fileToBase64(await preview.blob());
        await editPhotoInExpress({
          clientId: adobeClientId,
          base64,
          onSave: async (data) => {
            const blob = await editedBlob(data);
            const baseName = photo.name.replace(/\.[^.]+$/, "");
            const linkResponse = await fetch("/api/photos/upload-link", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folder, name: `${baseName}-edited.jpg` }),
            });
            const linkBody = (await linkResponse.json().catch(() => null)) as { link?: string; name?: string; error?: string } | null;
            if (!linkResponse.ok || !linkBody?.link) throw new Error(linkBody?.error || "Unable to save the edited photo.");
            const upload = await fetch(linkBody.link, {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: blob,
            });
            if (!upload.ok) throw new Error("Dropbox did not accept the edited photo.");
            const saved = (await upload.json().catch(() => null)) as { name?: string } | null;
            savedNames.push(saved?.name || linkBody.name || `${baseName}-edited.jpg`);
          },
        });
      } catch (editError) {
        setEditing("");
        if (editError instanceof Error && editError.message !== "Editing was cancelled.") setError(editError.message);
        break;
      }
    }

    setEditing("");
    if (!savedNames.length) return;
    try {
      const images = await loadPhotos();
      setPhotos(images);
      setPostIds(photosForPost(images, savedNames, selected.map((photo) => photo.name)));
      setStep("choose");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The edit was saved, but the folder did not reload.");
    }
  }

  async function helpWrite() {
    setHelping(true);
    setError("");
    const response = await fetch("/api/photos/social/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: caption, folder }),
    });
    const body = (await response.json().catch(() => null)) as { caption?: string; error?: string } | null;
    setHelping(false);
    if (!response.ok || !body?.caption) {
      setError(body?.error || "Caption help is unavailable right now.");
      return;
    }
    setCaption(body.caption);
  }

  async function submit() {
    if (!postPhotos.length || submitting) return;
    setSubmitting(true);
    setError("");
    const response = await fetch("/api/photos/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folder,
        caption,
        scheduledAt: when,
        photos: postPhotos.map((photo) => ({ dropboxId: photo.id, path: photo.path, fileName: photo.name })),
      }),
    });
    const body = (await response.json().catch(() => null)) as { smsOk?: boolean; smsError?: string; error?: string } | null;
    setSubmitting(false);
    if (!response.ok || !body || body.error) {
      setError(body?.error || "Unable to submit those photos.");
      return;
    }
    setSmsNote(
      body.smsOk
        ? "A text was sent asking for approval."
        : `The photos were submitted. The text did not send${body.smsError ? `: ${body.smsError}` : "."}`,
    );
    setStep("done");
  }

  function photoGrid(selected: string[], onToggle: (id: string) => void) {
    const ordered = [...photos].sort((left, right) => {
      const base = sourceBase(left.name).localeCompare(sourceBase(right.name), "en", { sensitivity: "base" });
      if (base !== 0) return base;
      return Number(editedCopyName(left.name)) - Number(editedCopyName(right.name));
    });
    return (
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {ordered.map((photo) => {
          const checked = selected.includes(photo.id);
          const order = selected.indexOf(photo.id);
          return (
            <button
              key={photo.id}
              type="button"
              aria-pressed={checked}
              className={`overflow-hidden rounded-2xl border text-left ${checked ? "border-[#93a9f5]" : "border-white/10"}`}
              onClick={() => onToggle(photo.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/thumbnail?path=${encodeURIComponent(photo.path)}`} alt="" className="aspect-square w-full object-cover" />
              <span className="flex items-center justify-between gap-2 px-2 py-2 text-xs">
                <span className="truncate">{photo.name}</span>
                {editedCopyName(photo.name) ? <span className="shrink-0 text-[#a9b2c8]">Edited</span> : null}
                {checked ? <span className="shrink-0 font-semibold">{order + 1}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#a9b2c8]">{folderName}</p>
          <h1 className="text-2xl font-bold">Social posts</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-400">
            Choose up to {SOCIAL_PHOTO_LIMIT} photos to edit in Adobe Express, then choose up to {SOCIAL_PHOTO_LIMIT} for Facebook and Instagram.
            {photographer ? ` Signed in as ${photographer}.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin ? (
            <Link href="/photos/social/queue" className="al-ghost px-4 py-2 text-sm">
              Approval queue
            </Link>
          ) : null}
          <Link href="/photos" className="al-ghost px-4 py-2 text-sm">
            Back to photos
          </Link>
        </div>
      </div>

      {!ready.publishing ? (
        <p className="mt-4 rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-300">
          Facebook and Instagram are not connected yet, so approved posts will wait until that connection is added.
        </p>
      ) : null}
      {!ready.adobe && step === "edit" ? (
        <p className="mt-4 rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-300">
          Adobe Express editing needs an API key from the Adobe Developer Console, saved as ADOBE_EXPRESS_CLIENT_ID. You can still choose photos and send them for approval.
        </p>
      ) : null}

      <div className="mt-4 flex gap-2 text-sm">
        {(["edit", "choose", "details"] as Step[]).map((item, index) => (
          <span key={item} className={step === item ? "font-semibold text-white" : "text-neutral-500"}>
            {index + 1}. {item === "edit" ? "Edit" : item === "choose" ? "Choose posts" : "Caption"}
          </span>
        ))}
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {loading ? <p className="mt-8 text-neutral-400">Loading photos…</p> : null}
      {!loading && photos.length === 0 ? (
        <p className="mt-8 text-neutral-400">This folder has no JPG, PNG, WebP, or HEIC photos yet. Upload some, or convert RAW files to JPG first.</p>
      ) : null}

      {!loading && photos.length > 0 && step === "edit" ? (
        <section className="mt-2">
          <p className="text-sm text-neutral-300">
            {editIds.length} of {SOCIAL_PHOTO_LIMIT} selected to edit. Sign in to Adobe Express with the church account, then choose Save to Photos.
          </p>
          {photoGrid(editIds, (id) => setEditIds((current) => toggleId(current, id)))}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="al-fill px-4 py-3 text-sm" disabled={!editIds.length || !adobeClientId || Boolean(editing)} onClick={() => void editSelected()}>
              {editing || "Edit selected in Adobe Express"}
            </button>
            <button type="button" className="al-ghost px-4 py-3 text-sm" onClick={() => setStep("choose")}>
              Continue without editing
            </button>
          </div>
        </section>
      ) : null}

      {!loading && photos.length > 0 && step === "choose" ? (
        <section className="mt-2">
          <p className="text-sm text-neutral-300">
            {postIds.length} of {SOCIAL_PHOTO_LIMIT} selected for the posts and stories. Each edited copy sits beside its original. Click a photo to add or remove it.
          </p>
          {photoGrid(postIds, (id) => setPostIds((current) => toggleId(current, id)))}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="al-ghost px-4 py-3 text-sm" onClick={() => setStep("edit")}>
              Back
            </button>
            <button type="button" className="al-fill px-4 py-3 text-sm" disabled={!postIds.length} onClick={() => setStep("details")}>
              Write the caption
            </button>
          </div>
        </section>
      ) : null}

      {step === "details" ? (
        <section className="mt-4 max-w-2xl">
          <p className="text-sm text-neutral-300">{postPhotos.length} photos will be sent for approval.</p>
          <label className="mt-4 block text-sm font-semibold" htmlFor="caption">
            Caption
            <textarea
              id="caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              rows={6}
              placeholder="What should the post say?"
              className="mt-2 w-full rounded-xl border border-white/15 bg-black px-3 py-3 text-base font-normal text-white"
            />
          </label>
          <button type="button" className="al-ghost mt-3 px-4 py-2 text-sm" disabled={helping} onClick={() => void helpWrite()}>
            {helping ? "Writing…" : ready.ai ? "Help me write this" : "Help me write this"}
          </button>
          <label className="mt-4 block text-sm font-semibold" htmlFor="when">
            Date and time to post, Central
            <input
              id="when"
              type="datetime-local"
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/15 bg-black px-3 py-3 text-base font-normal text-white"
            />
          </label>
          <p className="mt-2 text-sm text-neutral-400">
            The free site plan checks for due posts once each morning. After you approve a set, it posts on that check, or right away from the approval queue.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="al-ghost px-4 py-3 text-sm" onClick={() => setStep("choose")}>
              Back
            </button>
            <button type="button" className="al-fill px-4 py-3 text-sm" disabled={submitting || !caption.trim()} onClick={() => void submit()}>
              {submitting ? "Submitting…" : "Submit photos"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "done" ? (
        <section className="mt-8 max-w-xl">
          <h2 className="text-xl font-bold">Submitted</h2>
          <p className="mt-2 text-sm text-neutral-300">{smsNote}</p>
          <p className="mt-2 text-sm text-neutral-400">
            After approval, each photo is posted to the Facebook Page and Instagram feed, and a vertical story is created on both.
          </p>
          <Link href="/photos" className="al-fill mt-6 inline-block px-4 py-3 text-sm">
            Back to photos
          </Link>
        </section>
      ) : null}
    </div>
  );
}
