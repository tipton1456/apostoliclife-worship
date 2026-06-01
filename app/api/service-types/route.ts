import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    serviceTypes: [
      {
        id: process.env.PCO_SUNDAY_AM_SERVICE_TYPE_ID,
        name: "Sunday AM",
      },
      {
        id: process.env.PCO_SUNDAY_PM_SERVICE_TYPE_ID,
        name: "Sunday PM",
      },
    ],
  });
}
