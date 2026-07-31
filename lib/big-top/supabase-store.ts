import { createAdminClient } from "@/lib/supabase/admin";
import {
  BACKPACK_MARKER_DAY,
  BIG_TOP_EVENT_ID,
  BIG_TOP_EVENT_NAME,
  EVENT_DAYS,
  type AttendeeRecord,
  type BigTopStore,
  type CheckInMethod,
  type DayCheckIn,
  type EventDay,
} from "./types";
import { emptyStore, normalizeStore } from "./persistence-shared";

type AttendeeRow = {
  confirmation_code: string;
  event_id: string;
  ticket: string;
  registrant_name: string;
  registrant_email: string;
  active_attending: string;
  attendee_registered: string;
  attendee_name: string;
  attendee_email: string;
  attendee_street: string;
  attendee_city: string;
  attendee_state: string;
  attendee_postal: string;
  attendee_country: string;
  birth_date: string;
  phone_number: string;
  backpack: string;
  home_church: string;
  home_church_where: string;
  backpack_received_at?: string | null;
  imported_at: string;
  source_updated_at: string;
};

type CheckInRow = {
  confirmation_code: string;
  event_day: string;
  checked_in_at: string;
  method: CheckInMethod;
};

function rowToAttendee(row: AttendeeRow): AttendeeRecord {
  return {
    confirmationCode: row.confirmation_code,
    ticket: row.ticket || "",
    registrantName: row.registrant_name || "",
    registrantEmail: row.registrant_email || "",
    activeAttending: row.active_attending || "",
    attendeeRegistered: row.attendee_registered || "",
    attendeeName: row.attendee_name || "",
    attendeeEmail: row.attendee_email || "",
    attendeeStreet: row.attendee_street || "",
    attendeeCity: row.attendee_city || "",
    attendeeState: row.attendee_state || "",
    attendeePostal: row.attendee_postal || "",
    attendeeCountry: row.attendee_country || "",
    birthDate: row.birth_date || "",
    phoneNumber: row.phone_number || "",
    backpack: row.backpack || "",
    homeChurch: row.home_church || "",
    homeChurchWhere: row.home_church_where || "",
    backpackReceivedAt: row.backpack_received_at || null,
    checkIns: {},
    importedAt: row.imported_at || new Date().toISOString(),
    sourceUpdatedAt: row.source_updated_at || new Date().toISOString(),
  };
}

function attendeeToRow(a: AttendeeRecord) {
  return {
    confirmation_code: a.confirmationCode,
    event_id: BIG_TOP_EVENT_ID,
    ticket: a.ticket || "",
    registrant_name: a.registrantName || "",
    registrant_email: a.registrantEmail || "",
    active_attending: a.activeAttending || "",
    attendee_registered: a.attendeeRegistered || "",
    attendee_name: a.attendeeName || "",
    attendee_email: a.attendeeEmail || "",
    attendee_street: a.attendeeStreet || "",
    attendee_city: a.attendeeCity || "",
    attendee_state: a.attendeeState || "",
    attendee_postal: a.attendeePostal || "",
    attendee_country: a.attendeeCountry || "",
    birth_date: a.birthDate || "",
    phone_number: a.phoneNumber || "",
    backpack: a.backpack || "",
    home_church: a.homeChurch || "",
    home_church_where: a.homeChurchWhere || "",
    imported_at: a.importedAt || new Date().toISOString(),
    source_updated_at: a.sourceUpdatedAt || new Date().toISOString(),
  };
}

