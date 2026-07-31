import { promises as fs } from "fs";
import { parseCsv, rowToAttendee } from "./csv";
import {
  getSeedCsvPath,
  insertNewAttendees,
  readStore,
} from "./store";
import type { AttendeeRecord, BigTopStore, UploadMergeResult } from "./types";

/**
 * If the store is empty and the seed CSV exists locally, import it once.
 * Never overwrites existing confirmation codes.
 * On Vercel/Supabase without a local CSV, store stays empty until UI upload.
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
