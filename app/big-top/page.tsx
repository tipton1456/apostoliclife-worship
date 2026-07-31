"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

type DayKey = "2026-08-01" | "2026-08-02";

type DayCheckIn = {
  at: string;
  method: "scan" | "manual";
};

type Attendee = {
  confirmationCode: string;
  ticket: string;
  registrantName: string;
  attendeeName: string;
  birthDate: string;
  phoneNumber: string;
  backpack: string;
  homeChurch: string;
  homeChurchWhere: string;
  checkInDay1: DayCheckIn | null;
  checkInDay2: DayCheckIn | null;
  needsBackpack: boolean;
};

type DayStats = {
  day: DayKey;
  label: string;
  checkedIn: number;
  remaining: number;
  adults: number;
  children: number;
  backpacks: number;
};

type Stats = {
  total: number;
  adults: number;
  children: number;
  backpackNeeded: number;
  days: DayStats[];
  updatedAt: string;
};

type CheckInResult = {
  ok?: boolean;
  error?: string;
  alreadyCheckedIn?: boolean;
  undone?: boolean;
  day?: DayKey;
  message?: string;
  attendee?: Attendee;
  stats?: Stats;
  confirmationCode?: string;
};

type UploadResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  merge?: {
    added: number;
    skippedExisting: number;
    totalInFile: number;
    totalInStore: number;
    invalidRows: number;
  };
  stats?: Stats;
};

const DAYS: { key: DayKey; short: string; label: string }[] = [
  { key: "2026-08-01", short: "Sat Aug 1", label: "Saturday, August 1" },
  { key: "2026-08-02", short: "Sun Aug 2", label: "Sunday, August 2" },
];

