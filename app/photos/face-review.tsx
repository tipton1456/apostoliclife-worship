"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bestFaceMatch, type FaceBox, type FaceJob, type FaceReference, type FaceSuggestionView } from "@/lib/photos/face-match";
import { tagSuggestions } from "@/lib/photos/tag-name";
import type { PersonSummary } from "@/lib/photos/types";

type FaceReviewProps = {
  folder: string;
  folderName: string;
  people: PersonSummary[];
  onPeopleChange: () => void;
  onClose: () => void;
};

type LocalFace = {
  box: FaceBox;
  crop: string;
  embedding: number[];
  suggestedTag: string | null;
  distance: number | null;
};

type ScanPhoto = {
  id: string;
  path: string;
  faces: LocalFace[];
};

function cropSrc(crop: string) {
  return crop.startsWith("data:") ? crop : `data:image/jpeg;base64,${crop}`;
}

function sameTag(left: string, right: string) {
  return left.toLocaleLowerCase("en") === right.toLocaleLowerCase("en");
}

async function loadModels() {
  const faceapi = await import("@vladmandic/face-api");
  const source = "/models/face";
  if (!faceapi.nets.ssdMobilenetv1.isLoaded) await faceapi.nets.ssdMobilenetv1.loadFromUri(source);
  if (!faceapi.nets.faceLandmark68Net.isLoaded) await faceapi.nets.faceLandmark68Net.loadFromUri(source);
  if (!faceapi.nets.faceRecognitionNet.isLoaded) await faceapi.nets.faceRecognitionNet.loadFromUri(source);
  return faceapi;
}

