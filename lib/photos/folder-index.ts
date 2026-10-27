import { listPhotoLibrary, photoRoot, relativePhotoPath, resolvePhotoPath } from "@/lib/dropbox/client";
import { ancestorPaths, bumpFolderStats, rollupFolderStats } from "@/lib/photos/folder-tree";
import type { FolderStat } from "@/lib/photos/types";
import { createAdminClient } from "@/lib/supabase/admin";

const INDEX_TTL_MS = 6 * 60 * 60 * 1000;

type CachedIndex = {
  runId: number | null;
  rootName: string;
  indexedAt: string;
  folders: FolderStat[];
};

type StatRow = {
  path: string;
  name: string;
  parent_path: string | null;
  photo_count: number | string;
  size_bytes: number | string;
};

let memory: CachedIndex | null = null;
let pending: Promise<CachedIndex> | null = null;

function rootNameFromEnv() {
  return photoRoot().split("/").filter(Boolean).pop() || "Photos";
}

export function normalizeFolderPath(input: string) {
  return relativePhotoPath(resolvePhotoPath(input));
}

async function selectStats(runId: number) {
  const supabase = createAdminClient();
  const pageSize = 1000;
  const rows: StatRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("worship_photo_folder_stats")
      .select("path, name, parent_path, photo_count, size_bytes")
      .eq("run_id", runId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as StatRow[]));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function readSavedIndex(): Promise<CachedIndex | null> {
  try {
    const supabase = createAdminClient();
    const { data: run, error } = await supabase
      .from("worship_photo_index_runs")
      .select("id, root_name, indexed_at")
      .eq("ready", true)
      .order("indexed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !run) return null;

    const rows = await selectStats(run.id);
    return {
      runId: run.id,
      rootName: run.root_name || rootNameFromEnv(),
      indexedAt: run.indexed_at,
      folders: rows.map((row) => ({
        path: row.path,
        name: row.name,
        parentPath: row.parent_path,
        photoCount: Number(row.photo_count) || 0,
        sizeBytes: Number(row.size_bytes) || 0,
      })),
    };
  } catch (error) {
    console.error("photo folder index read", error instanceof Error ? error.message : "failed");
    return null;
  }
}

async function saveIndex(index: CachedIndex) {
  const supabase = createAdminClient();
  const { data: run, error } = await supabase
    .from("worship_photo_index_runs")
    .insert({ root_name: index.rootName, ready: false })
    .select("id, indexed_at")
    .single();
  if (error || !run) throw error ?? new Error("Unable to save folder totals.");

  const rows = index.folders.map((folder) => ({
    run_id: run.id,
    path: folder.path,
    name: folder.name,
    parent_path: folder.parentPath,
    photo_count: folder.photoCount,
    size_bytes: folder.sizeBytes,
  }));

  for (let indexInRows = 0; indexInRows < rows.length; indexInRows += 400) {
    const { error: insertError } = await supabase
      .from("worship_photo_folder_stats")
      .insert(rows.slice(indexInRows, indexInRows + 400));
    if (insertError) throw insertError;
  }

  const { error: readyError } = await supabase.from("worship_photo_index_runs").update({ ready: true }).eq("id", run.id);
  if (readyError) throw readyError;

  await supabase.from("worship_photo_index_runs").delete().neq("id", run.id);

  memory = {
    runId: run.id,
    rootName: index.rootName,
    indexedAt: run.indexed_at,
    folders: index.folders,
  };
}

async function buildFromDropbox(): Promise<CachedIndex> {
  const library = await listPhotoLibrary();
  const rootName = rootNameFromEnv();
  return {
    runId: null,
    rootName,
    indexedAt: new Date().toISOString(),
    folders: rollupFolderStats({
      rootName,
      folders: library.folders,
      images: library.images,
    }),
  };
}

async function loadFolderIndex(refresh: boolean) {
  if (!refresh) {
    const saved = await readSavedIndex();
    if (saved && Date.now() - Date.parse(saved.indexedAt) < INDEX_TTL_MS) {
      memory = saved;
      return saved;
    }
  }

  const built = await buildFromDropbox();
  memory = built;

  try {
    await saveIndex(built);
  } catch (error) {
    console.error("photo folder index save", error instanceof Error ? error.message : "failed");
  }

  return memory;
}

export async function getFolderIndex(options?: { refresh?: boolean }) {
  const refresh = options?.refresh ?? false;
  if (!refresh && memory && Date.now() - Date.parse(memory.indexedAt) < INDEX_TTL_MS) return memory;
  if (!refresh && pending) return pending;

  const current = loadFolderIndex(refresh);
  pending = current;
  void current.finally(() => {
    if (pending === current) pending = null;
  });
  return current;
}

export async function bumpFolderIndex(folder: string, count: number, sizeBytes: number) {
  if (!Number.isInteger(count) || count < 0 || count > 500) {
    throw new Error("Unable to update folder totals.");
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0 || sizeBytes > 20 * 1024 * 1024 * 1024) {
    throw new Error("Unable to update folder totals.");
  }
  if (count === 0 && sizeBytes === 0) return { updated: false };

  if (pending) await pending;
  if (!memory) memory = await readSavedIndex();
  if (!memory) return { updated: false };

  const relativeFolder = normalizeFolderPath(folder);
  memory = {
    ...memory,
    folders: bumpFolderStats(memory.folders, relativeFolder, count, sizeBytes),
  };

  if (memory.runId == null) return { updated: true };

  try {
    const supabase = createAdminClient();
    const paths = ancestorPaths(relativeFolder);
    const { data, error } = await supabase
      .from("worship_photo_folder_stats")
      .select("path, photo_count, size_bytes")
      .eq("run_id", memory.runId)
      .in("path", paths);
    if (error || !data?.length) return { updated: true };

    await Promise.all(
      data.map((row) =>
        supabase
          .from("worship_photo_folder_stats")
          .update({
            photo_count: Number(row.photo_count) + count,
            size_bytes: Number(row.size_bytes) + sizeBytes,
          })
          .eq("run_id", memory?.runId ?? 0)
          .eq("path", row.path),
      ),
    );
  } catch (error) {
    console.error("photo folder bump", error instanceof Error ? error.message : "failed");
  }

  return { updated: true };
}
