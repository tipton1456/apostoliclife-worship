import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { serveReportToXlsx } from "@/lib/serve-report/excel";
import { ServeReportError, getServeReport } from "@/lib/serve-report/load";
import { serveReportToPdf } from "@/lib/serve-report/pdf";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentWorshipUser();
  if (!user?.active) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const month = url.searchParams.get("month")?.trim() ?? "";
  const from = url.searchParams.get("from")?.trim() ?? "";
  const to = url.searchParams.get("to")?.trim() ?? "";
  const format = url.searchParams.get("format")?.trim().toLowerCase() ?? "json";

  if (!month && !(from && to)) {
    return NextResponse.json({ error: "Choose a month or a date range." }, { status: 400 });
  }

  try {
    const report = await getServeReport({ month, from, to });

    if (format === "json" || format === "") {
      return NextResponse.json(report);
    }

    const logo = await readWorshipLogo();
    const filename = `apostolic-worship-serve-matrix-${report.month}`;

    if (format === "xlsx") {
      const file = await serveReportToXlsx(report, logo);
      return fileResponse(
        file,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        `${filename}.xlsx`,
      );
    }

    if (format === "pdf") {
      const file = await serveReportToPdf(report, logo);
      return fileResponse(file, "application/pdf", `${filename}.pdf`);
    }

    return NextResponse.json({ error: "Choose PDF or Excel." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the serve matrix.";
    const status = error instanceof ServeReportError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function fileResponse(file: Buffer, contentType: string, filename: string) {
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function readWorshipLogo() {
  try {
    return await readFile(
      path.join(process.cwd(), "public", "ApostolicWorship_DarkBackGround_Transparent.png"),
    );
  } catch {
    return Buffer.alloc(0);
  }
}