export async function readStoreFromSupabase(): Promise<BigTopStore> {
  const supabase = createAdminClient();

  const { data: attendeeRows, error: attendeeError } = await supabase
    .from("big_top_attendees")
    .select("*")
    .eq("event_id", BIG_TOP_EVENT_ID);

  if (attendeeError) {
    throw new Error(`Supabase attendees read failed: ${attendeeError.message}`);
  }

  const { data: checkInRows, error: checkInError } = await supabase
    .from("big_top_check_ins")
    .select("*");

  if (checkInError) {
    throw new Error(`Supabase check-ins read failed: ${checkInError.message}`);
  }

  const store = emptyStore();
  store.eventId = BIG_TOP_EVENT_ID;
  store.eventName = BIG_TOP_EVENT_NAME;

  for (const row of (attendeeRows || []) as AttendeeRow[]) {
    store.attendees[row.confirmation_code] = rowToAttendee(row);
  }

  for (const row of (checkInRows || []) as CheckInRow[]) {
    const attendee = store.attendees[row.confirmation_code];
    if (!attendee) continue;

    // Backpack handout is stored as a special check-in marker day
    if (row.event_day === BACKPACK_MARKER_DAY) {
      attendee.backpackReceivedAt = row.checked_in_at;
      continue;
    }

    if (!(EVENT_DAYS as readonly string[]).includes(row.event_day)) continue;
    const day = row.event_day as EventDay;
    attendee.checkIns[day] = {
      at: row.checked_in_at,
      method: row.method === "scan" ? "scan" : "manual",
    };
  }

  // Use latest check-in time or now for updatedAt
  let latest = store.updatedAt;
  for (const a of Object.values(store.attendees)) {
    for (const c of Object.values(a.checkIns)) {
      if (c && c.at > latest) latest = c.at;
    }
    if (a.sourceUpdatedAt > latest) latest = a.sourceUpdatedAt;
  }
  store.updatedAt = latest;

  return normalizeStore(store);
}

/**
 * Insert only brand-new confirmation codes.
 * Existing attendee rows are never updated (preserves merge rules + check-ins).
 */
export async function insertNewAttendeesToSupabase(
  attendees: AttendeeRecord[]
): Promise<number> {
  if (attendees.length === 0) return 0;

  const supabase = createAdminClient();
  const rows = attendees.map(attendeeToRow);

  // insert with ignoreDuplicates — onConflict do nothing
  const { data, error } = await supabase
    .from("big_top_attendees")
    .upsert(rows, {
      onConflict: "confirmation_code",
      ignoreDuplicates: true,
    })
    .select("confirmation_code");

  if (error) {
    throw new Error(`Supabase attendee insert failed: ${error.message}`);
  }

  // When ignoreDuplicates is true, select may only return inserted rows
  // depending on PostgREST version — fall back to counting requested minus known.
  if (Array.isArray(data)) {
    return data.length;
  }
  return attendees.length;
}

export async function setDayCheckInInSupabase(
  confirmationCode: string,
  day: EventDay,
  checkIn: DayCheckIn | null
): Promise<void> {
  const supabase = createAdminClient();

  if (!checkIn) {
    const { error } = await supabase
      .from("big_top_check_ins")
      .delete()
      .eq("confirmation_code", confirmationCode)
      .eq("event_day", day);

    if (error) {
      throw new Error(`Supabase check-in delete failed: ${error.message}`);
    }
    return;
  }

  const { error } = await supabase.from("big_top_check_ins").upsert(
    {
      confirmation_code: confirmationCode,
      event_day: day,
      checked_in_at: checkIn.at,
      method: checkIn.method,
    },
    { onConflict: "confirmation_code,event_day" }
  );

  if (error) {
    throw new Error(`Supabase check-in upsert failed: ${error.message}`);
  }
}

/**
 * Persist backpack handout using a marker row in big_top_check_ins
 * (event_day = 1970-01-01). Avoids requiring a new column migration.
 */
export async function setBackpackReceivedInSupabase(
  confirmationCode: string,
  received: boolean
): Promise<void> {
  const supabase = createAdminClient();

  if (!received) {
    const { error } = await supabase
      .from("big_top_check_ins")
      .delete()
      .eq("confirmation_code", confirmationCode)
      .eq("event_day", BACKPACK_MARKER_DAY);

    if (error) {
      throw new Error(`Supabase backpack clear failed: ${error.message}`);
    }
    return;
  }

  const { error } = await supabase.from("big_top_check_ins").upsert(
    {
      confirmation_code: confirmationCode,
      event_day: BACKPACK_MARKER_DAY,
      checked_in_at: new Date().toISOString(),
      method: "manual",
    },
    { onConflict: "confirmation_code,event_day" }
  );

  if (error) {
    throw new Error(`Supabase backpack mark failed: ${error.message}`);
  }
}
