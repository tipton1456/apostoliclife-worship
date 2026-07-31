import { promises as fs } from "fs";
import path from "path";
import {
  getSupabaseConfigDiagnostics,
  hasSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import {
  emptyStore,
  normalizeStore,
} from "./persistence-shared";
import type {
  AttendeeRecord,
  BigTopStore,
  DayCheckIn,
  EventDay,
} from "./types";

export { emptyStore, normalizeStore } from "./persistence-shared";

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

export type StorageBackend = "supabase" | "blob" | "filesystem";

/** True on Vercel / AWS Lambda — never use local disk for durable store. */
export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT
  );
}

/**
 * Prefer Supabase (shared church DB), then Blob.
 * Filesystem only for local laptop dev — never on Vercel.
 */
export function storageBackend(): StorageBackend {
  if (hasSupabaseAdminConfig()) return "supabase";
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return "blob";
  if (isServerlessRuntime()) {
    const d = getSupabaseConfigDiagnostics();
    throw new Error(
      `Big Top storage is not configured on Vercel (hasUrl=${d.hasUrl}, hasServiceRoleKey=${d.hasServiceRoleKey}, vercelEnv=${d.vercelEnv}, keys=${d.relatedKeyNames.join("|") || "none"}). Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for Production, then Redeploy. Debug: /api/big-top/health`
    );
  }
  return "filesystem";
}

export function useSupabaseStorage(): boolean {
  return storageBackend() === "supabase";
}

export function useBlobStorage(): boolean {
  return storageBackend() === "blob";
}

async function ensureDataDir() {
  if (isServerlessRuntime()) {
    throw new Error(
      "Cannot write local Big Top data on Vercel. Configure Supabase env vars instead."
    );
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStoreFromFilesystem(): Promise<BigTopStore> {
  // Do not mkdir on read — Vercel (and empty local trees) must not create paths.
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
  const backend = storageBackend();
  if (backend === "supabase") {
    const { readStoreFromSupabase } = await import("./supabase-store");
    return readStoreFromSupabase();
  }
  if (backend === "blob") {
    return readStoreFromBlob();
  }
  return readStoreFromFilesystem();
}

/**
 * Full store write — used by filesystem/blob backends.
 * For Supabase, prefer insertNewAttendees + setDayCheckIn (avoids race overwrites).
 */
export async function writeStore(store: BigTopStore): Promise<void> {
  const backend = storageBackend();

  if (backend === "supabase") {
    const {
      insertNewAttendeesToSupabase,
      setDayCheckInInSupabase,
      readStoreFromSupabase,
    } = await import("./supabase-store");

    const existing = await readStoreFromSupabase();
    const toInsert: AttendeeRecord[] = [];

    for (const a of Object.values(store.attendees)) {
      if (!existing.attendees[a.confirmationCode]) {
        toInsert.push(a);
      }
    }
    if (toInsert.length) {
      await insertNewAttendeesToSupabase(toInsert);
    }

    for (const a of Object.values(store.attendees)) {
      const prev = existing.attendees[a.confirmationCode];
      const days: EventDay[] = ["2026-08-01", "2026-08-02"];
      for (const day of days) {
        const next = a.checkIns[day] ?? null;
        const before = prev?.checkIns[day] ?? null;
        const same =
          (!next && !before) ||
          (next &&
            before &&
            next.at === before.at &&
            next.method === before.method);
        if (same) continue;
        await setDayCheckInInSupabase(a.confirmationCode, day, next);
      }
    }

    store.updatedAt = new Date().toISOString();
    return;
  }

  if (backend === "blob") {
    await writeStoreToBlob(store);
    return;
  }

  await writeStoreToFilesystem(store);
}

/** Insert only new confirmation codes (all backends). */
export async function insertNewAttendees(
  attendees: AttendeeRecord[]
): Promise<number> {
  if (attendees.length === 0) return 0;

  if (storageBackend() === "supabase") {
    const { insertNewAttendeesToSupabase } = await import("./supabase-store");
    return insertNewAttendeesToSupabase(attendees);
  }

  const store = await readStore();
  let added = 0;
  for (const a of attendees) {
    if (store.attendees[a.confirmationCode]) continue;
    store.attendees[a.confirmationCode] = a;
    added++;
  }
  if (added) await writeStore(store);
  return added;
}

/** Set or clear a single day check-in (all backends). Concurrent-safe on Supabase. */
export async function setDayCheckIn(
  confirmationCode: string,
  day: EventDay,
  checkIn: DayCheckIn | null
): Promise<void> {
  if (storageBackend() === "supabase") {
    const { setDayCheckInInSupabase } = await import("./supabase-store");
    await setDayCheckInInSupabase(confirmationCode, day, checkIn);
    return;
  }

  const store = await readStore();
  const record = store.attendees[confirmationCode];
  if (!record) {
    throw new Error("Attendee not found");
  }
  if (checkIn) {
    record.checkIns[day] = checkIn;
  } else {
    delete record.checkIns[day];
  }
  await writeStore(store);
}
