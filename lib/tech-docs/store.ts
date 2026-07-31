import { createAdminClient } from "@/lib/supabase/admin";
import type { FileKind, TechDoc, TechDocListItem } from "./types";

const BUCKET = "worship-tech-docs";
const META_PATH = "meta/library.json";
const THUMBNAIL_TTL_SECONDS = 60 * 30; // 30 minutes

const DEFAULT_CATEGORIES = [
  "General",
  "Mic Board",
  "PreSonus",
  "Networking",
  "Planning Center",
  "Events",
  "Lighting",
  "Streaming",
];

const DEFAULT_UPLOADERS = ["Steve Tipton"];

type LibraryMeta = {
  categories: string[];
  uploaders: string[];
  documents: TechDoc[];
};

function emptyMeta(): LibraryMeta {
  return {
    categories: [...DEFAULT_CATEGORIES],
    uploaders: [...DEFAULT_UPLOADERS],
    documents: [],
  };
}

export function getFileKind(
  contentType: string,
  filename: string
): FileKind {
  const type = (contentType || "").toLowerCase();
  const name = (filename || "").toLowerCase();

  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|heic|bmp)$/i.test(name)) {
    return "image";
  }
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(name)) {
    return "video";
  }
  if (type.startsWith("audio/") || /\.(mp3|wav|m4a|aac)$/i.test(name)) {
    return "audio";
  }
  if (
    type.includes("word") ||
    type.includes("msword") ||
    /\.(docx?|rtf)$/i.test(name)
  ) {
    return "doc";
  }
  if (
    type.includes("sheet") ||
    type.includes("excel") ||
    /\.(xlsx?|csv)$/i.test(name)
  ) {
    return "sheet";
  }
  if (
    type.includes("presentation") ||
    type.includes("powerpoint") ||
    /\.(pptx?|key)$/i.test(name)
  ) {
    return "presentation";
  }
  return "file";
}

function toListItem(
  doc: TechDoc,
  extras?: { thumbnailUrl?: string | null }
): TechDocListItem {
  const { storagePath: _storagePath, ...rest } = doc;
  return {
    ...rest,
    kind: getFileKind(doc.contentType, doc.originalFilename),
    thumbnailUrl: extras?.thumbnailUrl ?? null,
  };
}

export async function ensureDocsBucket() {
  const supabase = createAdminClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Storage list failed: ${listError.message}`);
  }
  const exists = (buckets || []).some((b) => b.name === BUCKET || b.id === BUCKET);
  if (exists) return;

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Create storage bucket failed: ${error.message}`);
  }
}

async function readMeta(): Promise<LibraryMeta> {
  await ensureDocsBucket();
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(META_PATH);

  if (error || !data) {
    // First run — seed defaults
    const meta = emptyMeta();
    await writeMeta(meta);
    return meta;
  }

  try {
    const text = await data.text();
    const parsed = JSON.parse(text) as Partial<LibraryMeta>;
    return {
      categories: Array.isArray(parsed.categories)
        ? [...new Set([...DEFAULT_CATEGORIES, ...parsed.categories])].sort((a, b) =>
            a.localeCompare(b)
          )
        : [...DEFAULT_CATEGORIES],
      uploaders: Array.isArray(parsed.uploaders)
        ? [...new Set([...DEFAULT_UPLOADERS, ...parsed.uploaders])].sort((a, b) =>
            a.localeCompare(b)
          )
        : [...DEFAULT_UPLOADERS],
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
    };
  } catch {
    return emptyMeta();
  }
}

async function writeMeta(meta: LibraryMeta): Promise<void> {
  await ensureDocsBucket();
  const supabase = createAdminClient();
  const body = JSON.stringify(meta, null, 2);
  const { error } = await supabase.storage.from(BUCKET).upload(META_PATH, body, {
    contentType: "application/json",
    upsert: true,
  });
  if (error) {
    throw new Error(`Save library index failed: ${error.message}`);
  }
}

export async function listCategories(): Promise<string[]> {
  const meta = await readMeta();
  return meta.categories;
}

export async function listUploaders(): Promise<string[]> {
  const meta = await readMeta();
  return meta.uploaders;
}

export async function ensureCategory(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");
  const meta = await readMeta();
  if (!meta.categories.includes(trimmed)) {
    meta.categories = [...meta.categories, trimmed].sort((a, b) =>
      a.localeCompare(b)
    );
    await writeMeta(meta);
  }
  return trimmed;
}

export async function ensureUploader(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Uploader name is required");
  const meta = await readMeta();
  if (!meta.uploaders.includes(trimmed)) {
    meta.uploaders = [...meta.uploaders, trimmed].sort((a, b) =>
      a.localeCompare(b)
    );
    await writeMeta(meta);
  }
  return trimmed;
}

