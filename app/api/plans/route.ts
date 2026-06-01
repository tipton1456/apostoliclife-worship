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

export async function GET(req: NextRequest) {
  try {
    const serviceTypeId = req.nextUrl.searchParams.get("serviceTypeId");

    if (!serviceTypeId) {
      return NextResponse.json(
        { error: "Missing serviceTypeId" },
        { status: 400 }
      );
    }

    const plans = await pcoFetch(
      `${BASE}/service_types/${serviceTypeId}/plans?filter=future&order=sort_date&per_page=25`
    );

    return NextResponse.json({
      plans: plans.data.map((plan: any) => ({
        id: plan.id,
        title: plan.attributes?.title || plan.attributes?.dates,
        dates: plan.attributes?.dates,
        sortDate: plan.attributes?.sort_date,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
