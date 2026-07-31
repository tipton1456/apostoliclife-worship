"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import PdfJsViewer from "./PdfJsViewer";

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
const TREE_COLLAPSED_KEY = "docs-tree-collapsed";

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

function kindLabel(kind?: FileKind) {
  switch (kind) {
    case "image":
      return "IMG";
    case "pdf":
      return "PDF";
    case "video":
      return "VID";
    case "audio":
      return "AUD";
    case "doc":
      return "DOC";
    case "sheet":
      return "XLS";
    case "presentation":
      return "PPT";
    default:
      return "FILE";
  }
}

function FileThumb({ doc, small }: { doc: Doc; small?: boolean }) {
  const size = small ? "h-8 w-8" : "h-10 w-10";
  if (doc.thumbnailUrl && (doc.kind === "image" || doc.kind === "pdf")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={doc.thumbnailUrl}
        alt=""
        className={`${size} shrink-0 rounded-md object-cover border border-white/15 bg-black`}
      />
    );
  }
  return (
    <div
      className={`${size} shrink-0 rounded-md border border-white/20 bg-white/10 text-[9px] font-black flex items-center justify-center text-gray-300`}
    >
      {kindLabel(doc.kind)}
    </div>
  );
}

function isBrowserViewable(doc: Doc) {
  const kind = doc.kind || "file";
  return (
    kind === "pdf" ||
    kind === "image" ||
    kind === "video" ||
    kind === "audio" ||
    (doc.contentType || "").startsWith("text/")
  );
}

