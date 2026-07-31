import { NextRequest, NextResponse } from "next/server";
import {
  requestHasAccess,
  unauthorizedResponse,
} from "@/lib/big-top/auth";
import { ensureSeededStore } from "@/lib/big-top/seed";
import {
  defaultEventDay,
  isEventDay,
  parseConfirmationInput,
  statsForStore,
  toPublicAttendee,
  writeStore,
} from "@/lib/big-top/store";
import type { CheckInMethod, EventDay } from "@/lib/big-top/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  /** Barcode URL, CODE-ID, or CODE/ID */
  scan?: string;
  /** Direct confirmation code if not scanning */
  confirmationCode?: string;
  day?: string;
  method?: CheckInMethod;
  /** If true, replace existing check-in timestamp for that day */
  force?: boolean;
  /** Undo check-in for the day */
  undo?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    const body = (await request.json()) as Body;
    const method: CheckInMethod =
      body.method === "scan" || body.method === "manual"
        ? body.method
        : body.scan
          ? "scan"
          : "manual";

    const day: EventDay =
      body.day && isEventDay(body.day) ? body.day : defaultEventDay();

    const rawCode =
      body.confirmationCode ||
      (body.scan ? parseConfirmationInput(body.scan) : null);

    if (!rawCode) {
      return NextResponse.json(
        {
          error:
            "Could not parse confirmation code. Scan the ticket URL or enter CODE-ID.",
        },
        { status: 400 }
      );
    }

    const code =
      parseConfirmationInput(rawCode) || rawCode.trim().toUpperCase();
    const { store } = await ensureSeededStore();
    const record = store.attendees[code];

    if (!record) {
      return NextResponse.json(
        {
          error: "Attendee not found",
          confirmationCode: code,
          day,
        },
        { status: 404 }
      );
    }

    if (body.undo) {
      if (record.checkIns[day]) {
        delete record.checkIns[day];
        await writeStore(store);
      }
      return NextResponse.json({
        ok: true,
        undone: true,
        day,
        attendee: toPublicAttendee(record),
        stats: statsForStore(store),
        message: `Check-in removed for ${day}`,
      });
    }

    const existing = record.checkIns[day];
    if (existing && !body.force) {
      return NextResponse.json({
        ok: true,
        alreadyCheckedIn: true,
        day,
        attendee: toPublicAttendee(record),
        stats: statsForStore(store),
        message: `Already checked in for ${day} at ${existing.at}`,
      });
    }

    record.checkIns[day] = {
      at: new Date().toISOString(),
      method,
    };
    await writeStore(store);

    return NextResponse.json({
      ok: true,
      alreadyCheckedIn: false,
      day,
      attendee: toPublicAttendee(record),
      stats: statsForStore(store),
      message: `Checked in ${record.attendeeName} for ${day}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
