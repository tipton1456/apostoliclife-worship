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
  setDayCheckIn,
  statsForStore,
  toPublicAttendee,
  readStore,
} from "@/lib/big-top/store";
import type { CheckInMethod, EventDay } from "@/lib/big-top/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  scan?: string;
  confirmationCode?: string;
  day?: string;
  method?: CheckInMethod;
  force?: boolean;
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

    // Ensure seed on first use (filesystem only); Supabase starts empty until CSV upload
    await ensureSeededStore();
    const store = await readStore();
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
      await setDayCheckIn(code, day, null);
      const refreshed = await readStore();
      const updated = refreshed.attendees[code];
      return NextResponse.json({
        ok: true,
        undone: true,
        day,
        attendee: toPublicAttendee(updated),
        stats: statsForStore(refreshed),
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

    const checkIn = {
      at: new Date().toISOString(),
      method,
    };
    await setDayCheckIn(code, day, checkIn);

    const refreshed = await readStore();
    const updated = refreshed.attendees[code];

    return NextResponse.json({
      ok: true,
      alreadyCheckedIn: false,
      day,
      attendee: toPublicAttendee(updated),
      stats: statsForStore(refreshed),
      message: `Checked in ${updated.attendeeName} for ${day}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
