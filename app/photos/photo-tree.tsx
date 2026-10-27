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
    <svg viewBox="0 0 20 20" className={`h-4 w-4 transition ${open ? "rotate-90" : ""}`} aria-hidden="true">
      <path
        d="M7 5l6 5-6 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
      <div className="flex items-start gap-1 pr-2" style={{ paddingLeft: 8 + depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            className="mt-1.5 rounded text-neutral-400 hover:text-white"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={isOpen}
            onClick={() => onToggle(node.path)}
          >
            <Chevron open={isOpen} />
          </button>
        ) : (
          <span className="mt-1.5 inline-block w-4" />
        )}
        <button
          type="button"
          className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left ${
            selected ? "bg-[#7bbc07]/15" : "hover:bg-white/5"
          }`}
          aria-current={selected ? "true" : undefined}
          title={totals}
          onClick={() => onSelectFolder(node.path)}
        >
          <span className="block truncate text-sm font-medium">{node.name}</span>
          <span className="mt-0.5 block text-xs tabular-nums text-neutral-400">
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
                  className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                    selected ? "bg-[#7bbc07]/15" : "hover:bg-white/5"
                  }`}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelectPerson(person.tag)}
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-[#7bbc07]" aria-hidden="true">
                    <circle cx="10" cy="7" r="3" fill="currentColor" />
                    <path
                      d="M4 16c1.2-2.4 3.4-3.5 6-3.5S14.8 13.6 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{person.tag}</span>
                    <span className="mt-0.5 block text-xs tabular-nums text-neutral-400">
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
