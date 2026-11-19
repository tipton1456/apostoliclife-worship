"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizePersonTag } from "@/lib/photos/tag-name";
import type { FolderStat, PersonSummary } from "@/lib/photos/types";

export type ManageStep = "options" | "delete" | "move" | "tag" | "convert" | null;

type PhotoManageDialogProps = {
  step: ManageStep;
  selectedCount: number;
  convertCount: number;
  canConvert: boolean;
  busy: string;
  people: PersonSummary[];
  folders: FolderStat[];
  currentFolder: string;
  rootName: string;
  onClose: () => void;
  onStep: (step: ManageStep) => void;
  onDelete: () => void;
  onMove: (destination: string) => void;
  onDownload: () => void;
  onTag: (tags: string[]) => void;
  onConvert: () => void;
};

function sameTag(left: string, right: string) {
  return left.toLocaleLowerCase("en") === right.toLocaleLowerCase("en");
}

export default function PhotoManageDialog({
  step,
  selectedCount,
  convertCount,
  canConvert,
  busy,
  people,
  folders,
  currentFolder,
  rootName,
  onClose,
  onStep,
  onDelete,
  onMove,
  onDownload,
  onTag,
  onConvert,
}: PhotoManageDialogProps) {
  useEffect(() => {
    if (!step || busy) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose, step]);

  if (!step) return null;

  const title =
    step === "delete"
      ? "Delete Selected Files"
      : step === "move"
        ? "Move Selected Files to another folder"
        : step === "tag"
          ? "Tag Selected Files"
          : step === "convert"
            ? "Convert RAW files to JPG"
            : "Choose options";

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-manage-title"
        className="al-card max-h-[min(40rem,100%)] w-full max-w-lg overflow-y-auto p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id="photo-manage-title" className="text-lg font-semibold">
            {title}
          </h3>
          <button type="button" className="text-sm font-semibold text-neutral-300 hover:text-white" onClick={onClose} disabled={Boolean(busy)}>
            Close
          </button>
        </div>

        {step === "options" ? (
          <div className="mt-4 grid gap-2">
            <OptionButton label="Delete Selected Files" onClick={() => onStep("delete")} disabled={Boolean(busy)} />
            <OptionButton label="Move Selected Files to another folder" onClick={() => onStep("move")} disabled={Boolean(busy)} />
            <OptionButton label="Download Selected Files" onClick={onDownload} disabled={Boolean(busy)} />
            <OptionButton label="Tag Selected Files" onClick={() => onStep("tag")} disabled={Boolean(busy)} />
            <OptionButton
              label="Convert RAW files to JPG"
              onClick={() => onStep("convert")}
              disabled={Boolean(busy) || !canConvert}
            />
          </div>
        ) : null}

        {step === "delete" ? (
          <div className="mt-4">
            <p className="text-sm text-neutral-300">
              Delete {selectedCount} selected file{selectedCount === 1 ? "" : "s"} from Dropbox? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl px-4 py-2 text-sm font-semibold text-neutral-300 hover:text-white" onClick={() => onStep("options")} disabled={Boolean(busy)}>
                Back
              </button>
              <button type="button" className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" onClick={onDelete} disabled={Boolean(busy)}>
                Delete Selected Files
              </button>
            </div>
          </div>
        ) : null}

        {step === "move" ? (
          <MovePanel
            folders={folders}
            currentFolder={currentFolder}
            rootName={rootName}
            busy={Boolean(busy)}
            onBack={() => onStep("options")}
            onMove={onMove}
          />
        ) : null}

        {step === "tag" ? <TagPanel people={people} busy={Boolean(busy)} onBack={() => onStep("options")} onTag={onTag} /> : null}

        {step === "convert" ? (
          <div className="mt-4">
            <p className="text-sm text-neutral-300">
              Convert {convertCount} RAW file{convertCount === 1 ? "" : "s"} to JPG and save {convertCount === 1 ? "it" : "them"} in this Dropbox folder.
              The original RAW files stay where they are. Only these files are read, not the rest of the library.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-neutral-300 hover:text-white"
                onClick={() => (selectedCount > 0 ? onStep("options") : onClose())}
                disabled={Boolean(busy)}
              >
                {selectedCount > 0 ? "Back" : "Cancel"}
              </button>
              <button
                type="button"
                className="rounded-xl al-fill px-4 py-2 text-sm font-semibold text-[#101536] disabled:opacity-60"
                onClick={onConvert}
                disabled={Boolean(busy) || convertCount === 0}
              >
                Convert to JPG
              </button>
            </div>
          </div>
        ) : null}

        {busy ? <p className="mt-4 text-sm text-[#c9d3f7]">{busy}</p> : null}
      </div>
    </div>
  );
}

