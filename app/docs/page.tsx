"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

type FileKind =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "doc"
  | "sheet"
  | "presentation"
  | "file";

type Doc = {
  id: string;
  title: string;
  category: string;
  description: string;
  uploadedBy: string;
  originalFilename: string;
  contentType: string;
  fileSize: number;
  createdAt: string;
  kind?: FileKind;
  thumbnailUrl?: string | null;
};

const ACCESS_STORAGE_KEY = "big-top-access-code";

function loadStoredAccessCode(): string {
  try {
    return sessionStorage.getItem(ACCESS_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function FileThumbnail({ doc }: { doc: Doc }) {
  const kind = doc.kind || "file";
  const label =
    kind === "image"
      ? "IMG"
      : kind === "pdf"
        ? "PDF"
        : kind === "video"
          ? "VID"
          : kind === "audio"
            ? "AUD"
            : kind === "doc"
              ? "DOC"
              : kind === "sheet"
                ? "XLS"
                : kind === "presentation"
                  ? "PPT"
                  : "FILE";

  const tone =
    kind === "pdf"
      ? "bg-red-500/20 text-red-200 border-red-500/40"
      : kind === "doc"
        ? "bg-blue-500/20 text-blue-200 border-blue-500/40"
        : kind === "sheet"
          ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
          : kind === "presentation"
            ? "bg-orange-500/20 text-orange-200 border-orange-500/40"
            : kind === "video"
              ? "bg-purple-500/20 text-purple-200 border-purple-500/40"
              : kind === "audio"
                ? "bg-pink-500/20 text-pink-200 border-pink-500/40"
                : "bg-white/10 text-gray-300 border-white/20";

  if (kind === "image" && doc.thumbnailUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={doc.thumbnailUrl}
        alt=""
        className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-xl object-cover border border-white/15 bg-black"
      />
    );
  }

  return (
    <div
      className={`h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-xl border flex items-center justify-center text-[11px] sm:text-xs font-black tracking-wide ${tone}`}
      aria-hidden
    >
      {label}
    </div>
  );
}

export default function DocsPage() {
  const [accessCode, setAccessCode] = useState("");
  const [accessReady, setAccessReady] = useState(false);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Doc[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [filterCategory, setFilterCategory] = useState("");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(
    (extra?: HeadersInit): HeadersInit => {
      const headers: Record<string, string> = {};
      if (accessCode.trim()) headers["x-big-top-code"] = accessCode.trim();
      if (extra) Object.assign(headers, extra);
      return headers;
    },
    [accessCode]
  );

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (filterCategory) params.set("category", filterCategory);
    if (query.trim()) params.set("q", query.trim());

    const res = await fetch(`/api/docs?${params.toString()}`, {
      headers: authHeaders(),
    });
    const data = await res.json();

    if (res.status === 401) {
      setNeedsAccess(true);
      setAccessReady(false);
      setAccessError("Staff access code required");
      return;
    }
    if (!res.ok) {
      setError(data.error || "Failed to load documents");
      setAccessReady(true);
      return;
    }

    setNeedsAccess(Boolean(data.accessRequired));
    setAccessReady(true);
    setDocuments(data.documents || []);
    setCategories(data.categories || []);
  }, [authHeaders, filterCategory, query]);

  useEffect(() => {
    setAccessCode(loadStoredAccessCode());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load().catch(() => setError("Could not load documentation library"));
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function handleAccessSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      sessionStorage.setItem(ACCESS_STORAGE_KEY, accessCode.trim());
    } catch {
      /* ignore */
    }
    setAccessError(null);
    await load();
  }

  async function handleDownload(doc: Doc) {
    setError(null);
    try {
      const res = await fetch(
        `/api/docs/download?id=${encodeURIComponent(doc.id)}`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Download failed");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  if (!accessReady) {
    if (needsAccess) {
      return (
        <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
          <form
            onSubmit={handleAccessSubmit}
            className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 p-6 space-y-4"
          >
            <h1 className="text-2xl font-black text-[#7bbc07] uppercase">
              Documentation
            </h1>
            <p className="text-sm text-gray-400">
              Enter the staff access code to open the tech documentation library.
            </p>
            <input
              type="password"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Access code"
              className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#7bbc07]"
              autoFocus
            />
            {accessError && <p className="text-sm text-red-300">{accessError}</p>}
            <button
              type="submit"
              className="w-full rounded-xl bg-[#7bbc07] text-black font-bold py-3"
            >
              Unlock
            </button>
          </form>
        </main>
      );
    }
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <p className="text-gray-400">Loading documentation…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-[#7bbc07] underline"
          >
            ← Tech portal home
          </Link>
          <Link
            href="/docs/upload"
            className="rounded-xl bg-[#7bbc07] text-black font-bold px-4 py-2.5 text-sm sm:text-base"
          >
            Upload document
          </Link>
        </div>

        <header className="mb-6">
          <p className="text-[#7bbc07] font-semibold tracking-wide uppercase text-sm">
            Apostolic Life · Tech Department
          </p>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">
            Apostolic Worship Documentation
          </h1>
          <p className="text-gray-400 mt-1">
            Find production docs, manuals, and runbooks.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, description, uploader…"
            className="flex-1 rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#7bbc07]"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#7bbc07]"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <p className="text-sm text-gray-500 mb-3">
          {documents.length} document{documents.length === 1 ? "" : "s"}
        </p>

        <ul className="space-y-3 pb-12">
          {documents.length === 0 && (
            <li className="text-center text-gray-500 py-12">
              No documents yet.{" "}
              <Link href="/docs/upload" className="text-[#7bbc07] underline">
                Upload the first one
              </Link>
              .
            </li>
          )}
          {documents.map((doc) => {
            const open = expandedId === doc.id;
            return (
              <li
                key={doc.id}
                className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <FileThumbnail doc={doc} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="rounded-full bg-[#7bbc07]/20 text-[#b6e86a] border border-[#7bbc07]/40 px-2.5 py-0.5 text-xs font-bold">
                            {doc.category}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatBytes(doc.fileSize)}
                          </span>
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold leading-snug">
                          {doc.title}
                        </h3>
                        <p className="text-xs text-gray-400 mt-1">
                          {doc.uploadedBy} · {formatDate(doc.createdAt)} ·{" "}
                          <span className="font-mono">
                            {doc.originalFilename}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 pl-[4.25rem] sm:pl-0">
                      <button
                        type="button"
                        onClick={() => setExpandedId(open ? null : doc.id)}
                        className="rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10"
                      >
                        {open ? "Hide" : "Details"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(doc)}
                        className="rounded-xl bg-[#7bbc07] text-black px-3 py-2 text-sm font-bold"
                      >
                        Download
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {doc.description?.trim()
                          ? doc.description
                          : "No description provided."}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
