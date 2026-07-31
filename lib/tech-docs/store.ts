import { createAdminClient } from "@/lib/supabase/admin";
import type { TechDoc, TechDocListItem } from "./types";

const BUCKET = "worship-tech-docs";
const META_PATH = "meta/library.json";

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

function toListItem(doc: TechDoc): TechDocListItem {
  const { storagePath: _storagePath, ...rest } = doc;
  return rest;
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

  return docs.map(toListItem);
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

  const doc: TechDoc = {
    id,
    title,
    category,
    description: input.description || "",
    uploadedBy,
    storagePath,
    originalFilename,
    contentType,
    fileSize,
    createdAt: new Date().toISOString(),
  };

  meta.documents = [doc, ...meta.documents];
  try {
    await writeMeta(meta);
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw err;
  }

  return toListItem(doc);
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
