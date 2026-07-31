import { NextRequest, NextResponse } from "next/server";
import {
  requestHasAccess,
  unauthorizedResponse,
  isAccessConfigured,
} from "@/lib/big-top/auth";
import {
  listAttendees,
  searchAttendees,
  statsForStore,
  storageBackend,
} from "@/lib/big-top/store";
import { ensureSeededStore } from "@/lib/big-top/seed";
import { BIG_TOP_EVENT_ID, BIG_TOP_EVENT_NAME } from "@/lib/big-top/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    if (!requestHasAccess(request)) {
      return unauthorizedResponse();
    }

    const { store, seeded, merge } = await ensureSeededStore();
    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    const mode = request.nextUrl.searchParams.get("mode") || "search";

    const attendees =
      mode === "all"
        ? listAttendees(store)
        : q
          ? searchAttendees(store, q)
          : [];

    return NextResponse.json({
      eventId: store.eventId || BIG_TOP_EVENT_ID,
      eventName: store.eventName || BIG_TOP_EVENT_NAME,
      seeded,
      seedMerge: merge ?? null,
      query: q,
      count: attendees.length,
      attendees,
      stats: statsForStore(store),
      storage: storageBackend(),
      accessRequired: isAccessConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
