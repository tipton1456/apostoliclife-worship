import { promises as fs } from "fs";
import path from "path";
import {
  BIG_TOP_EVENT_ID,
  BIG_TOP_EVENT_NAME,
  type BigTopStore,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "tithely");
const STORE_PATH = path.join(DATA_DIR, "big-top-store.json");
const SEED_CSV_PATH = path.join(DATA_DIR, "big-top-back-to-school-bash.csv");
const BLOB_STORE_PATHNAME = "big-top/store.json";

export function getStorePath() {
  return STORE_PATH;
}

export function getSeedCsvPath() {
  return SEED_CSV_PATH;
}

export function emptyStore(): BigTopStore {
  return {
    eventId: BIG_TOP_EVENT_ID,
    eventName: BIG_TOP_EVENT_NAME,
    updatedAt: new Date().toISOString(),
    attendees: {},
  };
}

export function normalizeStore(parsed: Partial<BigTopStore> | null): BigTopStore {
  if (!parsed || typeof parsed !== "object" || !parsed.attendees) {
    return emptyStore();
  }
  return {
    eventId: parsed.eventId || BIG_TOP_EVENT_ID,
    eventName: parsed.eventName || BIG_TOP_EVENT_NAME,
    updatedAt: parsed.updatedAt || new Date().toISOString(),
    attendees: parsed.attendees,
  };
}

/** Prefer Vercel Blob when token is present (production on Vercel). */
export function useBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function storageBackend(): "blob" | "filesystem" {
  return useBlobStorage() ? "blob" : "filesystem";
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStoreFromFilesystem(): Promise<BigTopStore> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return normalizeStore(JSON.parse(raw) as BigTopStore);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyStore();
    throw err;
  }
}

async function writeStoreToFilesystem(store: BigTopStore): Promise<void> {
  await ensureDataDir();
  store.updatedAt = new Date().toISOString();
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, STORE_PATH);
}

async function streamToString(
  stream: ReadableStream<Uint8Array> | null
): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}

async function readStoreFromBlob(): Promise<BigTopStore> {
  const { get } = await import("@vercel/blob");
  const result = await get(BLOB_STORE_PATHNAME, {
    access: "private",
    useCache: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  if (!result) return emptyStore();

  const raw = await streamToString(result.stream);
  if (!raw.trim()) return emptyStore();
  return normalizeStore(JSON.parse(raw) as BigTopStore);
}

async function writeStoreToBlob(store: BigTopStore): Promise<void> {
  const { put } = await import("@vercel/blob");
  store.updatedAt = new Date().toISOString();
  await put(BLOB_STORE_PATHNAME, JSON.stringify(store), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function readStore(): Promise<BigTopStore> {
  if (useBlobStorage()) {
    return readStoreFromBlob();
  }
  return readStoreFromFilesystem();
}

export async function writeStore(store: BigTopStore): Promise<void> {
  if (useBlobStorage()) {
    await writeStoreToBlob(store);
    return;
  }
  await writeStoreToFilesystem(store);
}
