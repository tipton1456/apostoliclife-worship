import { NextResponse } from "next/server";

const BASE = "https://api.planningcenteronline.com/services/v2";

function authHeader() {
  return (
    "Basic " +
    Buffer.from(`${process.env.PCO_CLIENT_ID}:${process.env.PCO_SECRET}`).toString("base64")
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
      `${BASE}/service_types/${serviceTypeId}/plans?where[dates]=${date}&per_page=10`
    );

    const plan = plans.data?.[0];

    if (!plan) {
      return NextResponse.json({
        serviceName,
        date,
        planTitle: null,
        team: [],
        message: "No plan found.",
      });
    }

    const planId = plan.id;
    const planTitle = plan.attributes?.title || plan.attributes?.dates;

    const members = await pcoFetch(
      `${BASE}/service_types/${serviceTypeId}/plans/${planId}/team_members?filter=not_declined,not_deleted,not_archived&per_page=100`
    );

    const worshipTeamName = process.env.PCO_WORSHIP_TEAM_NAME || "Worship Team";

    const assigned = members.data
      .filter((m: any) => {
        return (
          m.attributes?.team_name?.toLowerCase() ===
          worshipTeamName.toLowerCase()
        );
      })
      .map((m: any) => ({
        slot: getSlot(m.attributes?.team_position_name || ""),
        name: m.attributes?.name || "",
        position: m.attributes?.team_position_name || "",
        image: null,
        status: m.attributes?.status || "",
      }))
      .sort((a: any, b: any) => a.slot - b.slot);

    const grid = Array.from({ length: 8 }, (_, i) => {
      const slot = i + 1;
      return (
        assigned.find((p: any) => p.slot === slot) || {
          slot,
          name: "",
          position: `W${slot}`,
          image: null,
          status: "",
        }
      );
    });

    return NextResponse.json({
      serviceName,
      date,
      planTitle,
      planId,
      team: grid,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}