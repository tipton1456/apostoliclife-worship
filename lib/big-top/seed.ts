import { promises as fs } from "fs";
import { mergeCsvIntoStore } from "./csv";
import {
  getSeedCsvPath,
  readStore,
  writeStore,
} from "./store";
import type { BigTopStore, UploadMergeResult } from "./types";

/**
 * If the store is empty and the seed CSV exists, import it once.
 * Never overwrites existing confirmation codes.
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
    const merge = mergeCsvIntoStore(store, csvText);
    await writeStore(store);
    return { store, seeded: true, merge };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { store, seeded: false };
    }
    throw err;
  }
}
