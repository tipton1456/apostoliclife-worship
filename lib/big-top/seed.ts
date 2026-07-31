import { promises as fs } from "fs";
import { parseCsv, rowToAttendee } from "./csv";
import { hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import {
  getSeedCsvPath,
  insertNewAttendees,
  isServerlessRuntime,
  readStore,
} from "./store";
import type { AttendeeRecord, BigTopStore, UploadMergeResult } from "./types";

/**
 * If the store is empty and a local seed CSV exists, import it once.
 * On Vercel/Supabase: never touch the filesystem — data already lives in Supabase
 * (or is uploaded via the UI).
 */
export async function ensureSeededStore(): Promise<{
  store: BigTopStore;
  seeded: boolean;
  merge?: UploadMergeResult;
}> {
  const store = await readStore();
  const count = Object.keys(store.attendees).length;
  if (count > 0) {
    return { store, seeded: false };
  }

  // Serverless / remote backends: do not mkdir or read local CSV.
  if (
    isServerlessRuntime() ||
    hasSupabaseAdminConfig() ||
    Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim())
  ) {
    return { store, seeded: false };
  }

  try {
    const csvText = await fs.readFile(getSeedCsvPath(), "utf8");
    const rows = parseCsv(csvText);
    const nowIso = new Date().toISOString();
    const toInsert: AttendeeRecord[] = [];
    let invalidRows = 0;

    for (const row of rows) {
      const attendee = rowToAttendee(row, nowIso);
      if (!attendee) {
        invalidRows++;
        continue;
      }
      toInsert.push(attendee);
    }

    const added = await insertNewAttendees(toInsert);
    const refreshed = await readStore();

    return {
      store: refreshed,
      seeded: added > 0,
      merge: {
        added,
        skippedExisting: 0,
        totalInFile: rows.length,
        totalInStore: Object.keys(refreshed.attendees).length,
        invalidRows,
      },
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { store, seeded: false };
    }
    throw err;
  }
}
