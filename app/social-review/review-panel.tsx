"use client";

import { useEffect, useState } from "react";
import { editedImageBlob, editPhotoInExpress, fileToBase64 } from "@/app/photos/social/express-editor";
import { centralInputValue, formatCentral } from "@/lib/photos/central-time";
import type { SocialDecision, SocialPhotoView, SocialSubmissionView } from "@/lib/photos/social-files";

const STATUS_LABEL: Record<SocialSubmissionView["status"], string> = {
  pending_review: "Waiting for your approval",
  approved: "Approved and waiting for the post time",
  publishing: "Posting now",
  published: "Posted to Facebook and Instagram",
  rejected: "Rejected",
  failed: "Posting failed",
};

export default function ReviewPanel({
  endpoint,
  adobeClientId = "",
  correctionEndpoint = "",
}: {
  endpoint: string;
  adobeClientId?: string;
  correctionEndpoint?: string;
}) {
  const [submission, setSubmission] = useState<SocialSubmissionView | null>(null);
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState("");
  const [decisions, setDecisions] = useState<Record<string, SocialDecision>>({});
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { submission?: SocialSubmissionView; error?: string } | null;
      if (cancelled) return;
      if (!response.ok || !body?.submission) {
        setError(body?.error || "Unable to open this photo set.");
        return;
      }
      setSubmission(body.submission);
      setCaption(body.submission.caption);
      setWhen(centralInputValue(new Date(body.submission.scheduledAt)));
      setDecisions(Object.fromEntries(body.submission.photos.map((photo) => [photo.id, photo.decision])));
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const locked = submission?.status === "published" || submission?.status === "publishing";

  async function send(action: "save" | "approve" | "retry") {
    if (!submission || busy) return;
    setBusy(action === "approve" ? "Saving the approval…" : action === "retry" ? "Posting again…" : "Saving…");
    setError("");
    setNotice("");
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        caption,
        scheduledAt: when,
        decisions: submission.photos.map((photo) => ({ id: photo.id, decision: decisions[photo.id] || photo.decision })),
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      submission?: SocialSubmissionView;
      publishError?: string;
      error?: string;
    } | null;
    setBusy("");
    if (!response.ok || !body?.submission) {
      setError(body?.error || "Unable to save this review.");
      return;
    }
    setSubmission(body.submission);
    setCaption(body.submission.caption);
    setWhen(centralInputValue(new Date(body.submission.scheduledAt)));
    setDecisions(Object.fromEntries(body.submission.photos.map((photo) => [photo.id, photo.decision])));
    if (body.publishError) setError(body.publishError);
    else if (body.submission.status === "published") setNotice("Posted to Facebook and Instagram, including stories.");
    else if (body.submission.status === "approved") setNotice(`Approved for ${formatCentral(body.submission.scheduledAt)} Central.`);
    else if (body.submission.status === "rejected") setNotice("This set was rejected. Nothing will be posted.");
    else setNotice("Saved.");
  }

  async function correctPhoto(photo: SocialPhotoView) {
    if (!submission || !adobeClientId || !correctionEndpoint || locked || editingId || busy) return;
    setEditingId(photo.id);
    setError("");
    setNotice("");
    try {
      const preview = await fetch(`${endpoint}?photo=${encodeURIComponent(photo.id)}&edit=1`, { cache: "no-store" });
      if (!preview.ok) throw new Error(`Unable to open ${photo.fileName}.`);
      const base64 = await fileToBase64(await preview.blob());
      await editPhotoInExpress({
        clientId: adobeClientId,
        base64,
        saveLabel: "Save correction",
        onSave: async (data) => {
          const blob = await editedImageBlob(data);
          const linkResponse = await fetch(correctionEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photoId: photo.id }),
          });
          const linkBody = (await linkResponse.json().catch(() => null)) as { link?: string; error?: string } | null;
          if (!linkResponse.ok || !linkBody?.link) throw new Error(linkBody?.error || "Unable to save the correction.");
          const upload = await fetch(linkBody.link, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: blob,
          });
          if (!upload.ok) throw new Error("Dropbox did not accept the correction.");
          const saved = (await upload.json().catch(() => null)) as {
            id?: string;
            name?: string;
            path_display?: string;
            path_lower?: string;
          } | null;
          const saveResponse = await fetch(correctionEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              photoId: photo.id,
              dropboxId: saved?.id || "",
              path: saved?.path_display || saved?.path_lower || "",
              fileName: saved?.name || "",
            }),
          });
          const savedBody = (await saveResponse.json().catch(() => null)) as { submission?: SocialSubmissionView; error?: string } | null;
          if (!saveResponse.ok || !savedBody?.submission) throw new Error(savedBody?.error || "Unable to update this post.");
          const nextName = savedBody.submission.photos.find((item) => item.id === photo.id)?.fileName || photo.fileName;
          setSubmission((current) =>
            current
              ? {
                  ...current,
                  photos: current.photos.map((item) => (item.id === photo.id ? { ...item, fileName: nextName } : item)),
                }
              : current,
          );
          setVersions((current) => ({ ...current, [photo.id]: Date.now() }));
          setNotice("This post now uses the corrected photo. You can approve it when you are ready.");
        },
      });
    } catch (editError) {
      if (!(editError instanceof Error) || editError.message !== "Editing was cancelled.") {
        setError(editError instanceof Error ? editError.message : "Unable to edit that photo.");
      }
    } finally {
      setEditingId("");
    }
  }

  if (!submission && !error) return <p className="mt-8 text-neutral-400">Loading photos…</p>;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {submission ? (
        <>
          <p className="text-sm text-[#a9b2c8]">
            {submission.folderPath || "Photo library"}
            {submission.submittedByName ? ` · from ${submission.submittedByName}` : ""}
          </p>
          <h1 className="mt-1 text-2xl font-bold">Social photo approval</h1>
          <p className="mt-2 text-sm text-neutral-300">{STATUS_LABEL[submission.status]}</p>
          {submission.publishError ? <p className="mt-3 text-sm text-red-300">{submission.publishError}</p> : null}
        </>
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {notice ? <p className="mt-4 text-sm text-[#c9d3f7]">{notice}</p> : null}

      {submission ? (
        <div className="mt-6 space-y-4">
          {submission.photos.map((photo) => {
            const decision = decisions[photo.id] || photo.decision;
            return (
              <article key={photo.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${endpoint}?photo=${encodeURIComponent(photo.id)}&v=${versions[photo.id] || 0}`}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-semibold">{photo.fileName}</p>
                    {photo.facebookStoryId || photo.instagramStoryId ? (
                      <p className="mt-1 text-xs text-neutral-400">Story posted</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {adobeClientId && correctionEndpoint ? (
                      <button
                        type="button"
                        disabled={locked || Boolean(editingId) || Boolean(busy)}
                        className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        onClick={() => void correctPhoto(photo)}
                      >
                        {editingId === photo.id ? "Opening…" : "Edit"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={locked || Boolean(editingId)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold ${decision === "approved" ? "bg-white text-neutral-950" : "border border-white/15 text-white"}`}
                      onClick={() => setDecisions((current) => ({ ...current, [photo.id]: "approved" }))}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={locked || Boolean(editingId)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold ${decision === "rejected" ? "bg-red-200 text-red-950" : "border border-white/15 text-white"}`}
                      onClick={() => setDecisions((current) => ({ ...current, [photo.id]: "rejected" }))}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          <label className="block text-sm font-semibold" htmlFor="caption">
            Caption
            <textarea
              id="caption"
              value={caption}
              disabled={locked}
              onChange={(event) => setCaption(event.target.value)}
              rows={5}
              className="mt-2 w-full rounded-xl border border-white/15 bg-black px-3 py-3 text-base text-white"
            />
          </label>
          <label className="block text-sm font-semibold" htmlFor="when">
            Post time, Central
            <input
              id="when"
              type="datetime-local"
              value={when}
              disabled={locked}
              onChange={(event) => setWhen(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/15 bg-black px-3 py-3 text-base text-white"
            />
          </label>

          {locked ? null : (
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" className="al-fill px-4 py-3 text-sm" disabled={Boolean(busy)} onClick={() => void send("approve")}>
                {busy === "Saving the approval…" ? busy : "Approve and schedule"}
              </button>
              <button type="button" className="al-ghost px-4 py-3 text-sm" disabled={Boolean(busy)} onClick={() => void send("save")}>
                Save without posting
              </button>
              {submission.status === "failed" ? (
                <button type="button" className="al-ghost px-4 py-3 text-sm" disabled={Boolean(busy)} onClick={() => void send("retry")}>
                  Try posting again
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
