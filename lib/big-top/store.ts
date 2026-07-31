import {
  EVENT_DAYS,
  type AttendeePublic,
  type AttendeeRecord,
  type BigTopStore,
  type EventDay,
} from "./types";

export {
  getSeedCsvPath,
  getStorePath,
  insertNewAttendees,
  isServerlessRuntime,
  readStore,
  setDayCheckIn,
  storageBackend,
  writeStore,
} from "./persistence";

export function normalizeConfirmationCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Parse barcode URL or raw confirmation code into CODE-ID form.
 * Examples:
 *  https://tithe.ly/event-registration/#/ticket-confirmed/11266056/A7OBS/1410971/
 *  A7OBS-1410971
 *  A7OBS/1410971
 */
export function parseConfirmationInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Hash route: .../ticket-confirmed/EVENT/CODE/ID or .../ticket/EVENT/CODE/ID
  const hashMatch = raw.match(
    /#\/(?:ticket-confirmed|ticket)\/(\d+)\/([A-Za-z0-9]+)\/(\d+)\/?/i
  );
  if (hashMatch) {
    return normalizeConfirmationCode(`${hashMatch[2]}-${hashMatch[3]}`);
  }

  // Path without hash
  const pathMatch = raw.match(
    /(?:ticket-confirmed|ticket)\/(\d+)\/([A-Za-z0-9]+)\/(\d+)\/?/i
  );
  if (pathMatch) {
    return normalizeConfirmationCode(`${pathMatch[2]}-${pathMatch[3]}`);
  }

  // CODE-ID
  const dashMatch = raw.match(/^([A-Za-z0-9]+)-(\d+)$/);
  if (dashMatch) {
    return normalizeConfirmationCode(`${dashMatch[1]}-${dashMatch[2]}`);
  }

  // CODE/ID
  const slashMatch = raw.match(/^([A-Za-z0-9]+)\/(\d+)$/);
  if (slashMatch) {
    return normalizeConfirmationCode(`${slashMatch[1]}-${slashMatch[2]}`);
  }

  return null;
}

export function isEventDay(value: string): value is EventDay {
  return (EVENT_DAYS as readonly string[]).includes(value);
}

/** Default event day from America/Chicago calendar date. */
export function defaultEventDay(now = new Date()): EventDay {
  const central = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Chicago" })
  );
  const y = central.getFullYear();
  const m = String(central.getMonth() + 1).padStart(2, "0");
  const d = String(central.getDate()).padStart(2, "0");
  const key = `${y}-${m}-${d}`;
  if (isEventDay(key)) return key;
  // Before event → day 1; after day 1 → day 2 if past day 1
  if (key < "2026-08-01") return "2026-08-01";
  return "2026-08-02";
}

export function eventDayLabel(day: EventDay): string {
  if (day === "2026-08-01") return "Saturday, Aug 1";
  return "Sunday, Aug 2";
}

export function needsBackpack(backpack: string): boolean {
  const v = backpack.trim().toLowerCase();
  if (!v) return false;
  if (v.startsWith("no") || v.includes("don't need") || v.includes("dont need")) {
    return false;
  }
  return v === "yes" || v.startsWith("yes");
}

export function toPublicAttendee(record: AttendeeRecord): AttendeePublic {
  return {
    ...record,
    checkInDay1: record.checkIns["2026-08-01"] ?? null,
    checkInDay2: record.checkIns["2026-08-02"] ?? null,
    needsBackpack: needsBackpack(record.backpack),
  };
}

export function searchAttendees(
  store: BigTopStore,
  query: string,
  limit = 40
): AttendeePublic[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const tokens = q.split(/\s+/).filter(Boolean);
  const results: { score: number; attendee: AttendeePublic }[] = [];

  for (const record of Object.values(store.attendees)) {
    const name = record.attendeeName.toLowerCase();
    const registrant = record.registrantName.toLowerCase();
    const code = record.confirmationCode.toLowerCase();
    const haystack = `${name} ${registrant} ${code} ${record.attendeeEmail} ${record.registrantEmail}`.toLowerCase();

    if (!tokens.every((t) => haystack.includes(t))) continue;

    let score = 0;
    if (name === q) score += 100;
    if (name.startsWith(q)) score += 50;
    if (name.includes(q)) score += 20;
    if (registrant.includes(q)) score += 10;
    if (code === q || code.includes(q)) score += 30;

    results.push({ score, attendee: toPublicAttendee(record) });
  }

  results.sort((a, b) => b.score - a.score || a.attendee.attendeeName.localeCompare(b.attendee.attendeeName));
  return results.slice(0, limit).map((r) => r.attendee);
}

export function listAttendees(store: BigTopStore): AttendeePublic[] {
  return Object.values(store.attendees)
    .map(toPublicAttendee)
    .sort((a, b) => a.attendeeName.localeCompare(b.attendeeName));
}

export function statsForStore(store: BigTopStore) {
  const attendees = Object.values(store.attendees);
  const total = attendees.length;
  const adults = attendees.filter((a) => /adult/i.test(a.ticket)).length;
  const children = attendees.filter((a) => /child/i.test(a.ticket)).length;
  const backpackNeeded = attendees.filter((a) => needsBackpack(a.backpack)).length;

  const dayStats = EVENT_DAYS.map((day) => {
    const checkedIn = attendees.filter((a) => a.checkIns[day]);
    return {
      day,
      label: eventDayLabel(day),
      checkedIn: checkedIn.length,
      remaining: total - checkedIn.length,
      adults: checkedIn.filter((a) => /adult/i.test(a.ticket)).length,
      children: checkedIn.filter((a) => /child/i.test(a.ticket)).length,
      backpacks: checkedIn.filter((a) => needsBackpack(a.backpack)).length,
    };
  });

  return {
    total,
    adults,
    children,
    backpackNeeded,
    days: dayStats,
    updatedAt: store.updatedAt,
  };
}
