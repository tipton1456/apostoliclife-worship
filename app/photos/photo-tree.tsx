"use client";

import { formatBytes, formatPhotoCount, formatWhen } from "@/lib/photos/format";
import type { FolderNode } from "@/lib/photos/folder-tree";
import type { PersonSummary } from "@/lib/photos/types";

export type PhotoBrowserMode = { type: "folder"; path: string } | { type: "person"; tag: string };

type PhotoTreeProps = {
  root: FolderNode | null;
  indexedAt: string | null;
  loading: boolean;
  mode: PhotoBrowserMode;
  expanded: Record<string, boolean>;
  people: PersonSummary[];
  peopleError: string;
  error: string;
  onToggle: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onSelectPerson: (tag: string) => void;
  onRefresh: () => void;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`h-2.5 w-2.5 ${open ? "rotate-90" : ""}`} aria-hidden="true">
      <path d="M3.2 1.6 8.8 6 3.2 10.4z" fill="currentColor" />
    </svg>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
        <path fill="#E8B84A" d="M1 3.2h4.3l1.1 1.1H15v1.4H1.4z" />
        <path fill="#F8D56A" d="M1.1 6.6 2.3 13h12.2l1.3-6.4z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path fill="#E8B84A" d="M1.2 3.1h4.5l1.2 1.3H14.8V13H1.2z" />
      <path fill="#F8D56A" d="M1.2 5.3h13.6V13H1.2z" />
    </svg>
  );
}

function FolderBranch({
  node,
  depth,
  mode,
  expanded,
  onToggle,
  onSelectFolder,
}: {
  node: FolderNode;
  depth: number;
  mode: PhotoBrowserMode;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
  onSelectFolder: (path: string) => void;
}) {
  const isOpen = Boolean(expanded[node.path]);
  const selected = mode.type === "folder" && mode.path === node.path;
  const hasChildren = node.children.length > 0;
  const totals = `${formatPhotoCount(node.photoCount)} · ${formatBytes(node.sizeBytes)} including subfolders`;

  return (
    <div>
      <div
        className={`flex items-center pr-2 ${selected ? "bg-white/10" : "hover:bg-white/[0.06]"}`}
        style={{ paddingLeft: 4 + depth * 16 }}
        role="treeitem"
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-selected={selected}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex h-7 w-4 shrink-0 items-center justify-center text-neutral-400 hover:text-white"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={() => onToggle(node.path)}
          >
            <Chevron open={isOpen} />
          </button>
        ) : (
          <span className="inline-block w-4 shrink-0" />
        )}
        <button
          type="button"
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 text-left font-normal"
          aria-current={selected ? "true" : undefined}
          title={totals}
          onClick={() => onSelectFolder(node.path)}
        >
          <FolderIcon open={isOpen && hasChildren} />
          <span className="truncate text-[13px] font-normal text-neutral-100">{node.name}</span>
          <span className="ml-auto shrink-0 pl-2 text-[11px] font-normal tabular-nums text-neutral-500">
            {formatPhotoCount(node.photoCount)} · {formatBytes(node.sizeBytes)}
          </span>
        </button>
      </div>
      {hasChildren && isOpen
        ? node.children.map((child) => (
            <FolderBranch
              key={child.path}
              node={child}
              depth={depth + 1}
              mode={mode}
              expanded={expanded}
              onToggle={onToggle}
              onSelectFolder={onSelectFolder}
            />
          ))
        : null}
    </div>
  );
}

export default function PhotoTree({
  root,
  indexedAt,
  loading,
  mode,
  expanded,
  people,
  peopleError,
  error,
  onToggle,
  onSelectFolder,
  onSelectPerson,
  onRefresh,
}: PhotoTreeProps) {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-white/10" aria-label="Photo folders">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <p className="text-xs uppercase tracking-[0.16em] text-[#7bbc07]">Folders</p>
        <button
          type="button"
          className="text-xs font-semibold text-neutral-300 hover:text-white disabled:opacity-50"
          disabled={loading}
          onClick={onRefresh}
        >
          {loading ? "Counting…" : "Refresh totals"}
        </button>
      </div>
      <p className="px-3 pb-2 text-xs text-neutral-500">
        Counts include photos in subfolders, including camera raw. Sizes include every file.
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4" role="tree">
        {error ? <p className="px-3 text-sm text-red-300">{error}</p> : null}
        {loading && !root ? <p className="px-3 text-sm text-neutral-400">Counting photos and folder sizes…</p> : null}
        {root ? (
          <FolderBranch
            node={root}
            depth={0}
            mode={mode}
            expanded={expanded}
            onToggle={onToggle}
            onSelectFolder={onSelectFolder}
          />
        ) : null}

        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="px-3 text-xs uppercase tracking-[0.16em] text-[#7bbc07]">People</p>
          {peopleError ? <p className="px-3 pt-2 text-sm text-red-300">{peopleError}</p> : null}
          {people.length === 0 && !peopleError ? (
            <p className="px-3 pt-2 text-sm text-neutral-500">Tag a photo to add a person here.</p>
          ) : null}
          <div className="mt-1">
            {people.map((person) => {
              const selected = mode.type === "person" && mode.tag === person.tag;
              return (
                <button
                  key={person.tag}
                  type="button"
                  className={`flex h-7 w-full items-center pr-2 text-left font-normal ${
                    selected ? "bg-white/10" : "hover:bg-white/[0.06]"
                  }`}
                  style={{ paddingLeft: 4 }}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelectPerson(person.tag)}
                >
                  <span className="inline-block w-4 shrink-0" />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <FolderIcon open={selected} />
                    <span className="truncate text-[13px] font-normal text-neutral-100">{person.tag}</span>
                    <span className="ml-auto shrink-0 pl-2 text-[11px] font-normal tabular-nums text-neutral-500">
                      {formatPhotoCount(person.count)} · {formatBytes(person.sizeBytes)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {indexedAt ? (
        <p className="border-t border-white/10 px-3 py-2 text-xs text-neutral-500">Totals updated {formatWhen(indexedAt)}</p>
      ) : null}
    </aside>
  );
}
