"use client";

import Link from "next/link";
import WorshipLogo from "@/app/worship-logo";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import DocxViewer from "./docx-viewer";
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

function isDocxFile(doc: Doc) {
  const name = doc.originalFilename.toLowerCase();
  const type = (doc.contentType || "").toLowerCase();
  return name.endsWith(".docx") || type.includes("wordprocessingml");
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
  const [linkCopied, setLinkCopied] = useState(false);
  const [menu, setMenu] = useState<{ doc: Doc; x: number; y: number } | null>(null);
  const [moveDoc, setMoveDoc] = useState<Doc | null>(null);
  const [moveFolder, setMoveFolder] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [undoArchive, setUndoArchive] = useState<{ id: string; title: string } | null>(null);
  const shareFiles = useRef(new Map<string, File>());

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

  useEffect(() => {
    setLinkCopied(false);
  }, [selectedId]);

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

    // PDFs and Word files render from /api/docs/view, so they skip the signed URL.
    const kind = selectedDoc.kind || "file";
    if (kind === "pdf" || kind === "doc") {
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

  async function copyFileLink() {
    if (!selectedDoc) return;
    const url = `${window.location.origin}/file/${selectedDoc.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setViewError("Unable to copy the file link.");
    }
  }

  useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function openFileMenu(event: ReactMouseEvent, doc: Doc) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(doc.id);
    const x = Math.max(8, Math.min(event.clientX, window.innerWidth - 196));
    const y = Math.max(8, Math.min(event.clientY, window.innerHeight - 148));
    setMenu({ doc, x, y });
    void fileForShare(doc).catch(() => undefined);
  }

  async function fileForShare(doc: Doc) {
    const cached = shareFiles.current.get(doc.id);
    if (cached) return cached;
    const response = await fetch(`/api/docs/view?id=${encodeURIComponent(doc.id)}`, {
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error("Could not prepare that file to share");
    const blob = await response.blob();
    const file = new File([blob], doc.originalFilename || `${doc.title}.bin`, {
      type: blob.type || doc.contentType || "application/octet-stream",
    });
    shareFiles.current.set(doc.id, file);
    return file;
  }

  async function runManage(action: "move" | "archive" | "restore", id: string, category?: string) {
    const response = await fetch("/api/docs/manage", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action, id, category }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not update that file");
    setDocuments((data.documents || []) as Doc[]);
    setCategories(data.categories || []);
    return data as { title?: string; archivedFrom?: string | null };
  }

  async function archiveFile(doc: Doc) {
    setMenu(null);
    setBusyAction(true);
    setError(null);
    try {
      const data = await runManage("archive", doc.id);
      setUndoArchive({ id: doc.id, title: data.title || doc.title });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive that file");
    } finally {
      setBusyAction(false);
    }
  }

  async function restoreArchivedFile() {
    if (!undoArchive) return;
    setBusyAction(true);
    setError(null);
    try {
      await runManage("restore", undoArchive.id);
      setUndoArchive(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore that file");
    } finally {
      setBusyAction(false);
    }
  }

  async function confirmMove(event: FormEvent) {
    event.preventDefault();
    if (!moveDoc) return;
    const folder = moveFolder.trim();
    if (!folder) {
      setError("Choose a folder or type a new one.");
      return;
    }
    setBusyAction(true);
    setError(null);
    try {
      await runManage("move", moveDoc.id, folder);
      shareFiles.current.delete(moveDoc.id);
      setMoveDoc(null);
      setMoveFolder("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move that file");
    } finally {
      setBusyAction(false);
    }
  }

  async function shareFile(doc: Doc) {
    setMenu(null);
    setError(null);
    try {
      if (!navigator.share) {
        setError("Open this library in Safari to use the Mac share menu for Mail, Messages, and AirDrop.");
        return;
      }
      const file = await fileForShare(doc);
      const payload: ShareData = { files: [file], title: doc.title };
      if (navigator.canShare && !navigator.canShare(payload)) {
        await navigator.share({
          title: doc.title,
          url: `${window.location.origin}/file/${doc.id}`,
        });
        return;
      }
      await navigator.share(payload);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Could not open the share menu");
    }
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
            className="al-card w-full max-w-md space-y-4 p-6"
          >
            <WorshipLogo href="/home" className="h-10 w-auto" />
            <h1 className="text-2xl font-black uppercase text-[#c9d3f7]">
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
              className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#93a9f5]"
              autoFocus
            />
            {accessError && <p className="text-sm text-red-300">{accessError}</p>}
            <button
              type="submit"
              className="w-full rounded-xl al-fill text-[#101536] font-bold py-3"
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
      {/* Top bar — compact */}
      <header className="shrink-0 border-b border-white/10 px-3 sm:px-4 py-1.5 flex items-center gap-3">
        <WorshipLogo href="/home" className="h-7 w-auto" />
        <div className="min-w-0 flex-1 flex items-baseline gap-2">
          <h1 className="text-sm sm:text-base font-black uppercase tracking-tight truncate">
            Documentation
          </h1>
          <span className="hidden sm:inline text-[10px] text-gray-500 truncate">
            Tech Department
          </span>
        </div>
        <nav className="shrink-0 flex items-center gap-3 text-xs sm:text-sm">
          <Link
            href="/home"
            className="text-gray-400 hover:text-white underline underline-offset-2"
          >
            Home
          </Link>
          <Link
            href="/docs/upload"
            className="text-[#c9d3f7] hover:text-white underline underline-offset-2 font-semibold"
          >
            Upload
          </Link>
          <button
            type="button"
            onClick={() => void copyFileLink()}
            disabled={!selectedDoc}
            className="text-[#c9d3f7] hover:text-white underline underline-offset-2 font-semibold disabled:opacity-30 disabled:no-underline"
          >
            {linkCopied ? "Link copied" : "Copy file link"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!selectedDoc}
            className="text-[#c9d3f7] hover:text-white underline underline-offset-2 font-semibold disabled:opacity-30 disabled:no-underline"
          >
            Download
          </button>
        </nav>
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
              className="w-full rounded-lg bg-black border border-white/20 px-3 py-2 text-sm focus:outline-none focus:border-[#93a9f5]"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {tree.length === 0 && (
              <p className="text-sm text-gray-500 p-3 text-center">
                No documents.
                <br />
                <Link href="/docs/upload" className="text-[#c9d3f7] underline">
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
                    <span className="text-sm font-bold text-[#c9d3f7] truncate">
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
                              onContextMenu={(event) => openFileMenu(event, doc)}
                              onClick={() => {
                                setMenu(null);
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
                                  ? "bg-[#7f98f0]/20 border border-[#93a9f5]/40"
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
              <div className="shrink-0 border-b border-white/10 px-3 sm:px-4 py-1.5 flex items-center gap-2 min-h-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 rounded bg-[#7f98f0]/15 text-[#c9d3f7] border border-[#93a9f5]/30 px-1.5 py-px text-[9px] font-bold uppercase">
                      {selectedDoc.category}
                    </span>
                    <h2 className="text-sm font-semibold truncate">
                      {selectedDoc.title}
                    </h2>
                  </div>
                  <p className="text-[10px] text-gray-500 truncate mt-0.5">
                    {selectedDoc.uploadedBy} · {formatDate(selectedDoc.createdAt)}{" "}
                    · {formatBytes(selectedDoc.fileSize)} ·{" "}
                    <span className="font-mono">
                      {selectedDoc.originalFilename}
                    </span>
                  </p>
                </div>
                {treeCollapsed && (
                  <button
                    type="button"
                    onClick={toggleTreeCollapsed}
                    className="md:hidden shrink-0 text-xs text-gray-400 hover:text-white underline underline-offset-2"
                  >
                    Library
                  </button>
                )}
              </div>

              {selectedDoc.description?.trim() && (
                <div className="shrink-0 px-3 sm:px-4 py-1 border-b border-white/10 text-[11px] leading-snug text-gray-400 bg-white/[0.02] max-h-16 overflow-y-auto whitespace-pre-wrap">
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
                ) : isDocxFile(selectedDoc) ? (
                  <DocxViewer
                    key={selectedDoc.id}
                    src={`/api/docs/view?id=${encodeURIComponent(selectedDoc.id)}`}
                    headers={viewHeaders}
                    title={selectedDoc.title}
                  />
                ) : (selectedDoc.kind || "file") === "doc" ? (
                  <div className="flex h-full items-center justify-center p-6 text-center">
                    <div className="max-w-md space-y-3">
                      <p className="text-sm text-[#a9b2c8]">
                        This older Word file can’t be shown in the viewer. Download it to open it in Word.
                      </p>
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="rounded-full al-fill px-4 py-2 text-sm font-bold text-[#101536]"
                      >
                        Download
                      </button>
                    </div>
                  </div>
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
                            className="rounded-xl al-fill text-[#101536] font-bold px-4 py-2 text-sm"
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

      {menu ? (
        <div
          role="menu"
          className="al-card fixed z-50 w-44 overflow-hidden p-1 shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-white/10"
            onClick={() => {
              setMoveDoc(menu.doc);
              setMoveFolder("");
              setMenu(null);
            }}
          >
            Move
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busyAction}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
            onClick={() => void archiveFile(menu.doc)}
          >
            Delete
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-white/10"
            onClick={() => void shareFile(menu.doc)}
          >
            Share
          </button>
        </div>
      ) : null}

      {moveDoc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={(event) => void confirmMove(event)} className="al-card w-full max-w-md p-5">
            <p className="al-eyebrow">Move file</p>
            <h2 className="mt-2 truncate text-xl font-bold">{moveDoc.title}</h2>
            <p className="mt-1 text-sm text-[#a9b2c8]">Choose the folder this file should live in.</p>
            <div className="mt-4 max-h-56 space-y-1 overflow-y-auto">
              {categories
                .filter((category) => category !== moveDoc.category)
                .map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setMoveFolder(category)}
                    className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${
                      moveFolder === category ? "bg-[#7f98f0]/25 text-white" : "hover:bg-white/10"
                    }`}
                  >
                    {category}
                  </button>
                ))}
            </div>
            <label className="mt-4 block text-sm text-[#a9b2c8]">
              Or a new folder
              <input
                value={categories.includes(moveFolder) ? "" : moveFolder}
                onChange={(event) => setMoveFolder(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#272a35] bg-[#141824] px-3 py-2 text-white outline-none focus:border-[#93a9f5]"
                placeholder="Folder name"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="al-ghost px-4 py-2 text-sm"
                onClick={() => {
                  setMoveDoc(null);
                  setMoveFolder("");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyAction || !moveFolder.trim()}
                className="rounded-full al-fill px-4 py-2 text-sm font-bold text-[#101536] disabled:opacity-50"
              >
                Move
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {undoArchive ? (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#272a35] bg-[#181c2c] px-4 py-2 text-sm shadow-2xl">
          <span className="max-w-xs truncate">“{undoArchive.title}” was archived.</span>
          <button
            type="button"
            disabled={busyAction}
            onClick={() => void restoreArchivedFile()}
            className="font-bold text-[#c9d3f7] disabled:opacity-50"
          >
            Undo
          </button>
        </div>
      ) : null}
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
          className="text-[#c9d3f7] font-semibold underline"
        >
          Download
        </button>
        .
      </div>
    </div>
  );
}
