import {
  BIG_TOP_EVENT_ID,
  BIG_TOP_EVENT_NAME,
  type BigTopStore,
} from "./types";

export function emptyStore(): BigTopStore {
  return {
    eventId: BIG_TOP_EVENT_ID,
    eventName: BIG_TOP_EVENT_NAME,
    updatedAt: new Date().toISOString(),
    attendees: {},
  };
}

export function normalizeStore(parsed: Partial<BigTopStore> | null): BigTopStore {
  if (!parsed || typeof parsed !== "object" || !parsed.attendees) {
    return emptyStore();
  }
  return {
    eventId: parsed.eventId || BIG_TOP_EVENT_ID,
    eventName: parsed.eventName || BIG_TOP_EVENT_NAME,
    updatedAt: parsed.updatedAt || new Date().toISOString(),
    attendees: parsed.attendees,
  };
}
