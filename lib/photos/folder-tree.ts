import type { FolderStat } from "./types";

export type FolderNode = FolderStat & { children: FolderNode[] };

type Acc = {
  path: string;
  name: string;
  parentPath: string | null;
  directCount: number;
  directSize: number;
};

export function ancestorPaths(folder: string) {
  const paths: string[] = [];
  let current = folder;

  while (true) {
    paths.push(current);
    if (!current) break;
    const slash = current.lastIndexOf("/");
    current = slash === -1 ? "" : current.slice(0, slash);
  }

  return paths;
}

export function rollupFolderStats(input: {
  rootName: string;
  folders: { path: string; name: string }[];
  images: { path: string; size: number; photo?: boolean }[];
}): FolderStat[] {
  const nodes = new Map<string, Acc>();

  function ensure(path: string, name?: string) {
    const existing = nodes.get(path);
    if (existing) {
      if (name) existing.name = name;
      return;
    }

    const parentPath = path === "" ? null : path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    nodes.set(path, {
      path,
      name: name || (path === "" ? input.rootName : path.slice(path.lastIndexOf("/") + 1)),
      parentPath,
      directCount: 0,
      directSize: 0,
    });

    if (parentPath !== null) ensure(parentPath);
  }

  ensure("");

  for (const folder of input.folders) {
    if (folder.path) ensure(folder.path, folder.name);
  }

  for (const image of input.images) {
    const folder = image.path.includes("/") ? image.path.slice(0, image.path.lastIndexOf("/")) : "";
    ensure(folder);
    const node = nodes.get(folder);
    if (!node) continue;
    if (image.photo !== false) node.directCount += 1;
    node.directSize += image.size > 0 ? image.size : 0;
  }

  const children = new Map<string, string[]>();
  for (const node of nodes.values()) {
    if (node.parentPath === null) continue;
    const list = children.get(node.parentPath) ?? [];
    list.push(node.path);
    children.set(node.parentPath, list);
  }

  const memo = new Map<string, { count: number; size: number }>();

  function total(path: string): { count: number; size: number } {
    const saved = memo.get(path);
    if (saved) return saved;

    const node = nodes.get(path);
    if (!node) return { count: 0, size: 0 };

    let count = node.directCount;
    let size = node.directSize;
    for (const child of children.get(path) ?? []) {
      const sub = total(child);
      count += sub.count;
      size += sub.size;
    }

    const result = { count, size };
    memo.set(path, result);
    return result;
  }

  return [...nodes.values()].map((node) => {
    const summed = total(node.path);
    return {
      path: node.path,
      name: node.name,
      parentPath: node.parentPath,
      photoCount: summed.count,
      sizeBytes: summed.size,
    };
  });
}

export function buildFolderTree(folders: FolderStat[]): FolderNode | null {
  if (!folders.length) return null;

  const byPath = new Map<string, FolderNode>();
  for (const folder of folders) {
    byPath.set(folder.path, { ...folder, children: [] });
  }

  const root = byPath.get("") ?? null;
  if (!root) return null;

  for (const folder of folders) {
    const node = byPath.get(folder.path);
    if (!node || folder.path === "") continue;
    const parent = byPath.get(folder.parentPath || "");
    if (parent && parent !== node) parent.children.push(node);
    else root.children.push(node);
  }

  for (const node of byPath.values()) {
    node.children.sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
  }

  return root;
}

export function findFolder(node: FolderNode | null, path: string): FolderNode | null {
  if (!node) return null;
  if (node.path === path) return node;

  for (const child of node.children) {
    const found = findFolder(child, path);
    if (found) return found;
  }

  return null;
}

export function bumpFolderStats(folders: FolderStat[], folder: string, count: number, sizeBytes: number) {
  if (!folders.length || (count === 0 && sizeBytes === 0)) return folders;

  const paths = new Set(ancestorPaths(folder));
  let matched = false;
  const next = folders.map((item) => {
    if (!paths.has(item.path)) return item;
    matched = true;
    return {
      ...item,
      photoCount: item.photoCount + count,
      sizeBytes: item.sizeBytes + sizeBytes,
    };
  });

  return matched ? next : folders;
}
