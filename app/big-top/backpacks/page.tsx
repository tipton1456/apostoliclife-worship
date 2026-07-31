"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

type Attendee = {
  confirmationCode: string;
  attendeeName: string;
  registrantName: string;
  ticket: string;
  birthDate: string;
  backpack: string;
  backpackReceived: boolean;
  backpackReceivedAt: string | null;
  checkInDay1: { at: string } | null;
  checkInDay2: { at: string } | null;
};

type Stats = {
  needed: number;
  received: number;
  remaining: number;
};

const ACCESS_STORAGE_KEY = "big-top-access-code";

function loadStoredAccessCode(): string {
  try {
    return sessionStorage.getItem(ACCESS_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function BackpackChecklistPage() {
  const [accessCode, setAccessCode] = useState("");
  const [accessReady, setAccessReady] = useState(false);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<"all" | "remaining" | "received">(
    "remaining"
  );
  const [query, setQuery] = useState("");
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(
    (extra?: HeadersInit): HeadersInit => {
      const headers: Record<string, string> = {};
      if (accessCode.trim()) headers["x-big-top-code"] = accessCode.trim();
      if (extra) Object.assign(headers, extra);
      return headers;
    },
    [accessCode]
  );

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/big-top/backpacks", {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (res.status === 401) {
      setNeedsAccess(true);
      setAccessReady(false);
      setAccessError("Staff access code required");
      return;
    }
    if (!res.ok) {
      setError(data.error || "Failed to load backpack list");
      setAccessReady(true);
      return;
    }
    setNeedsAccess(Boolean(data.accessRequired));
    setAccessReady(true);
    setAttendees(data.attendees || []);
    setStats(data.stats || null);
  }, [authHeaders]);

  useEffect(() => {
    setAccessCode(loadStoredAccessCode());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load().catch(() => setError("Could not load backpack list"));
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function handleAccessSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      sessionStorage.setItem(ACCESS_STORAGE_KEY, accessCode.trim());
    } catch {
      /* ignore */
    }
    setAccessError(null);
    await load();
  }

  async function toggleReceived(attendee: Attendee) {
    setBusyCode(attendee.confirmationCode);
    setError(null);
    try {
      const res = await fetch("/api/big-top/backpacks", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          confirmationCode: attendee.confirmationCode,
          received: !attendee.backpackReceived,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      if (data.attendees) setAttendees(data.attendees);
      if (data.stats) setStats(data.stats);
    } catch {
      setError("Network error");
    } finally {
      setBusyCode(null);
    }
  }

  const visible = useMemo(() => {
    let list = attendees;
    if (filter === "remaining") {
      list = list.filter((a) => !a.backpackReceived);
    } else if (filter === "received") {
      list = list.filter((a) => a.backpackReceived);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const hay = `${a.attendeeName} ${a.registrantName} ${a.confirmationCode}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [attendees, filter, query]);

  if (!accessReady) {
    if (needsAccess) {
      return (
        <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
          <form
            onSubmit={handleAccessSubmit}
            className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 p-6 space-y-4"
          >
            <h1 className="text-2xl font-black text-[#7bbc07] uppercase">
              Backpack checklist
            </h1>
            <p className="text-sm text-gray-400">
              Enter the staff access code to open the backpack list.
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
        <p className="text-gray-400">Loading backpack list…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4">
          <Link
            href="/big-top"
            className="text-sm text-gray-400 hover:text-[#7bbc07] underline"
          >
            ← Back to check-in
          </Link>
        </div>

        <header className="mb-6">
          <p className="text-[#7bbc07] font-semibold tracking-wide uppercase text-sm">
            Big Top · Handout
          </p>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">
            Backpack checklist
          </h1>
          <p className="text-gray-400 mt-1">
            Attendees who selected Yes for a backpack. Tap to mark received.
          </p>
        </header>

        <section className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs uppercase text-gray-400">
              Needed
            </p>
            <p className="text-2xl sm:text-3xl font-black">
              {stats?.needed ?? "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs uppercase text-emerald-300/80">
              Received
            </p>
            <p className="text-2xl sm:text-3xl font-black text-emerald-300">
              {stats?.received ?? "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#7bbc07]/50 bg-[#7bbc07]/10 p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs uppercase text-[#b6e86a]/80">
              Remaining
            </p>
            <p className="text-2xl sm:text-3xl font-black text-[#b6e86a]">
              {stats?.remaining ?? "—"}
            </p>
          </div>
        </section>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name…"
            className="flex-1 rounded-xl bg-black border border-white/20 px-4 py-3 text-base focus:outline-none focus:border-[#7bbc07]"
          />
          <div className="flex rounded-xl overflow-hidden border border-white/15">
            {(
              [
                ["remaining", "Left"],
                ["received", "Done"],
                ["all", "All"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`flex-1 sm:flex-none px-4 py-3 text-sm font-bold ${
                  filter === key
                    ? "bg-[#7bbc07] text-black"
                    : "bg-white/5 text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <ul className="space-y-2 pb-10">
          {visible.length === 0 && (
            <li className="text-center text-gray-500 py-10">
              No matching backpacks in this view.
            </li>
          )}
          {visible.map((a) => {
            const busy = busyCode === a.confirmationCode;
            return (
              <li key={a.confirmationCode}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggleReceived(a)}
                  className={`w-full text-left rounded-2xl border px-4 py-4 transition-colors active:scale-[0.99] ${
                    a.backpackReceived
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-white/15 bg-white/5 hover:border-[#7bbc07]/50"
                  } disabled:opacity-60`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-lg font-black ${
                        a.backpackReceived
                          ? "border-emerald-400 bg-emerald-500 text-black"
                          : "border-white/30 bg-black text-gray-400"
                      }`}
                      aria-hidden
                    >
                      {a.backpackReceived ? "✓" : ""}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-lg leading-tight truncate">
                        {a.attendeeName}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {a.ticket}
                        {a.birthDate ? ` · DOB ${a.birthDate}` : ""}
                        {a.registrantName &&
                        a.registrantName !== a.attendeeName
                          ? ` · ${a.registrantName}`
                          : ""}
                      </div>
                      <div className="text-[10px] font-mono text-gray-600 mt-1">
                        {a.confirmationCode}
                      </div>
                      {a.backpackReceived && a.backpackReceivedAt && (
                        <div className="text-xs text-emerald-300/90 mt-1">
                          Received {formatTime(a.backpackReceivedAt)}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-xs font-semibold">
                      {a.backpackReceived ? (
                        <span className="text-emerald-300">Received</span>
                      ) : (
                        <span className="text-[#b6e86a]">Tap to mark</span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
