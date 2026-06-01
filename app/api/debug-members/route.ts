import { NextResponse } from "next/server";

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

export async function GET() {
  const serviceTypeId = process.env.PCO_SUNDAY_AM_SERVICE_TYPE_ID;
  const planId = "87756561";

  const members = await pcoFetch(
    `${BASE}/service_types/${serviceTypeId}/plans/${planId}/team_members?per_page=100`
  );

  return NextResponse.json({
    count: members.data?.length || 0,
    firstFive: members.data?.slice(0, 5).map((m: any) => ({
      id: m.id,
      type: m.type,
      attributes: m.attributes,
      relationships: m.relationships,
      links: m.links,
    })),
  });
}