async function canvasFromPreview(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Unable to read that photo.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

function cropFace(canvas: HTMLCanvasElement, box: { x: number; y: number; width: number; height: number }) {
  const padX = box.width * 0.22;
  const padY = box.height * 0.22;
  const x = Math.max(0, box.x - padX);
  const y = Math.max(0, box.y - padY);
  const width = Math.min(canvas.width - x, box.width + padX * 2);
  const height = Math.min(canvas.height - y, box.height + padY * 2);
  const output = document.createElement("canvas");
  output.width = 144;
  output.height = 144;
  const context = output.getContext("2d");
  if (!context || width < 2 || height < 2) return null;
  context.drawImage(canvas, x, y, width, height, 0, 0, output.width, output.height);
  const crop = output.toDataURL("image/jpeg", 0.72).split(",")[1] || "";
  if (crop.length < 100) return null;
  return {
    crop,
    box: {
      x: x / canvas.width,
      y: y / canvas.height,
      width: width / canvas.width,
      height: height / canvas.height,
    },
  };
}

function NameField({
  people,
  disabled,
  onSubmit,
}: {
  people: PersonSummary[];
  disabled: boolean;
  onSubmit: (tag: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const suggestions = tagSuggestions(people, [], query);
  const active = Math.min(highlight, Math.max(suggestions.length - 1, 0));

  function choose(tag: string) {
    const canonical = people.find((person) => sameTag(person.tag, tag))?.tag ?? tag;
    onSubmit(canonical);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="flex gap-1">
      <input
        value={query}
        disabled={disabled}
        autoComplete="off"
        placeholder="Name"
        aria-label="Person name"
        className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black px-2 py-1.5 text-sm outline-none focus:border-[#7bbc07]"
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
          setOpen(event.target.value.trim().length > 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const chosen = suggestions[active];
            if (chosen) choose(chosen.tag);
            else if (query.trim()) choose(query);
          }
        }}
      />
        <button
          type="button"
          className="shrink-0 rounded-lg bg-[#7bbc07] px-2 text-xs font-semibold text-neutral-950 disabled:opacity-50"
          disabled={disabled || !query.trim()}
          onClick={() => choose(query)}
        >
          Tag
        </button>
      </div>
      {open && suggestions.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-white/10 bg-neutral-900 py-1 shadow-xl">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.create ? "new" : "have"}-${suggestion.tag}`}>
              <button
                type="button"
                className={`block w-full px-2 py-1.5 text-left text-sm ${index === active ? "bg-white/10" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(suggestion.tag);
                }}
              >
                {suggestion.create ? `Add “${suggestion.tag}”` : suggestion.tag}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function FaceReview({ folder, folderName, people, onPeopleChange, onClose }: FaceReviewProps) {
  const [suggestions, setSuggestions] = useState<FaceSuggestionView[]>([]);
  const [phase, setPhase] = useState<"loading" | "scanning" | "ready" | "error">("loading");
  const [checked, setChecked] = useState(0);
  const [total, setTotal] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [current, setCurrent] = useState("");
  const [failedPhotos, setFailedPhotos] = useState(0);
  const [learned, setLearned] = useState(0);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const stopRequested = useRef(false);

  useEffect(() => {
    let cancelled = false;
    stopRequested.current = false;

    async function postPhotos(photos: ScanPhoto[]) {
      if (!photos.length || cancelled) return;
      const response = await fetch("/api/photos/faces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", folder, photos }),
      });
      const body = (await response.json().catch(() => null)) as { suggestions?: FaceSuggestionView[]; error?: string } | null;
      if (!response.ok || !body || body.error) throw new Error(body?.error || "Unable to save face results.");
      if (cancelled) return;
      setSuggestions((currentSuggestions) => {
        const seen = new Set(currentSuggestions.map((suggestion) => suggestion.id));
        const added = (body.suggestions ?? []).filter((suggestion) => !seen.has(suggestion.id));
        return [...currentSuggestions, ...added];
      });
    }

    async function detectPhoto(
      faceapi: Awaited<ReturnType<typeof loadModels>>,
      image: FaceJob["images"][number],
    ) {
      const response = await fetch(`/api/photos/preview?path=${encodeURIComponent(image.path)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Preview is not available.");
      const canvas = await canvasFromPreview(await response.blob());
      const detected = await faceapi
        .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4, maxResults: 30 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
      const faces: LocalFace[] = [];
      for (const found of detected) {
        const cropped = cropFace(canvas, found.detection.box);
        if (!cropped) continue;
        faces.push({
          box: cropped.box,
          crop: cropped.crop,
          embedding: Array.from(found.descriptor),
          suggestedTag: null,
          distance: null,
        });
      }
      return faces;
    }

    async function run() {
      setPhase("loading");
      setError("");
      const response = await fetch(`/api/photos/faces?folder=${encodeURIComponent(folder)}`, { cache: "no-store" });
      const job = (await response.json().catch(() => null)) as (FaceJob & { error?: string }) | null;
      if (cancelled) return;
      if (!response.ok || !job || job.error) {
        setPhase("error");
        setError(job?.error || "Unable to load faces.");
        return;
      }

      setSuggestions(job.pending);
      setSkipped(job.skipped);
      setTotal(job.images.length);
      setChecked(0);
      if (!job.images.length) {
        setPhase("ready");
        return;
      }

      setPhase("scanning");
      let faceapi: Awaited<ReturnType<typeof loadModels>>;
      try {
        faceapi = await loadModels();
      } catch {
        if (!cancelled) {
          setPhase("error");
          setError("Face recognition could not load. Refresh the page and try again.");
        }
        return;
      }
      if (cancelled || stopRequested.current) {
        setPhase("ready");
        return;
      }

      const references: FaceReference[] = job.references.map((reference) => ({ ...reference }));
      const seeded = job.images.filter((image) => image.tags.length === 1);
      const rest = job.images.filter((image) => image.tags.length !== 1);
      const deferred: { image: FaceJob["images"][number]; faces: LocalFace[] }[] = [];
      const queue = [...seeded, ...rest];
      let batch: ScanPhoto[] = [];
      let seen = 0;
      let failures = 0;
      let learnedFaces = 0;

      function remember(tag: string, embedding: number[]) {
        const tagKey = tag.toLocaleLowerCase("en");
        const known = references.filter((reference) => reference.tagKey === tagKey);
        if (known.length >= 8) return;
        if (bestFaceMatch(embedding, known, 0.2)) return;
        references.push({ tag, tagKey, embedding });
      }

      async function flush() {
        const sending = batch;
        batch = [];
        if (sending.length) await postPhotos(sending);
      }

      for (const image of queue) {
        if (cancelled || stopRequested.current) break;
        setCurrent(image.name);
        try {
          const faces = await detectPhoto(faceapi, image);
          const clearFace = faces.length === 1 && faces[0].box.width >= 0.08 && faces[0].box.height >= 0.08;
          if (image.tags.length === 1 && clearFace) {
            const tag = image.tags[0];
            faces[0].suggestedTag = tag;
            faces[0].distance = null;
            remember(tag, faces[0].embedding);
            learnedFaces += 1;
            batch.push({ id: image.id, path: image.path, faces });
          } else if (image.tags.length === 1) {
            deferred.push({ image, faces });
          } else {
            for (const face of faces) {
              const match = bestFaceMatch(face.embedding, references);
              if (!match) continue;
              face.suggestedTag = match.tag;
              face.distance = match.distance;
            }
            batch.push({ id: image.id, path: image.path, faces });
          }
        } catch {
          failures += 1;
        }

        seen += 1;
        if (!cancelled) setChecked(seen);
        if (batch.length >= 5) {
          try {
            await flush();
          } catch (caught) {
            if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to save face results.");
          }
        }
      }

      for (const item of deferred) {
        if (cancelled) break;
        for (const face of item.faces) {
          const match = bestFaceMatch(face.embedding, references);
          if (!match) continue;
          face.suggestedTag = match.tag;
          face.distance = match.distance;
        }
        batch.push({ id: item.image.id, path: item.image.path, faces: item.faces });
        if (batch.length >= 5) {
          try {
            await flush();
          } catch (caught) {
            if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to save face results.");
          }
        }
      }

      try {
        await flush();
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to save face results.");
      }

      if (!cancelled) {
        setFailedPhotos(failures);
        setLearned(learnedFaces);
        setCurrent("");
        setPhase("ready");
      }
    }

    void run().catch((caught) => {
      if (cancelled) return;
      setPhase("error");
      setError(caught instanceof Error ? caught.message : "Unable to check faces.");
    });

    return () => {
      cancelled = true;
    };
  }, [folder]);

  async function decide(items: { id: number; action: "approve" | "dismiss"; tag?: string }[]) {
    const ids = items.map((item) => item.id);
    setBusyIds((currentIds) => [...currentIds, ...ids]);
    setError("");
    const done = new Set<number>();
    let failedMessage = "";

    for (let index = 0; index < items.length; index += 25) {
      const group = items.slice(index, index + 25);
      const response = await fetch("/api/photos/faces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", items: group }),
      });
      const body = (await response.json().catch(() => null)) as
        | { done?: number[]; failed?: { id: number; error: string }[]; error?: string }
        | null;
      if (!response.ok || !body || body.error) {
        failedMessage = body?.error || "Unable to update those faces.";
        break;
      }
      for (const id of body.done ?? []) done.add(id);
      if (body.failed?.length) failedMessage = body.failed[0]?.error || "Some faces could not be updated.";
    }

    setBusyIds((currentIds) => currentIds.filter((id) => !ids.includes(id)));
    setSuggestions((currentSuggestions) => currentSuggestions.filter((suggestion) => !done.has(suggestion.id)));
    setEditingId(null);
    if (done.size) onPeopleChange();
    if (failedMessage) setError(failedMessage);
  }

  const groups = useMemo(() => {
    const matched = new Map<string, { tag: string; faces: FaceSuggestionView[] }>();
    const unknown: FaceSuggestionView[] = [];
    for (const suggestion of suggestions) {
      if (!suggestion.suggestedTag) {
        unknown.push(suggestion);
        continue;
      }
      const key = suggestion.suggestedTag.toLocaleLowerCase("en");
      const group = matched.get(key) ?? { tag: suggestion.suggestedTag, faces: [] };
      group.faces.push(suggestion);
      matched.set(key, group);
    }
    return {
      matched: [...matched.values()].sort((left, right) => left.tag.localeCompare(right.tag, "en", { sensitivity: "base" })),
      unknown,
    };
  }, [suggestions]);

  const recognized = groups.matched.reduce((sum, group) => sum + group.faces.length, 0);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Find faces in {folderName}</h3>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            Checks new JPEG photos in this folder and its subfolders. Tags already on photos stay in place. A
            photo you already tagged with one clear face teaches that person. Other matches wait here so you can
            approve, change, or remove them.
          </p>
        </div>
        <div className="flex gap-2">
          {phase === "scanning" ? (
            <button
              type="button"
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold"
              onClick={() => {
                stopRequested.current = true;
              }}
            >
              Stop
            </button>
          ) : null}
          <button type="button" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <p className="mt-4 text-sm text-neutral-300">
        {phase === "loading" ? "Loading the folder and face recognition…" : null}
        {phase === "scanning" ? `Checking ${checked} of ${total}${current ? ` · ${current}` : ""}. Keep this tab open.` : null}
        {phase === "ready" && total > 0 ? `Checked ${checked} new photos.` : null}
        {phase === "ready" && total === 0 && suggestions.length === 0 ? "No new JPEG photos to check in this folder." : null}
        {phase === "error" ? "The face check stopped." : null}
      </p>
      {skipped > 0 ? (
        <p className="mt-1 text-sm text-neutral-500">{skipped} photos were already checked and were left alone.</p>
      ) : null}
      {failedPhotos > 0 ? (
        <p className="mt-1 text-sm text-neutral-500">{failedPhotos} photos could not be read. Run this folder again to retry them.</p>
      ) : null}
      {learned > 0 ? (
        <p className="mt-1 text-sm text-neutral-500">
          Remembered {learned} {learned === 1 ? "face" : "faces"} from photos that were already tagged.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {recognized > 0 ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7bbc07]">Recognized · {recognized}</h4>
            <button
              type="button"
              className="rounded-xl bg-[#7bbc07] px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50"
              disabled={busyIds.length > 0}
              onClick={() =>
                void decide(
                  groups.matched.flatMap((group) =>
                    group.faces.map((face) => ({ id: face.id, action: "approve" as const, tag: group.tag })),
                  ),
                )
              }
            >
              Approve all matches
            </button>
          </div>
          {groups.matched.map((group) => (
            <section key={group.tag} className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="text-base font-semibold">{group.tag}</h5>
                <button
                  type="button"
                  className="text-sm font-semibold text-neutral-300 hover:text-white disabled:opacity-50"
                  disabled={busyIds.length > 0}
                  onClick={() =>
                    void decide(group.faces.map((face) => ({ id: face.id, action: "approve" as const, tag: group.tag })))
                  }
                >
                  Approve {group.faces.length}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                {group.faces.map((face) => {
                  const busy = busyIds.includes(face.id);
                  const already = face.photoTags.some((tag) => sameTag(tag, group.tag));
                  return (
                    <article key={face.id} className="rounded-2xl border border-white/10 bg-neutral-950 p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cropSrc(face.crop)} alt={`Face in ${face.fileName}`} className="aspect-square w-full rounded-xl object-cover" />
                      <p className="mt-2 truncate text-xs text-neutral-400">{face.fileName}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {face.distance == null ? "From a photo you already tagged" : already ? "Already on this photo" : "Recognized"}
                      </p>
                      {editingId === face.id ? (
                        <div className="mt-2">
                          <NameField
                            people={people}
                            disabled={busy}
                            onSubmit={(tag) => void decide([{ id: face.id, action: "approve", tag }])}
                          />
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                          <button type="button" className="text-[#7bbc07] disabled:opacity-50" disabled={busy} onClick={() => void decide([{ id: face.id, action: "approve", tag: group.tag }])}>
                            Approve
                          </button>
                          <button type="button" className="text-neutral-300 hover:text-white disabled:opacity-50" disabled={busy} onClick={() => setEditingId(face.id)}>
                            Change
                          </button>
                          <button type="button" className="text-neutral-300 hover:text-white disabled:opacity-50" disabled={busy} onClick={() => void decide([{ id: face.id, action: "dismiss" }])}>
                            Remove
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {groups.unknown.length > 0 ? (
        <div className="mt-8">
          <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7bbc07]">
            New faces · {groups.unknown.length}
          </h4>
          <p className="mt-1 text-sm text-neutral-500">Name a face once. The next run can recognize that person.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {groups.unknown.map((face) => {
              const busy = busyIds.includes(face.id);
              return (
                <article key={face.id} className="rounded-2xl border border-white/10 bg-neutral-950 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cropSrc(face.crop)} alt={`Unknown face in ${face.fileName}`} className="aspect-square w-full rounded-xl object-cover" />
                  <p className="mt-2 truncate text-xs text-neutral-400">{face.fileName}</p>
                  <div className="mt-2">
                    <NameField people={people} disabled={busy} onSubmit={(tag) => void decide([{ id: face.id, action: "approve", tag }])} />
                  </div>
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-neutral-300 hover:text-white disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void decide([{ id: face.id, action: "dismiss" }])}
                  >
                    Skip
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {phase === "ready" && suggestions.length === 0 && total > 0 && !error ? (
        <p className="mt-6 text-sm text-neutral-400">No faces are waiting for approval.</p>
      ) : null}
    </div>
  );
}
