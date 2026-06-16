import { NextResponse } from "next/server";

function envValue(name: string) {
  return process.env[name]?.trim().replace(/^['"]|['"]$/g, "");
}

export async function GET() {
  return NextResponse.json({
    serviceTypes: [
      {
        id: envValue("PCO_SUNDAY_AM_SERVICE_TYPE_ID"),
        name: "Sunday AM",
      },
      {
        id: envValue("PCO_SUNDAY_PM_SERVICE_TYPE_ID"),
        name: "Sunday PM",
      },
    ],
  });
}
