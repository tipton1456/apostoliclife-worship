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

function centralNow() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })
  );
}

function getServiceType() {
  const now = centralNow();
  const isSunday = now.getDay() === 0;
  const isPM = isSunday && now.getHours() >= 12;

  return {
    serviceName: isPM ? "Sunday PM" : "Sunday AM",
    serviceTypeId: isPM
      ? process.env.PCO_SUNDAY_PM_SERVICE_TYPE_ID
      : process.env.PCO_SUNDAY_AM_SERVICE_TYPE_ID,
  };
}

function nextSundayDate() {
  const now = centralNow();
  const daysUntilSunday = (7 - now.getDay()) % 7;
  now.setDate(now.getDate() + daysUntilSunday);
  return now.toISOString().split("T")[0];
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

export async function GET() {
  try {
    const { serviceName, serviceTypeId } = getServiceType();
    const date = nextSundayDate();

    const plans = await pcoFetch(
      `${BASE}/service_types/${serviceTypeId}/plans?filter=future&order=sort_date&per_page=25`
    );

    const plan = plans.data?.find((p: any) => {
      const dates = p.attributes?.dates || "";
      const sortDate = p.attributes?.sort_date || "";
      return dates.includes(date) || sortDate.startsWith(date);
    });

    if (!plan) {
      return NextResponse.json({
        serviceName,
        date,
        planTitle: null,
        planId: null,
        team: [],
        message: "No matching future plan found.",
      });
    }

    const planId = plan.id;
    const planTitle =
      plan.attributes?.title || plan.attributes?.dates || "Untitled Plan";

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
      serviceName,
      date,
      planTitle,
      planId,
      team: assigned,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
