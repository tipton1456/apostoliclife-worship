"use client";

import { useState } from "react";
import { formatBytes, formatDimensions, formatLocation, formatWhen } from "@/lib/photos/format";
import { tagSuggestions } from "@/lib/photos/tag-name";
import type { PersonSummary, PhotoDetails } from "@/lib/photos/types";

type PhotoDetailProps = {
  photo: PhotoDetails | null;
  tags: string[];
  people: PersonSummary[];
  previewUrl: string;
  rootName: string;
  loading: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onAdd: (tag: string) => Promise<boolean>;
  onRemove: (tag: string) => Promise<void>;
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 border-b border-white/10 py-2 text-sm">
      <dt className="text-neutral-400">{label}</dt>
      <dd className="break-words text-white">{value}</dd>
    </div>
  );
}

export default function PhotoDetail({
  photo,
  tags,
  people,
  previewUrl,
  rootName,
  loading,
  saving,
  error,
  onClose,
  onAdd,
  onRemove,
}: PhotoDetailProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [localError, setLocalError] = useState("");
  const suggestions = tagSuggestions(people, tags, query);
  const shownError = localError || error;
  const active = Math.min(highlight, Math.max(suggestions.length - 1, 0));

  async function choose(tag: string) {
    const key = tag.trim().toLocaleLowerCase("en");
    if (tags.some((current) => current.toLocaleLowerCase("en") === key)) {
      setLocalError("That person is already tagged on this photo.");
      return;
    }
    const canonical = people.find((person) => person.tag.toLocaleLowerCase("en") === key)?.tag ?? tag;
    const saved = await onAdd(canonical);
    if (saved) {
      setQuery("");
      setOpen(false);
      setLocalError("");
    }
  }

  const preview = photo ? previewUrl || `/api/photos/thumbnail?path=${encodeURIComponent(photo.path)}` : "";
  const dimensions = photo ? formatDimensions(photo.width, photo.height) : null;
  const location = photo ? formatLocation(photo.latitude, photo.longitude) : null;

  return (
    <aside
      className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,24rem)] shrink-0 flex-col border-l border-white/10 bg-neutral-950 shadow-2xl lg:static lg:w-96 lg:shadow-none"
      aria-label="Photo details"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7bbc07]">Details</h2>
        <button type="button" className="text-sm font-semibold text-neutral-300 hover:text-white" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading && !photo ? <p className="text-sm text-neutral-400">Loading photo details…</p> : null}
        {photo ? (
          <>
            {previewUrl ? (
              <a href={previewUrl} target="_blank" rel="noreferrer" className="block">
                {/* The full photo is a short-lived Dropbox link. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt={photo.name} className="max-h-64 w-full rounded-xl object-contain bg-black" />
              </a>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={preview} alt={photo.name} className="max-h-64 w-full rounded-xl object-contain bg-black" />
            )}
            <h3 className="mt-4 break-words text-lg font-semibold">{photo.name}</h3>
            <dl className="mt-3">
              <Fact label="Folder" value={photo.folder || rootName} />
              <Fact label="Size" value={formatBytes(photo.size)} />
              <Fact label="File date" value={formatWhen(photo.modified)} />
              <Fact label="Added" value={formatWhen(photo.savedAt)} />
              <Fact label="Taken" value={formatWhen(photo.taken)} />
              <Fact label="Dimensions" value={dimensions || "Not available"} />
              <Fact label="Location" value={location || "Not available"} />
            </dl>

            <div className="mt-6">
              <label htmlFor="person-tag" className="text-sm font-semibold">
                Add a person
              </label>
              <p className="mt-1 text-xs text-neutral-500">Start typing. Existing people show up so you can choose them.</p>
              <div className="relative mt-2">
                <input
                  id="person-tag"
                  name="person-tag"
                  value={query}
                  autoComplete="off"
                  disabled={saving}
                  placeholder="Name"
                  className="w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm outline-none focus:border-[#7bbc07]"
                  role="combobox"
                  aria-expanded={open && suggestions.length > 0}
                  aria-controls="person-tag-suggestions"
                  aria-autocomplete="list"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setHighlight(0);
                    setLocalError("");
                    setOpen(event.target.value.trim().length > 0);
                  }}
                  onFocus={() => setOpen(query.trim().length > 0)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setOpen(true);
                      setHighlight((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setHighlight((index) => Math.max(index - 1, 0));
                    } else if (event.key === "Escape") {
                      setOpen(false);
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      const chosen = suggestions[active];
                      if (chosen) void choose(chosen.tag);
                      else if (query.trim()) void choose(query);
                    }
                  }}
                />
                {open && suggestions.length > 0 ? (
                  <ul
                    id="person-tag-suggestions"
                    role="listbox"
                    className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 py-1 shadow-xl"
                  >
                    {suggestions.map((suggestion, index) => (
                      <li key={`${suggestion.create ? "new" : "have"}-${suggestion.tag}`} role="option" aria-selected={index === active}>
                        <button
                          type="button"
                          className={`block w-full px-3 py-2 text-left text-sm ${index === active ? "bg-white/10" : ""}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            void choose(suggestion.tag);
                          }}
                          onMouseEnter={() => setHighlight(index)}
                        >
                          {suggestion.create ? `Add “${suggestion.tag}”` : suggestion.tag}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {shownError ? <p className="mt-2 text-sm text-red-300">{shownError}</p> : null}
              {saving ? <p className="mt-2 text-sm text-neutral-400">Saving tag…</p> : null}

              <h4 className="mt-5 text-sm font-semibold">People in this photo</h4>
              {tags.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">No people are tagged in this photo yet.</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <li key={tag} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-sm">
                      <span>{tag}</span>
                      <button
                        type="button"
                        className="text-neutral-300 hover:text-white"
                        aria-label={`Remove ${tag}`}
                        onClick={() => void onRemove(tag)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
