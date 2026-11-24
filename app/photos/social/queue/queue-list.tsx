"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

export default function QueueList() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/photos/social/queue", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { submissions?: Item[]; error?: string } | null;
      if (cancelled) return;
      if (!response.ok || !body?.submissions) {
        setError(body?.error || "Unable to load the approval queue.");
        return;
      }
      setItems(body.submissions);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Approval queue</h1>
        <button type="button" className="al-fill px-4 py-2 text-sm" disabled={busy} onClick={() => void postDue()}>
          {busy ? "Posting…" : "Post anything that is due"}
        </button>
      </div>
      <p className="mt-2 text-sm text-neutral-400">Open a text when it arrives, or review a set from this list.</p>
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {notice ? <p className="mt-4 text-sm text-[#c9d3f7]">{notice}</p> : null}
      <ul className="mt-6 space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/photos/social/queue/${item.id}`} className="block rounded-2xl border border-white/10 px-4 py-3 hover:bg-white/5">
              <span className="text-sm font-semibold">{item.folderPath || "Photo library"}</span>
              <span className="mt-1 block text-sm text-neutral-300">{LABEL[item.status]} · {formatCentral(item.scheduledAt)} Central</span>
              <span className="mt-1 block truncate text-sm text-neutral-500">{item.caption}</span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length === 0 && !error ? <p className="mt-8 text-sm text-neutral-400">No photo sets have been submitted.</p> : null}
    </div>
  );
}
