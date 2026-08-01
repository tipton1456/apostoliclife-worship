import { toStandardNameCase } from "@/lib/format-name";
import { normalizeConfirmationCode } from "./store";
import type { AttendeeRecord, BigTopStore, UploadMergeResult } from "./types";

function cell(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (key in row && row[key] != null) return String(row[key]).trim();
    const found = Object.keys(row).find((k) => k.trim() === key.trim());
    if (found && row[found] != null) return String(row[found]).trim();
  }
  return "";
}

/** Minimal CSV parser supporting quoted fields and commas. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === "") {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushField();
      pushRow();
    } else if (ch === "\r") {
      // ignore CR
    } else {
      field += ch;
    }
  }

  pushField();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
    pushRow();
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const records: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const values = rows[r];
    if (values.every((v) => !v.trim())) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[c] ?? "";
    }
    records.push(obj);
  }

  return records;
}

export function rowToAttendee(
  row: Record<string, string>,
  nowIso: string
): AttendeeRecord | null {
  const codeRaw = cell(row, "Confirmation Code");
  if (!codeRaw) return null;

  const confirmationCode = normalizeConfirmationCode(codeRaw);
  if (!confirmationCode) return null;

  return {
    confirmationCode,
    ticket: cell(row, "Ticket"),
    registrantName: toStandardNameCase(cell(row, "Registrant Name")),
    registrantEmail: cell(row, "Registrant Email"),
    activeAttending: cell(row, "Active / Attending"),
    attendeeRegistered: cell(row, "Attendee Registered"),
    attendeeName: toStandardNameCase(
      cell(row, "Attendee Name") || cell(row, "Registrant Name")
    ),
    attendeeEmail: cell(row, "Attendee Email"),
    attendeeStreet: cell(row, "Attendee Street Address"),
    attendeeCity: cell(row, "Attendee City"),
    attendeeState: cell(row, "Attendee State / Province"),
    attendeePostal: cell(row, "Attendee Postal"),
    attendeeCountry: cell(row, "Attendee Country"),
    birthDate: cell(row, "Birth Date"),
    phoneNumber: cell(row, "Phone Number"),
    backpack: cell(row, "BackPack", "Backpack"),
    homeChurch: cell(
      row,
      "Do you have a home church? ",
      "Do you have a home church?"
    ),
    homeChurchWhere: cell(
      row,
      "If so, Where do you call home?",
      "If so, Where do you call home? "
    ),
    backpackReceivedAt: null,
    checkIns: {},
    importedAt: nowIso,
    sourceUpdatedAt: nowIso,
  };
}

/**
 * Merge CSV rows into store.
 * - New confirmation codes are inserted
 * - Existing confirmation codes are left untouched (fields + check-ins preserved)
 */
export function mergeCsvIntoStore(
  store: BigTopStore,
  csvText: string
): UploadMergeResult {
  const rows = parseCsv(csvText);
  const nowIso = new Date().toISOString();
  let added = 0;
  let skippedExisting = 0;
  let invalidRows = 0;

  for (const row of rows) {
    const attendee = rowToAttendee(row, nowIso);
    if (!attendee) {
      invalidRows++;
      continue;
    }

    const key = attendee.confirmationCode;
    if (store.attendees[key]) {
      skippedExisting++;
      continue;
    }

    store.attendees[key] = attendee;
    added++;
  }

  return {
    added,
    skippedExisting,
    totalInFile: rows.length,
    totalInStore: Object.keys(store.attendees).length,
    invalidRows,
  };
}
