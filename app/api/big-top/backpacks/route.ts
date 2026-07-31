import { NextRequest, NextResponse } from "next/server";
import {
  isAccessConfigured,
  requestHasAccess,
  unauthorizedResponse,
} from "@/lib/big-top/auth";
import { ensureSeededStore } from "@/lib/big-top/seed";
import {
  listBackpackAttendees,
  readStore,
  setBackpackReceived,
  statsForStore,
  storageBackend,
  toPublicAttendee,
} from "@/lib/big-top/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    await ensureSeededStore();
    const store = await readStore();
    const attendees = listBackpackAttendees(store);
    const stats = statsForStore(store);

    return NextResponse.json({
      attendees,
      count: attendees.length,
      stats: {
        needed: stats.backpackNeeded,
        received: stats.backpackReceived,
        remaining: stats.backpackRemaining,
      },
      storage: storageBackend(),
      accessRequired: isAccessConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type Body = {
  confirmationCode?: string;
  received?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    const body = (await request.json()) as Body;
    const code = (body.confirmationCode || "").trim().toUpperCase();
    if (!code) {
      return NextResponse.json(
        { error: "confirmationCode is required" },
        { status: 400 }
      );
    }
    if (typeof body.received !== "boolean") {
      return NextResponse.json(
        { error: "received must be true or false" },
        { status: 400 }
      );
    }

    await ensureSeededStore();
    const store = await readStore();
    const record = store.attendees[code];
    if (!record) {
      return NextResponse.json({ error: "Attendee not found" }, { status: 404 });
    }

    await setBackpackReceived(code, body.received);
    const refreshed = await readStore();
    const updated = refreshed.attendees[code];
    const attendees = listBackpackAttendees(refreshed);
    const stats = statsForStore(refreshed);

    return NextResponse.json({
      ok: true,
      attendee: toPublicAttendee(updated),
      attendees,
      stats: {
        needed: stats.backpackNeeded,
        received: stats.backpackReceived,
        remaining: stats.backpackRemaining,
      },
      message: body.received
        ? `Marked backpack received for ${updated.attendeeName}`
        : `Cleared backpack received for ${updated.attendeeName}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
