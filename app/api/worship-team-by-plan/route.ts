import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.planningcenteronline.com/services/v2";

function envValue(name: string) {
  return process.env[name]?.trim().replace(/^['"]|['"]$/g, "");
}

function authHeader() {
  const clientId = envValue("PCO_CLIENT_ID");
  const secret = envValue("PCO_SECRET");

  if (!clientId || !secret) {
    throw new Error("Missing PCO_CLIENT_ID or PCO_SECRET");
  }

  return (
    "Basic " +
    Buffer.from(`${clientId}:${secret}`).toString("base64")
  );
}

async function pcoFetch(url: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Planning Center error ${res.status}`);
  }

  return res.json();
}

function getSlot(positionName: string) {
  const match = positionName.match(/^W(\d+)/i);
  return match ? Number(match[1]) : 999;
}

function displayPosition(positionName: string) {
  const slot = getSlot(positionName);
  return slot === 999 ? positionName : String(slot);
}

export async function GET(req: NextRequest) {
  try {
    const serviceTypeId = req.nextUrl.searchParams.get("serviceTypeId");
    const planId = req.nextUrl.searchParams.get("planId");

    if (!serviceTypeId || !planId) {
      return NextResponse.json(
        { error: "Missing serviceTypeId or planId" },
        { status: 400 }
      );
    }

    const plan = await pcoFetch(
      `${BASE}/service_types/${serviceTypeId}/plans/${planId}`
    );

    const planTitle =
      plan.data?.attributes?.title ||
      plan.data?.attributes?.dates ||
      "Selected Plan";

    const members = await pcoFetch(
      `${BASE}/service_types/${serviceTypeId}/plans/${planId}/team_members?filter=not_declined,not_deleted,not_archived&per_page=100`
    );

    const assigned = members.data
      .map((m: any) => {
        const positionName = m.attributes?.team_position_name || "";

        return {
          slot: getSlot(positionName),
          name: m.attributes?.name || "",
          position: displayPosition(positionName),
          image: m.attributes?.photo_thumbnail || null,
          status: m.attributes?.status || "",
        };
      })
      .filter((m: any) => m.slot >= 1 && m.slot <= 8 && m.name)
      .sort((a: any, b: any) => a.slot - b.slot);

    return NextResponse.json({
      serviceTypeId,
      planId,
      planTitle,
      team: assigned,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
