export const BIG_TOP_EVENT_ID = "11266056";
export const BIG_TOP_EVENT_NAME = "Big Top Back to School Bash";

/** Event day keys (America/Chicago local calendar dates). */
export const EVENT_DAYS = ["2026-08-01", "2026-08-02"] as const;
export type EventDay = (typeof EVENT_DAYS)[number];

/**
 * Marker row in big_top_check_ins for backpack handout (no schema change needed).
 * Not a real event day — only used as a durable flag in the check_ins table.
 */
export const BACKPACK_MARKER_DAY = "1970-01-01";

export type CheckInMethod = "scan" | "manual";

export type DayCheckIn = {
  at: string;
  method: CheckInMethod;
};

export type AttendeeRecord = {
  confirmationCode: string;
  ticket: string;
  registrantName: string;
  registrantEmail: string;
  activeAttending: string;
  attendeeRegistered: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeeStreet: string;
  attendeeCity: string;
  attendeeState: string;
  attendeePostal: string;
  attendeeCountry: string;
  birthDate: string;
  phoneNumber: string;
  backpack: string;
  homeChurch: string;
  homeChurchWhere: string;
  /** When backpack was handed out (ISO); null/undefined if not yet */
  backpackReceivedAt: string | null;
  /** Preserved across CSV re-uploads */
  checkIns: Partial<Record<EventDay, DayCheckIn>>;
  /** When this row was first imported */
  importedAt: string;
  /** Last time fields were set from CSV (only on first insert) */
  sourceUpdatedAt: string;
};

export type BigTopStore = {
  eventId: string;
  eventName: string;
  updatedAt: string;
  attendees: Record<string, AttendeeRecord>;
};

export type AttendeePublic = AttendeeRecord & {
  checkInDay1: DayCheckIn | null;
  checkInDay2: DayCheckIn | null;
  needsBackpack: boolean;
  backpackReceived: boolean;
};

export type UploadMergeResult = {
  added: number;
  skippedExisting: number;
  totalInFile: number;
  totalInStore: number;
  invalidRows: number;
};