function MovePanel({
  folders,
  currentFolder,
  rootName,
  busy,
  onBack,
  onMove,
}: {
  folders: FolderStat[];
  currentFolder: string;
  rootName: string;
  busy: boolean;
  onBack: () => void;
  onMove: (destination: string) => void;
}) {
  const [folderQuery, setFolderQuery] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const folderChoices = useMemo(() => {
    const query = folderQuery.trim().toLocaleLowerCase("en");
    return [...folders]
      .sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "base" }))
      .filter((folder) => {
        const label = folder.path || rootName;
        return !query || label.toLocaleLowerCase("en").includes(query);
      });
  }, [folderQuery, folders, rootName]);

  return (
    <div className="mt-4">
      <label htmlFor="move-folder-search" className="text-sm font-semibold">
        Folder
      </label>
      <input
        id="move-folder-search"
        value={folderQuery}
        placeholder="Search folders"
        className="mt-2 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm outline-none focus:border-[#93a9f5]"
        onChange={(event) => setFolderQuery(event.target.value)}
      />
      <ul className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-white/10">
        {folderChoices.map((folder) => {
          const label = folder.path || rootName;
          const here = folder.path === currentFolder;
          const active = destination === folder.path;
          return (
            <li key={folder.path || "root"}>
              <button
                type="button"
                disabled={here || busy}
                className={`block w-full truncate px-3 py-2 text-left text-sm ${active ? "bg-[#7f98f0]/20 text-white" : "hover:bg-white/5"} disabled:text-neutral-600`}
                style={{ paddingLeft: 12 + Math.max(label.split("/").length - 1, 0) * 12 }}
                onClick={() => setDestination(folder.path)}
              >
                {label}
                {here ? " (current folder)" : ""}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="rounded-xl px-4 py-2 text-sm font-semibold text-neutral-300 hover:text-white" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button
          type="button"
          className="rounded-xl al-fill px-4 py-2 text-sm font-semibold text-[#101536] disabled:opacity-60"
          disabled={destination === null || destination === currentFolder || busy}
          onClick={() => {
            if (destination !== null) onMove(destination);
          }}
        >
          Move selected files
        </button>
      </div>
    </div>
  );
}

function TagPanel({
  people,
  busy,
  onBack,
  onTag,
}: {
  people: PersonSummary[];
  busy: boolean;
  onBack: () => void;
  onTag: (tags: string[]) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [tagError, setTagError] = useState("");

  function addTypedTag() {
    const normalized = normalizePersonTag(tagQuery);
    if (!normalized) {
      setTagError("Use letters, numbers, spaces, apostrophes, or hyphens.");
      return;
    }
    const existing = people.find((person) => sameTag(person.tag, normalized.tag));
    const tag = existing?.tag ?? normalized.tag;
    setChosen((current) => (current.some((item) => sameTag(item, tag)) ? current : [...current, tag]));
    setTagQuery("");
    setTagError("");
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-neutral-400">Choose the people to add to the selected photos.</p>
      <ul className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-white/10">
        {people.length === 0 ? <li className="px-3 py-2 text-sm text-neutral-500">No people have been tagged yet.</li> : null}
        {people.map((person) => {
          const checked = chosen.some((tag) => sameTag(tag, person.tag));
          return (
            <li key={person.tag}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-white/5">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#7f98f0]"
                  checked={checked}
                  onChange={() =>
                    setChosen((current) => (checked ? current.filter((tag) => !sameTag(tag, person.tag)) : [...current, person.tag]))
                  }
                />
                <span>{person.tag}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          value={tagQuery}
          placeholder="Add a person"
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black px-3 py-2 text-sm outline-none focus:border-[#93a9f5]"
          onChange={(event) => {
            setTagQuery(event.target.value);
            setTagError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTypedTag();
            }
          }}
        />
        <button type="button" className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold" onClick={addTypedTag}>
          Add
        </button>
      </div>
      {tagError ? <p className="mt-2 text-sm text-red-300">{tagError}</p> : null}
      {chosen.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {chosen.map((tag) => (
            <li key={tag} className="rounded-full bg-white/10 px-3 py-1 text-sm">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="rounded-xl px-4 py-2 text-sm font-semibold text-neutral-300 hover:text-white" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button
          type="button"
          className="rounded-xl al-fill px-4 py-2 text-sm font-semibold text-[#101536] disabled:opacity-60"
          disabled={chosen.length === 0 || busy}
          onClick={() => onTag(chosen)}
        >
          Add tags
        </button>
      </div>
    </div>
  );
}

function OptionButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className="rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-semibold hover:bg-white/5 disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