export async function listDocuments(options?: {
  category?: string;
  q?: string;
}): Promise<TechDocListItem[]> {
  const meta = await readMeta();
  let docs = [...meta.documents].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
  );

  if (options?.category?.trim()) {
    const cat = options.category.trim();
    docs = docs.filter((d) => d.category === cat);
  }

  const q = options?.q?.trim().toLowerCase();
  if (q) {
    docs = docs.filter((d) => {
      const hay =
        `${d.title} ${d.description} ${d.category} ${d.uploadedBy} ${d.originalFilename}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const supabase = createAdminClient();
  const items = await Promise.all(
    docs.map(async (doc) => {
      const kind = getFileKind(doc.contentType, doc.originalFilename);
      let thumbnailUrl: string | null = null;

      // Prefer stored preview (PDF first page); images use the file itself
      const previewPath =
        doc.thumbnailPath ||
        (kind === "image" ? doc.storagePath : null);

      if (previewPath) {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(previewPath, THUMBNAIL_TTL_SECONDS);
        thumbnailUrl = data?.signedUrl || null;
      }

      return toListItem(doc, { thumbnailUrl });
    })
  );

  return items;
}

export async function getDocument(id: string): Promise<TechDoc | null> {
  const meta = await readMeta();
  return meta.documents.find((d) => d.id === id) || null;
}

function safeFileSegment(name: string) {
  return (
    name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "file"
  );
}

export async function uploadDocument(input: {
  title: string;
  category: string;
  description: string;
  uploadedBy: string;
  file: File | Blob;
  originalFilename: string;
  contentType?: string;
}): Promise<TechDocListItem> {
  const title = input.title.trim();
  if (!title) throw new Error("Document name is required");
  if (!input.file) throw new Error("File is required");

  const category = input.category.trim();
  const uploadedBy = input.uploadedBy.trim();
  if (!category) throw new Error("Category is required");
  if (!uploadedBy) throw new Error("Uploader is required");

  await ensureDocsBucket();
  const meta = await readMeta();

  if (!meta.categories.includes(category)) {
    meta.categories = [...meta.categories, category].sort((a, b) =>
      a.localeCompare(b)
    );
  }
  if (!meta.uploaders.includes(uploadedBy)) {
    meta.uploaders = [...meta.uploaders, uploadedBy].sort((a, b) =>
      a.localeCompare(b)
    );
  }

  const id = crypto.randomUUID();
  const originalFilename = input.originalFilename || "upload.bin";
  const safeName = safeFileSegment(originalFilename);
  const storagePath = `files/${safeFileSegment(category)}/${id}-${safeName}`;
  const contentType =
    input.contentType ||
    (input.file as File).type ||
    "application/octet-stream";
  const fileSize =
    typeof (input.file as File).size === "number"
      ? (input.file as File).size
      : 0;

  const supabase = createAdminClient();
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`File upload failed: ${uploadError.message}`);
  }

  let thumbnailPath: string | null = null;
  const kind = getFileKind(contentType, originalFilename);
  if (kind === "pdf") {
    try {
      thumbnailPath = await createAndUploadPdfThumbnail(id, buffer);
    } catch (err) {
      // Non-fatal: list will fall back to PDF badge
      console.error("PDF thumbnail generation failed:", err);
    }
  }

  const doc: TechDoc = {
    id,
    title,
    category,
    description: input.description || "",
    uploadedBy,
    storagePath,
    thumbnailPath,
    originalFilename,
    contentType,
    fileSize,
    createdAt: new Date().toISOString(),
  };

  meta.documents = [doc, ...meta.documents];
  try {
    await writeMeta(meta);
  } catch (err) {
    const cleanup = [storagePath];
    if (thumbnailPath) cleanup.push(thumbnailPath);
    await supabase.storage.from(BUCKET).remove(cleanup);
    throw err;
  }

  let thumbnailUrl: string | null = null;
  if (thumbnailPath) {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(thumbnailPath, THUMBNAIL_TTL_SECONDS);
    thumbnailUrl = data?.signedUrl || null;
  }

  return toListItem(doc, { thumbnailUrl });
}

async function createAndUploadPdfThumbnail(
  docId: string,
  pdfBuffer: Buffer
): Promise<string> {
  const { renderPdfFirstPagePng } = await import("./pdf-thumbnail");
  const png = await renderPdfFirstPagePng(pdfBuffer, {
    maxWidth: 320,
    scale: 1.25,
  });
  const thumbnailPath = `thumbs/${docId}.png`;
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(BUCKET).upload(thumbnailPath, png, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) {
    throw new Error(`Thumbnail upload failed: ${error.message}`);
  }
  return thumbnailPath;
}

/**
 * Generate missing PDF thumbnails for documents already in the library.
 * Returns how many were created.
 */
export async function backfillPdfThumbnails(): Promise<{
  processed: number;
  created: number;
  skipped: number;
  errors: string[];
}> {
  await ensureDocsBucket();
  const meta = await readMeta();
  const supabase = createAdminClient();
  let created = 0;
  let skipped = 0;
  let processed = 0;
  const errors: string[] = [];

  for (let i = 0; i < meta.documents.length; i++) {
    const doc = meta.documents[i];
    const kind = getFileKind(doc.contentType, doc.originalFilename);
    if (kind !== "pdf") {
      skipped++;
      continue;
    }
    if (doc.thumbnailPath) {
      skipped++;
      continue;
    }

    processed++;
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(doc.storagePath);
      if (error || !data) {
        throw new Error(error?.message || "download failed");
      }
      const bytes = Buffer.from(await data.arrayBuffer());
      const thumbnailPath = await createAndUploadPdfThumbnail(doc.id, bytes);
      meta.documents[i] = { ...doc, thumbnailPath };
      created++;
    } catch (err) {
      errors.push(
        `${doc.id} (${doc.title}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (created > 0) {
    await writeMeta(meta);
  }

  return { processed, created, skipped, errors };
}

export async function createSignedDownloadUrl(
  id: string,
  expiresInSeconds = 180
): Promise<{ url: string; filename: string; contentType: string }> {
  const doc = await getDocument(id);
  if (!doc) throw new Error("Document not found");

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not create download link");
  }

  return {
    url: data.signedUrl,
    filename: doc.originalFilename,
    contentType: doc.contentType,
  };
}

export async function deleteDocument(id: string): Promise<void> {
  const meta = await readMeta();
  const doc = meta.documents.find((d) => d.id === id);
  if (!doc) return;

  const supabase = createAdminClient();
  await supabase.storage.from(BUCKET).remove([doc.storagePath]);
  meta.documents = meta.documents.filter((d) => d.id !== id);
  await writeMeta(meta);
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
