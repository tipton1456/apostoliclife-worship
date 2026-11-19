"use client";

import Link from "next/link";
import WorshipLogo from "@/app/worship-logo";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

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

export default function DocsUploadPage() {
  const router = useRouter();

  const [accessCode, setAccessCode] = useState("");
  const [accessReady, setAccessReady] = useState(false);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [categories, setCategories] = useState<string[]>([]);
  const [uploaders, setUploaders] = useState<string[]>([]);

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

  const loadMeta = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/docs", { headers: authHeaders() });
    const data = await res.json();

    if (res.status === 401) {
      setNeedsAccess(true);
      setAccessReady(false);
      setAccessError("Staff access code required");
      return;
    }
    if (!res.ok) {
      setError(data.error || "Failed to load upload form");
      setAccessReady(true);
      return;
    }

    setNeedsAccess(Boolean(data.accessRequired));
    setAccessReady(true);
    setCategories(data.categories || []);
    setUploaders(data.uploaders || []);
  }, [authHeaders]);

  useEffect(() => {
    setAccessCode(loadStoredAccessCode());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadMeta().catch(() => setError("Could not load upload form"));
    }, 0);
    return () => clearTimeout(t);
  }, [loadMeta]);

  async function handleAccessSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      sessionStorage.setItem(ACCESS_STORAGE_KEY, accessCode.trim());
    } catch {
      /* ignore */
    }
    setAccessError(null);
    await loadMeta();
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
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

      router.push("/docs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
    }
  }

  if (!accessReady) {
    if (needsAccess) {
      return (
        <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
          <form
            onSubmit={handleAccessSubmit}
            className="al-card w-full max-w-md space-y-4 p-6"
          >
            <WorshipLogo href="/docs" className="h-10 w-auto" />
            <h1 className="text-2xl font-black uppercase text-[#c9d3f7]">
              Upload document
            </h1>
            <p className="text-sm text-gray-400">
              Enter the staff access code to upload documentation.
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
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4">
          <Link
            href="/docs"
            className="text-sm text-gray-400 hover:text-white underline"
          >
            ← Back to documentation list
          </Link>
        </div>

        <header className="mb-6">
          <WorshipLogo href="/docs" className="mb-4 h-10 w-auto" />
          <p className="al-eyebrow">Documentation</p>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">
            Upload document
          </h1>
          <p className="text-gray-400 mt-1">
            Add a file with a display name, category, description, and uploader.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <form
          onSubmit={handleUpload}
          className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 space-y-4"
        >
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Document name
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. PreSonus stagebox patch notes"
              className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#93a9f5]"
              required
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Category</label>
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
                  className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#93a9f5]"
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
                    className="flex-1 rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#93a9f5]"
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
                  className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#93a9f5]"
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
                    className="flex-1 rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#93a9f5]"
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
              rows={8}
              placeholder="Notes, how to use this doc, when it applies, related systems…"
              className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#93a9f5] resize-y min-h-[10rem]"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-[#7f98f0] file:px-4 file:py-2 file:font-bold file:text-[#101536]"
              required
            />
            {file && (
              <p className="text-xs text-gray-500 mt-1">
                {file.name} · {formatBytes(file.size)}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl al-fill text-[#101536] font-bold px-6 py-3 disabled:opacity-40"
            >
              {busy ? "Uploading…" : "Upload document"}
            </button>
            <Link
              href="/docs"
              className="rounded-xl border border-white/20 px-6 py-3 text-center font-semibold hover:bg-white/10"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
