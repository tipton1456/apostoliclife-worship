"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatCentral } from "@/lib/photos/central-time";
import type { SocialStatus } from "@/lib/photos/social-files";

type Item = {
  id: string;
  folderPath: string;
  caption: string;
  scheduledAt: string;
  status: SocialStatus;
  submittedByName: string;
  publishError: string | null;
  createdAt: string;
};

const LABEL: Record<SocialStatus, string> = {
  pending_review: "Needs approval",
  approved: "Approved",
  publishing: "Posting",
  published: "Posted",
  rejected: "Rejected",
  failed: "Failed",
};

function canRemove(status: SocialStatus) {
  return status !== "publishing" && status !== "published";
}

export default function QueueList() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/photos/social/queue", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { submissions?: Item[]; error?: string } | null;
    if (!response.ok || !body?.submissions) {
      throw new Error(body?.error || "Unable to load the approval queue.");
    }
    setItems(body.submissions);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load the approval queue.");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const removableIds = items.filter((item) => canRemove(item.status)).map((item) => item.id);
  const selectedRemovable = selected.filter((id) => removableIds.includes(id));

  async function postDue() {
    setBusy(true);
    setNotice("");
    setError("");
    const response = await fetch("/api/photos/social/publish", { method: "POST" });
    const body = (await response.json().catch(() => null)) as { published?: number; failed?: number; waiting?: boolean; error?: string } | null;
    setBusy(false);
    if (!response.ok || !body || body.error) {
      setError(body?.error || "Unable to post the approved photos.");
      return;
    }
    if (body.waiting) {
      setNotice("Facebook and Instagram are not connected yet.");
      return;
    }
    setNotice(`Posted ${body.published ?? 0}. Failed ${body.failed ?? 0}.`);
    try {
      await load();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the approval queue.");
    }
  }

  async function removeSelected() {
    if (!selectedRemovable.length || busy) return;
    const label = selectedRemovable.length === 1 ? "this post" : `${selectedRemovable.length} posts`;
    if (!window.confirm(`Delete ${label} from the queue? They will not be published.`)) return;
    setBusy(true);
    setNotice("");
    setError("");
    const response = await fetch("/api/photos/social/queue", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedRemovable }),
    });
    const body = (await response.json().catch(() => null)) as { deleted?: number; error?: string } | null;
    setBusy(false);
    if (!response.ok || !body || body.error) {
      setError(body?.error || "Unable to remove those posts.");
      return;
    }
    setSelected([]);
    setNotice(`Removed ${body.deleted ?? selectedRemovable.length}. They will not be published.`);
    try {
      await load();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the approval queue.");
    }
  }

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Social approval</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="al-ghost px-4 py-2 text-sm"
            disabled={busy}
            onClick={() => {
              setManaging((current) => !current);
              setSelected([]);
            }}
          >
            {managing ? "Done" : "Manage queue"}
          </button>
          <button type="button" className="al-fill px-4 py-2 text-sm" disabled={busy} onClick={() => void postDue()}>
            {busy ? "Working…" : "Post anything that is due"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-neutral-400">
        Open a set to approve it, or manage the queue and delete posts before they are published.
      </p>
      {managing ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="al-ghost px-4 py-2 text-sm"
            disabled={!removableIds.length || busy}
            onClick={() => setSelected(selectedRemovable.length === removableIds.length ? [] : removableIds)}
          >
            {selectedRemovable.length === removableIds.length && removableIds.length ? "Clear selection" : "Select unpublished"}
          </button>
          <button
            type="button"
            className="rounded-xl bg-red-200 px-4 py-2 text-sm font-semibold text-red-950 disabled:opacity-50"
            disabled={!selectedRemovable.length || busy}
            onClick={() => void removeSelected()}
          >
            Delete selected
          </button>
          <span className="text-sm text-neutral-400">{selectedRemovable.length} selected</span>
        </div>
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {notice ? <p className="mt-4 text-sm text-[#c9d3f7]">{notice}</p> : null}
      <ul className="mt-6 space-y-3">
        {items.map((item) => {
          const removable = canRemove(item.status);
          return (
            <li key={item.id} className="flex items-start gap-3 rounded-2xl border border-white/10 hover:bg-white/5">
              {managing ? (
                <label className="flex items-center px-3 py-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selected.includes(item.id)}
                    disabled={!removable || busy}
                    aria-label={`Select ${item.folderPath || "photo set"}`}
                    onChange={() => toggle(item.id)}
                  />
                </label>
              ) : null}
              <Link href={`/photos/social/queue/${item.id}`} className="block min-w-0 flex-1 px-4 py-3">
                <span className="text-sm font-semibold">{item.folderPath || "Photo library"}</span>
                <span className="mt-1 block text-sm text-neutral-300">
                  {LABEL[item.status]} · {formatCentral(item.scheduledAt)} Central
                  {item.submittedByName ? ` · ${item.submittedByName}` : ""}
                </span>
                <span className="mt-1 block truncate text-sm text-neutral-500">{item.caption}</span>
                {managing && !removable ? <span className="mt-1 block text-xs text-neutral-500">Already going out</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {!loaded && !error ? <p className="mt-8 text-sm text-neutral-400">Loading the queue…</p> : null}
      {loaded && items.length === 0 && !error ? <p className="mt-8 text-sm text-neutral-400">No photo sets have been submitted.</p> : null}
    </div>
  );
}
