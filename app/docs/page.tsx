"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

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

export default function DocsPage() {
  const [accessCode, setAccessCode] = useState("");
  const [accessReady, setAccessReady] = useState(false);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Doc[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [uploaders, setUploaders] = useState<string[]>([]);

  const [filterCategory, setFilterCategory] = useState("");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [useNewCategory, setUseNewCategory] = useState(false);
  const [description, setDescription] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");
  const [newUploader, setNewUploader] = useState("");
  const [useNewUploader, setUseNewUploader] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(true);

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
    setUploaders(data.uploaders || []);
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

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const resolvedCategory = useNewCategory ? newCategory.trim() : category;
      const resolvedUploader = useNewUploader ? newUploader.trim() : uploadedBy;

      if (!title.trim()) throw new Error("Document name is required");
      if (!resolvedCategory) throw new Error("Category is required");
      if (!resolvedUploader) throw new Error("Uploader is required");
      if (!file) throw new Error("Choose a file to upload");

      const form = new FormData();
      form.append("title", title.trim());
      form.append("category", resolvedCategory);
      form.append("description", description);
      form.append("uploadedBy", resolvedUploader);
      form.append("file", file);

      const res = await fetch("/api/docs", {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setDocuments(data.documents || []);
      setCategories(data.categories || []);
      setUploaders(data.uploaders || []);
      setMessage(data.message || "Uploaded");
      setTitle("");
      setDescription("");
      setFile(null);
      setNewCategory("");
      setUseNewCategory(false);
      setNewUploader("");
      setUseNewUploader(false);
      if (resolvedCategory) setCategory(resolvedCategory);
      if (resolvedUploader) setUploadedBy(resolvedUploader);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(doc: Doc) {
    setError(null);
    try {
      const res = await fetch(`/api/docs/download?id=${encodeURIComponent(doc.id)}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Download failed");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  const filteredCount = documents.length;

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
        <div className="mb-4">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-[#7bbc07] underline"
          >
            ← Tech portal home
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
            Upload and find production docs, manuals, and runbooks.
          </p>
        </header>

        {/* Upload */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 mb-6">
          <button
            type="button"
            onClick={() => setShowUpload((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-xl font-bold">Upload document</h2>
            <span className="text-sm text-gray-400">
              {showUpload ? "Hide" : "Show"}
            </span>
          </button>

          {showUpload && (
            <form onSubmit={handleUpload} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Document name
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. PreSonus stagebox patch notes"
                  className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#7bbc07]"
                  required
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Category
                  </label>
                  {!useNewCategory ? (
                    <select
                      value={category}
                      onChange={(e) => {
                        if (e.target.value === "__new__") {
                          setUseNewCategory(true);
                          setCategory("");
                        } else {
                          setCategory(e.target.value);
                        }
                      }}
                      className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#7bbc07]"
                      required={!useNewCategory}
                    >
                      <option value="">Select category…</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__new__">+ Add new category…</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="New category name"
                        className="flex-1 rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#7bbc07]"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUseNewCategory(false);
                          setNewCategory("");
                        }}
                        className="px-3 rounded-xl border border-white/20 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Uploaded by
                  </label>
                  {!useNewUploader ? (
                    <select
                      value={uploadedBy}
                      onChange={(e) => {
                        if (e.target.value === "__new__") {
                          setUseNewUploader(true);
                          setUploadedBy("");
                        } else {
                          setUploadedBy(e.target.value);
                        }
                      }}
                      className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#7bbc07]"
                      required={!useNewUploader}
                    >
                      <option value="">Select person…</option>
                      {uploaders.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                      <option value="__new__">+ Add new person…</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        value={newUploader}
                        onChange={(e) => setNewUploader(e.target.value)}
                        placeholder="Person’s name"
                        className="flex-1 rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#7bbc07]"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUseNewUploader(false);
                          setNewUploader("");
                        }}
                        className="px-3 rounded-xl border border-white/20 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  placeholder="Notes, how to use this doc, when it applies, related systems…"
                  className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#7bbc07] resize-y min-h-[8rem]"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">File</label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-[#7bbc07] file:px-4 file:py-2 file:font-bold file:text-black"
                  required
                />
                {file && (
                  <p className="text-xs text-gray-500 mt-1">
                    {file.name} · {formatBytes(file.size)}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full sm:w-auto rounded-xl bg-[#7bbc07] text-black font-bold px-6 py-3 disabled:opacity-40"
              >
                {busy ? "Uploading…" : "Upload document"}
              </button>
            </form>
          )}
        </section>

        {message && (
          <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Filters */}
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
          {filteredCount} document{filteredCount === 1 ? "" : "s"}
        </p>

        <ul className="space-y-3 pb-12">
          {documents.length === 0 && (
            <li className="text-center text-gray-500 py-12">
              No documents yet. Upload the first one above.
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
                        <span className="font-mono">{doc.originalFilename}</span>
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(open ? null : doc.id)
                        }
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
