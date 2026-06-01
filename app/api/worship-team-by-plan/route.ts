import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.planningcenteronline.com/services/v2";

function authHeader() {
  return (
    "Basic " +
    Buffer.from(
      `${process.env.PCO_CLIENT_ID}:${process.env.PCO_SECRET}`
    ).toString("base64")
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
      .map((m: any) => ({
        slot: getSlot(m.attributes?.team_position_name || ""),
        name: m.attributes?.name || "",
        position: m.attributes?.team_position_name || "",
        image: m.attributes?.photo_thumbnail || null,
        status: m.attributes?.status || "",
      }))
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
