import { NextRequest, NextResponse } from "next/server";
import {
  requestHasAccess,
  unauthorizedResponse,
} from "@/lib/big-top/auth";
import { parseCsv, rowToAttendee } from "@/lib/big-top/csv";
import { ensureSeededStore } from "@/lib/big-top/seed";
import {
  insertNewAttendees,
  readStore,
  statsForStore,
  storageBackend,
} from "@/lib/big-top/store";
import type { AttendeeRecord } from "@/lib/big-top/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Upload a Tithely attendee CSV.
 * Only NEW confirmation codes are added. Existing records and check-ins are never overwritten.
 */
export async function POST(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    const contentType = request.headers.get("content-type") || "";
    let csvText = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: "Missing file field (multipart name: file)" },
          { status: 400 }
        );
      }
      csvText = await file.text();
    } else if (
      contentType.includes("text/csv") ||
      contentType.includes("text/plain")
    ) {
      csvText = await request.text();
    } else {
      const raw = await request.text();
      try {
        const json = JSON.parse(raw) as { csv?: string };
        csvText = json.csv || raw;
      } catch {
        csvText = raw;
      }
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
    }

    if (!csvText.toLowerCase().includes("confirmation code")) {
      return NextResponse.json(
        {
          error:
            'CSV does not look like a Tithely export (missing "Confirmation Code" header)',
        },
        { status: 400 }
      );
    }

    await ensureSeededStore();
    const existing = await readStore();
    const rows = parseCsv(csvText);
    const nowIso = new Date().toISOString();
    let invalidRows = 0;
    let skippedExisting = 0;
    const toInsert: AttendeeRecord[] = [];

    for (const row of rows) {
      const attendee = rowToAttendee(row, nowIso);
      if (!attendee) {
        invalidRows++;
        continue;
      }
      if (existing.attendees[attendee.confirmationCode]) {
        skippedExisting++;
        continue;
      }
      // de-dupe within the same file
      if (toInsert.some((a) => a.confirmationCode === attendee.confirmationCode)) {
        skippedExisting++;
        continue;
      }
      toInsert.push(attendee);
    }

    const added = await insertNewAttendees(toInsert);
    const store = await readStore();

    return NextResponse.json({
      ok: true,
      merge: {
        added,
        skippedExisting,
        totalInFile: rows.length,
        totalInStore: Object.keys(store.attendees).length,
        invalidRows,
      },
      stats: statsForStore(store),
      storage: storageBackend(),
      message: `Added ${added} new attendee(s). Skipped ${skippedExisting} existing. Store total: ${Object.keys(store.attendees).length}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