export default function DocsPage() {
  const [accessCode, setAccessCode] = useState("");
  const [accessReady, setAccessReady] = useState(false);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Doc[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>(
    {}
  );
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
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
    const docs = (data.documents || []) as Doc[];
    setDocuments(docs);
    setCategories(data.categories || []);

    // Keep selection if still present; otherwise pick first doc
    setSelectedId((prev) => {
      if (prev && docs.some((d) => d.id === prev)) return prev;
      return docs[0]?.id ?? null;
    });
  }, [authHeaders, query]);

  useEffect(() => {
    setAccessCode(loadStoredAccessCode());
    try {
      setTreeCollapsed(localStorage.getItem(TREE_COLLAPSED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load().catch(() => setError("Could not load documentation library"));
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Deep link ?id=
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("id");
      if (id) setSelectedId(id);
    } catch {
      /* ignore */
    }
  }, []);

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedId) || null,
    [documents, selectedId]
  );

  const viewHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (accessCode.trim()) headers["x-big-top-code"] = accessCode.trim();
    return headers;
  }, [accessCode]);

  // Load signed view URL for non-PDF files (PDFs use PDF.js + same-origin proxy)
  useEffect(() => {
    if (!selectedDoc || !accessReady) {
      setViewUrl(null);
      return;
    }

    // PDFs are rendered by PdfJsViewer via /api/docs/view — skip signed URL
    if ((selectedDoc.kind || "file") === "pdf") {
      setViewUrl(null);
      setViewLoading(false);
      setViewError(null);
      return;
    }

    let cancelled = false;
    setViewLoading(true);
    setViewError(null);
    setViewUrl(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/docs/download?id=${encodeURIComponent(selectedDoc.id)}&expires=3600`,
          { headers: authHeaders() }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not open document");
        if (!cancelled) setViewUrl(data.url);
      } catch (err) {
        if (!cancelled) {
          setViewError(err instanceof Error ? err.message : "Viewer failed");
        }
      } finally {
        if (!cancelled) setViewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDoc, accessReady, authHeaders]);

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

  function toggleTreeCollapsed() {
    setTreeCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(TREE_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleCategory(cat: string) {
    setCollapsedCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  async function handleDownload() {
    if (!selectedDoc) return;
    setViewError(null);
    try {
      const res = await fetch(
        `/api/docs/download?id=${encodeURIComponent(selectedDoc.id)}&expires=600`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Download failed");
      // Force download via temporary anchor when possible
      const a = document.createElement("a");
      a.href = data.url;
      a.download = data.filename || selectedDoc.originalFilename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setViewError(err instanceof Error ? err.message : "Download failed");
    }
  }

  const tree = useMemo(() => {
    const byCat = new Map<string, Doc[]>();
    for (const cat of categories) byCat.set(cat, []);
    for (const doc of documents) {
      if (!byCat.has(doc.category)) byCat.set(doc.category, []);
      byCat.get(doc.category)!.push(doc);
    }
    // Sort docs in each category
    for (const [, list] of byCat) {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    // Categories with docs first, then empty
    return [...byCat.entries()]
      .filter(([, list]) => list.length > 0 || !query.trim())
      .sort(([a], [b]) => a.localeCompare(b));
  }, [documents, categories, query]);

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
    <main className="h-[100dvh] bg-black text-white flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 border-b border-white/10 px-3 sm:px-4 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <Link
          href="/"
          className="text-xs sm:text-sm text-gray-400 hover:text-[#7bbc07] underline"
        >
          Home
        </Link>
        <div className="hidden sm:block h-4 w-px bg-white/15" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs text-[#7bbc07] font-semibold uppercase tracking-wide">
            Apostolic Life · Tech Department
          </p>
          <h1 className="text-base sm:text-xl font-black uppercase tracking-tight truncate">
            Apostolic Worship Documentation
          </h1>
        </div>
        <Link
          href="/docs/upload"
          className="rounded-xl bg-[#7bbc07] text-black font-bold px-3 sm:px-4 py-2 text-sm"
        >
          Upload
        </Link>
      </header>

      {error && (
        <div className="shrink-0 mx-3 mt-3 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 flex relative">
        {/* Tree panel */}
        <aside
          className={`shrink-0 border-r border-white/10 bg-[#0a0a0a] flex flex-col transition-all duration-200 ease-out ${
            treeCollapsed
              ? "w-0 opacity-0 overflow-hidden pointer-events-none"
              : "w-[min(100%,20rem)] sm:w-80 opacity-100"
          }`}
        >
          <div className="p-3 border-b border-white/10 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
                Library
              </span>
              <button
                type="button"
                onClick={toggleTreeCollapsed}
                className="text-xs text-gray-400 hover:text-white border border-white/15 rounded-lg px-2 py-1"
                title="Hide library panel"
              >
                Hide
              </button>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search docs…"
              className="w-full rounded-lg bg-black border border-white/20 px-3 py-2 text-sm focus:outline-none focus:border-[#7bbc07]"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {tree.length === 0 && (
              <p className="text-sm text-gray-500 p-3 text-center">
                No documents.
                <br />
                <Link href="/docs/upload" className="text-[#7bbc07] underline">
                  Upload one
                </Link>
              </p>
            )}

            {tree.map(([category, docs]) => {
              const collapsed = collapsedCats[category];
              return (
                <div key={category} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 text-left"
                  >
                    <span className="text-gray-500 text-xs w-3">
                      {collapsed ? "▸" : "▾"}
                    </span>
                    <span className="text-sm font-bold text-[#b6e86a] truncate">
                      {category}
                    </span>
                    <span className="ml-auto text-[10px] text-gray-500">
                      {docs.length}
                    </span>
                  </button>

                  {!collapsed && (
                    <ul className="ml-2 border-l border-white/10 pl-1">
                      {docs.map((doc) => {
                        const active = doc.id === selectedId;
                        return (
                          <li key={doc.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(doc.id);
                                // On small screens, auto-hide tree after select
                                if (
                                  typeof window !== "undefined" &&
                                  window.innerWidth < 768
                                ) {
                                  setTreeCollapsed(true);
                                  try {
                                    localStorage.setItem(TREE_COLLAPSED_KEY, "1");
                                  } catch {
                                    /* ignore */
                                  }
                                }
                              }}
                              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors ${
                                active
                                  ? "bg-[#7bbc07]/20 border border-[#7bbc07]/40"
                                  : "hover:bg-white/5 border border-transparent"
                              }`}
                            >
                              <FileThumb doc={doc} small />
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold truncate">
                                  {doc.title}
                                </span>
                                <span className="block text-[10px] text-gray-500 truncate">
                                  {doc.originalFilename}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Collapsed tree rail */}
        {treeCollapsed && (
          <div className="shrink-0 w-11 border-r border-white/10 bg-[#0a0a0a] flex flex-col items-center py-3 gap-2">
            <button
              type="button"
              onClick={toggleTreeCollapsed}
              className="w-8 h-8 rounded-lg border border-white/20 hover:bg-white/10 text-sm font-bold"
              title="Show library panel"
            >
              ›
            </button>
            <span
              className="text-[10px] uppercase tracking-widest text-gray-500"
              style={{ writingMode: "vertical-rl" }}
            >
              Library
            </span>
          </div>
        )}

        {/* Viewer */}
        <section className="flex-1 min-w-0 flex flex-col bg-black">
          {!selectedDoc ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 p-6 text-center">
              Select a document from the library to view it here.
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-white/10 px-3 sm:px-4 py-3 flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="rounded-full bg-[#7bbc07]/20 text-[#b6e86a] border border-[#7bbc07]/40 px-2 py-0.5 text-[10px] font-bold">
                      {selectedDoc.category}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {formatBytes(selectedDoc.fileSize)}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black leading-snug truncate">
                    {selectedDoc.title}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {selectedDoc.uploadedBy} · {formatDate(selectedDoc.createdAt)}{" "}
                    ·{" "}
                    <span className="font-mono">
                      {selectedDoc.originalFilename}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!treeCollapsed ? null : (
                    <button
                      type="button"
                      onClick={toggleTreeCollapsed}
                      className="md:hidden rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold"
                    >
                      Library
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="rounded-xl bg-[#7bbc07] text-black font-bold px-4 py-2 text-sm"
                  >
                    Download
                  </button>
                </div>
              </div>

              {selectedDoc.description?.trim() && (
                <div className="shrink-0 px-3 sm:px-4 py-2 border-b border-white/10 text-sm text-gray-300 bg-white/[0.03] max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {selectedDoc.description}
                </div>
              )}

              <div className="flex-1 min-h-0 relative bg-[#111]">
                {(selectedDoc.kind || "file") === "pdf" ? (
                  <PdfJsViewer
                    key={selectedDoc.id}
                    src={`/api/docs/view?id=${encodeURIComponent(selectedDoc.id)}`}
                    headers={viewHeaders}
                    title={selectedDoc.title}
                  />
                ) : (
                  <>
                    {viewLoading && (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400 z-10">
                        Loading preview…
                      </div>
                    )}
                    {viewError && (
                      <div className="absolute inset-0 flex items-center justify-center p-6 z-10">
                        <div className="max-w-md text-center space-y-3">
                          <p className="text-red-300 text-sm">{viewError}</p>
                          <button
                            type="button"
                            onClick={handleDownload}
                            className="rounded-xl bg-[#7bbc07] text-black font-bold px-4 py-2 text-sm"
                          >
                            Download instead
                          </button>
                        </div>
                      </div>
                    )}

                    {!viewLoading && !viewError && viewUrl && (
                      <DocViewer
                        doc={selectedDoc}
                        url={viewUrl}
                        onDownload={handleDownload}
                      />
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function DocViewer({
  doc,
  url,
  onDownload,
}: {
  doc: Doc;
  url: string;
  onDownload: () => void;
}) {
  const kind = doc.kind || "file";

  if (kind === "image") {
    return (
      <div className="h-full w-full overflow-auto flex items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={doc.title}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className="h-full w-full flex items-center justify-center p-4">
        <video
          src={url}
          controls
          className="max-w-full max-h-full rounded-lg"
        />
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div className="h-full w-full flex items-center justify-center p-6">
        <audio src={url} controls className="w-full max-w-xl" />
      </div>
    );
  }

  // Office / unknown: try iframe, offer download fallback
  if (isBrowserViewable(doc) || kind === "file") {
    // text/*
    if ((doc.contentType || "").startsWith("text/")) {
      return (
        <iframe
          title={doc.title}
          src={url}
          className="h-full w-full border-0 bg-white text-black"
        />
      );
    }
  }

  return (
    <div className="h-full w-full flex flex-col">
      <iframe
        title={doc.title}
        src={url}
        className="flex-1 w-full border-0 bg-neutral-900"
      />
      <div className="shrink-0 border-t border-white/10 px-4 py-3 text-center text-sm text-gray-400 bg-black">
        If this file type doesn’t preview in the browser, use{" "}
        <button
          type="button"
          onClick={onDownload}
          className="text-[#7bbc07] font-semibold underline"
        >
          Download
        </button>
        .
      </div>
    </div>
  );
}