function defaultDay(): DayKey {
  try {
    const central = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })
    );
    const y = central.getFullYear();
    const m = String(central.getMonth() + 1).padStart(2, "0");
    const d = String(central.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${d}`;
    if (key === "2026-08-02") return "2026-08-02";
    if (key > "2026-08-01") return "2026-08-02";
  } catch {
    /* ignore */
  }
  return "2026-08-01";
}

function formatTime(iso: string | undefined | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function checkInForDay(attendee: Attendee, day: DayKey): DayCheckIn | null {
  return day === "2026-08-01" ? attendee.checkInDay1 : attendee.checkInDay2;
}

const ACCESS_STORAGE_KEY = "big-top-access-code";

function loadStoredAccessCode(): string {
  try {
    return sessionStorage.getItem(ACCESS_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveStoredAccessCode(code: string) {
  try {
    if (code) sessionStorage.setItem(ACCESS_STORAGE_KEY, code);
    else sessionStorage.removeItem(ACCESS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export default function BigTopCheckInPage() {
  const [day, setDay] = useState<DayKey>(defaultDay);
  const [scanValue, setScanValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Attendee[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"ok" | "warn" | "error" | "info">(
    "info"
  );
  const [busy, setBusy] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessReady, setAccessReady] = useState(false);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [storageLabel, setStorageLabel] = useState<string>("");

  const scanRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const authHeaders = useCallback(
    (extra?: HeadersInit): HeadersInit => {
      const headers: Record<string, string> = {};
      if (accessCode.trim()) {
        headers["x-big-top-code"] = accessCode.trim();
      }
      if (extra) {
        Object.assign(headers, extra);
      }
      return headers;
    },
    [accessCode]
  );

  const refreshStats = useCallback(async () => {
    const res = await fetch("/api/big-top/attendees?mode=all", {
      headers: authHeaders(),
    });
    const data = await res.json();

    if (res.status === 401) {
      setNeedsAccess(true);
      setAccessReady(false);
      setAccessError("Staff access code required");
      return;
    }

    setNeedsAccess(Boolean(data.accessRequired));
    setAccessReady(true);
    setAccessError(null);
    if (data.storage) setStorageLabel(String(data.storage));
    if (data.stats) setStats(data.stats);
    if (data.seeded && data.seedMerge) {
      setStatusMessage(
        `Loaded seed CSV: ${data.seedMerge.added} attendees imported.`
      );
      setStatusTone("info");
    }
    if (data.stats?.total === 0) {
      setStatusMessage(
        "No attendees loaded yet. Upload your Tithely CSV below to get started."
      );
      setStatusTone("info");
    }
  }, [authHeaders]);

  useEffect(() => {
    setAccessCode(loadStoredAccessCode());
  }, []);

  useEffect(() => {
    // Wait one tick so accessCode from sessionStorage can apply
    const t = setTimeout(() => {
      refreshStats().catch(() => {
        setStatusMessage("Could not load attendee store.");
        setStatusTone("error");
        setAccessReady(true);
      });
    }, 0);
    return () => clearTimeout(t);
  }, [refreshStats]);

  useEffect(() => {
    if (!accessReady || !searchQuery.trim()) {
      if (!searchQuery.trim()) setSearchResults([]);
      return;
    }

    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/big-top/attendees?q=${encodeURIComponent(searchQuery.trim())}`,
          { headers: authHeaders() }
        );
        const data = await res.json();
        if (res.status === 401) {
          setNeedsAccess(true);
          setAccessReady(false);
          return;
        }
        setSearchResults(data.attendees || []);
        if (data.stats) setStats(data.stats);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => clearTimeout(handle);
  }, [searchQuery, accessReady, authHeaders]);

  async function runCheckIn(payload: {
    scan?: string;
    confirmationCode?: string;
    method: "scan" | "manual";
    force?: boolean;
    undo?: boolean;
  }) {
    setBusy(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/big-top/check-in", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...payload,
          day,
        }),
      });
      const data = (await res.json()) as CheckInResult;

      if (!res.ok) {
        setLastResult(data);
        setStatusTone("error");
        setStatusMessage(data.error || "Check-in failed");
        return data;
      }

      setLastResult(data);
      if (data.stats) setStats(data.stats);

      if (data.undone) {
        setStatusTone("info");
        setStatusMessage(data.message || "Check-in removed");
      } else if (data.alreadyCheckedIn) {
        setStatusTone("warn");
        setStatusMessage(data.message || "Already checked in for this day");
      } else {
        setStatusTone("ok");
        setStatusMessage(data.message || "Checked in");
      }

      // refresh search results so badges update
      if (searchQuery.trim()) {
        const sres = await fetch(
          `/api/big-top/attendees?q=${encodeURIComponent(searchQuery.trim())}`,
          { headers: authHeaders() }
        );
        const sdata = await sres.json();
        setSearchResults(sdata.attendees || []);
      }

      return data;
    } catch {
      setStatusTone("error");
      setStatusMessage("Network error during check-in");
      return null;
    } finally {
      setBusy(false);
      scanRef.current?.focus();
    }
  }

  async function handleScanSubmit(e: FormEvent) {
    e.preventDefault();
    const value = scanValue.trim();
    if (!value || busy) return;
    await runCheckIn({ scan: value, method: "scan" });
    setScanValue("");
  }

  async function handleManualCheckIn(attendee: Attendee) {
    const existing = checkInForDay(attendee, day);
    if (existing) {
      const ok = window.confirm(
        `${attendee.attendeeName} is already checked in for this day (${formatTime(existing.at)}). Check in again and update the time?`
      );
      if (!ok) return;
      await runCheckIn({
        confirmationCode: attendee.confirmationCode,
        method: "manual",
        force: true,
      });
      return;
    }
    await runCheckIn({
      confirmationCode: attendee.confirmationCode,
      method: "manual",
    });
  }

  async function handleUndo(attendee: Attendee) {
    const existing = checkInForDay(attendee, day);
    if (!existing) return;
    const ok = window.confirm(
      `Remove ${attendee.attendeeName}'s check-in for this day?`
    );
    if (!ok) return;
    await runCheckIn({
      confirmationCode: attendee.confirmationCode,
      method: "manual",
      undo: true,
    });
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setUploadMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/big-top/upload", {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const data = (await res.json()) as UploadResult;
      if (!res.ok) {
        setUploadMessage(data.error || "Upload failed");
        setStatusTone("error");
        return;
      }
      if (data.stats) setStats(data.stats);
      setUploadMessage(data.message || "Upload complete");
      setStatusTone("ok");
      setStatusMessage(data.message || "CSV merged");
    } catch {
      setUploadMessage("Network error during upload");
      setStatusTone("error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      scanRef.current?.focus();
    }
  }

  async function handleAccessSubmit(e: FormEvent) {
    e.preventDefault();
    const code = accessCode.trim();
    saveStoredAccessCode(code);
    setAccessError(null);
    try {
      const res = await fetch("/api/big-top/attendees?mode=all", {
        headers: code ? { "x-big-top-code": code } : {},
      });
      const data = await res.json();
      if (res.status === 401) {
        setNeedsAccess(true);
        setAccessReady(false);
        setAccessError("Incorrect access code");
        return;
      }
      setNeedsAccess(Boolean(data.accessRequired));
      setAccessReady(true);
      if (data.storage) setStorageLabel(String(data.storage));
      if (data.stats) setStats(data.stats);
      setTimeout(() => scanRef.current?.focus(), 50);
    } catch {
      setAccessError("Could not verify access code");
    }
  }

  const dayStats = stats?.days.find((d) => d.day === day);
  const lastAttendee = lastResult?.attendee;
  const lastChecked = lastAttendee ? checkInForDay(lastAttendee, day) : null;

  if (!accessReady) {
    if (needsAccess) {
      return (
        <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
          <form
            onSubmit={handleAccessSubmit}
            className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 p-6 space-y-4"
          >
            <h1 className="text-2xl font-black text-[#7bbc07] uppercase">
              Big Top Check-In
            </h1>
            <p className="text-sm text-gray-400">
              Enter the staff access code to open check-in. This protects
              attendee information on the public Vercel site.
            </p>
            <input
              type="password"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Access code"
              className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 focus:outline-none focus:border-[#7bbc07]"
              autoFocus
            />
            {accessError && (
              <p className="text-sm text-red-300">{accessError}</p>
            )}
            <button
              type="submit"
              className="w-full rounded-xl bg-[#7bbc07] text-black font-bold py-3"
            >
              Unlock
            </button>
          </form>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <p className="text-gray-400">Loading Big Top check-in…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[#7bbc07] font-semibold tracking-wide uppercase text-sm">
              Apostolic Life · Event Check-In
            </p>
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">
              Big Top Back to School Bash
            </h1>
            <p className="text-gray-400 mt-1">
              Scan tickets or look up by name · Separate check-in for each day
            </p>
          </div>

          <div className="flex rounded-xl overflow-hidden border border-white/15">
            {DAYS.map((d) => {
              const active = day === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => {
                    setDay(d.key);
                    scanRef.current?.focus();
                  }}
                  className={`px-4 py-3 text-sm sm:text-base font-bold transition-colors ${
                    active
                      ? "bg-[#7bbc07] text-black"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Registered" value={stats?.total ?? "—"} />
          <StatCard
            label={`${DAYS.find((d) => d.key === day)?.short ?? "Day"} in`}
            value={dayStats?.checkedIn ?? "—"}
            accent
          />
          <StatCard label="Remaining today" value={dayStats?.remaining ?? "—"} />
          <StatCard
            label="Backpacks needed"
            value={stats?.backpackNeeded ?? "—"}
          />
        </section>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Scan panel */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-bold mb-1">Scan barcode</h2>
            <p className="text-sm text-gray-400 mb-4">
              Click in the box, scan the ticket. The scanner pastes the Tithely
              URL and presses Enter. Codes map as{" "}
              <code className="text-[#7bbc07]">CODE-ID</code> (e.g. A7OBS-1410971).
            </p>

            <form onSubmit={handleScanSubmit} className="space-y-3">
              <input
                ref={scanRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                disabled={busy}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Scan ticket URL or paste CODE-ID…"
                className="w-full rounded-xl bg-black border border-white/20 px-4 py-4 text-lg font-mono focus:outline-none focus:border-[#7bbc07] focus:ring-2 focus:ring-[#7bbc07]/40"
              />
              <button
                type="submit"
                disabled={busy || !scanValue.trim()}
                className="w-full rounded-xl bg-[#7bbc07] text-black font-bold py-3 text-lg disabled:opacity-40"
              >
                Check in for {DAYS.find((d) => d.key === day)?.short}
              </button>
            </form>

            {statusMessage && (
              <div
                className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
                  statusTone === "ok"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : statusTone === "warn"
                      ? "bg-amber-500/20 text-amber-200 border border-amber-500/40"
                      : statusTone === "error"
                        ? "bg-red-500/20 text-red-300 border border-red-500/40"
                        : "bg-white/10 text-gray-200 border border-white/15"
                }`}
              >
                {statusMessage}
              </div>
            )}

            {lastAttendee && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-black">{lastAttendee.attendeeName}</p>
                    <p className="text-gray-400 text-sm">
                      {lastAttendee.ticket}
                      {lastAttendee.registrantName &&
                      lastAttendee.registrantName !== lastAttendee.attendeeName
                        ? ` · Registered by ${lastAttendee.registrantName}`
                        : ""}
                    </p>
                    <p className="font-mono text-xs text-gray-500 mt-1">
                      {lastAttendee.confirmationCode}
                    </p>
                  </div>
                  <TicketBadge ticket={lastAttendee.ticket} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {lastAttendee.needsBackpack && (
                    <span className="rounded-full bg-[#7bbc07]/20 text-[#b6e86a] border border-[#7bbc07]/40 px-3 py-1 text-xs font-bold">
                      Needs backpack
                    </span>
                  )}
                  {lastAttendee.birthDate && (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
                      DOB {lastAttendee.birthDate}
                    </span>
                  )}
                  {lastChecked && (
                    <span className="rounded-full bg-emerald-500/20 text-emerald-300 px-3 py-1 text-xs font-bold">
                      In today · {formatTime(lastChecked.at)} · {lastChecked.method}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <DayPill
                    label="Sat Aug 1"
                    checkIn={lastAttendee.checkInDay1}
                  />
                  <DayPill
                    label="Sun Aug 2"
                    checkIn={lastAttendee.checkInDay2}
                  />
                </div>

                {lastChecked && (
                  <button
                    type="button"
                    onClick={() => handleUndo(lastAttendee)}
                    className="mt-3 text-sm text-gray-400 underline hover:text-white"
                  >
                    Undo today&apos;s check-in
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Search + upload */}
          <section className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-xl font-bold mb-1">Look up by name</h2>
              <p className="text-sm text-gray-400 mb-4">
                Search attendee or registrant name, then check in manually for{" "}
                <strong className="text-white">
                  {DAYS.find((d) => d.key === day)?.label}
                </strong>
                .
              </p>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type a name…"
                className="w-full rounded-xl bg-black border border-white/20 px-4 py-3 text-lg focus:outline-none focus:border-[#7bbc07] focus:ring-2 focus:ring-[#7bbc07]/40"
              />

              <div className="mt-3 max-h-[360px] overflow-y-auto space-y-2">
                {searching && (
                  <p className="text-sm text-gray-500 px-1">Searching…</p>
                )}
                {!searching && searchQuery.trim() && searchResults.length === 0 && (
                  <p className="text-sm text-gray-500 px-1">No matches</p>
                )}
                {searchResults.map((a) => {
                  const inToday = checkInForDay(a, day);
                  return (
                    <div
                      key={a.confirmationCode}
                      className="rounded-xl border border-white/10 bg-black/50 p-3 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{a.attendeeName}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {a.ticket}
                          {a.registrantName !== a.attendeeName
                            ? ` · ${a.registrantName}`
                            : ""}
                          {a.needsBackpack ? " · Backpack" : ""}
                        </p>
                        <p className="font-mono text-[10px] text-gray-600">
                          {a.confirmationCode}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {inToday ? (
                          <>
                            <span className="text-xs font-bold text-emerald-300">
                              In · {formatTime(inToday.at)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUndo(a)}
                              className="text-xs text-gray-400 underline"
                            >
                              Undo
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleManualCheckIn(a)}
                            className="rounded-lg bg-[#7bbc07] text-black font-bold text-sm px-3 py-2 disabled:opacity-40"
                          >
                            Check in
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-xl font-bold mb-1">Upload updated CSV</h2>
              <p className="text-sm text-gray-400 mb-4">
                Export a fresh attendee list from Tithely My Events and upload it
                here. <strong className="text-white">Only new confirmation codes</strong>{" "}
                are added. Existing people and their check-ins are never
                overwritten.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-[#7bbc07] file:px-4 file:py-2 file:font-bold file:text-black hover:file:bg-[#8fd00a]"
              />
              {uploadMessage && (
                <p className="mt-3 text-sm text-gray-300">{uploadMessage}</p>
              )}
              {stats && (
                <p className="mt-2 text-xs text-gray-500">
                  Store total: {stats.total} · Last update:{" "}
                  {formatTime(stats.updatedAt) || stats.updatedAt}
                </p>
              )}
            </div>
          </section>
        </div>

        <footer className="mt-8 text-center text-xs text-gray-600 space-y-1">
          <div>
            Storage: {storageLabel || "…"} · Event ID 11266056 ·{" "}
            <button
              type="button"
              className="underline hover:text-gray-400"
              onClick={() => scanRef.current?.focus()}
            >
              Focus scanner
            </button>
          </div>
          <div>
            On Vercel, upload the Tithely CSV after deploy so check-in data lives
            in Blob storage (not the server disk).
          </div>
        </footer>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? "border-[#7bbc07]/50 bg-[#7bbc07]/10"
          : "border-white/10 bg-white/5"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-3xl font-black mt-1">{value}</p>
    </div>
  );
}

function TicketBadge({ ticket }: { ticket: string }) {
  const isChild = /child/i.test(ticket);
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
        isChild
          ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
          : "bg-violet-500/20 text-violet-200 border border-violet-500/40"
      }`}
    >
      {ticket || "Ticket"}
    </span>
  );
}

function DayPill({
  label,
  checkIn,
}: {
  label: string;
  checkIn: DayCheckIn | null;
}) {
  return (
    <div
      className={`rounded-lg px-2 py-2 border ${
        checkIn
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border-white/10 bg-white/5 text-gray-500"
      }`}
    >
      <div className="font-semibold">{label}</div>
      <div>
        {checkIn
          ? `✓ ${formatTime(checkIn.at)} (${checkIn.method})`
          : "Not checked in"}
      </div>
    </div>
  );
}
