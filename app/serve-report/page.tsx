import Link from "next/link";
import { redirect } from "next/navigation";
import WorshipLogo from "@/app/worship-logo";
import ServeReportView from "@/app/serve-report/serve-report-view";
import { chicagoMonth, isIsoDate, isMonthKey } from "@/lib/serve-report/matrix";
import { getCurrentWorshipUser } from "@/lib/worship-auth/users";

export const metadata = {
  title: "Serve Matrix",
};

export default async function ServeReportPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const currentUser = await getCurrentWorshipUser();
  const params = (await searchParams) ?? {};
  const month = params.month && isMonthKey(params.month) ? params.month : chicagoMonth();
  const from = params.from && isIsoDate(params.from) ? params.from : "";
  const to = params.to && isIsoDate(params.to) ? params.to : "";
  const range = Boolean(from && to && from <= to);
  const nextPath = range
    ? `/serve-report?from=${from}&to=${to}`
    : `/serve-report?month=${month}`;

  if (!currentUser?.active) {
    redirect(`/?next=${encodeURIComponent(nextPath)}`);
  }

  if (currentUser.mustResetPassword) {
    redirect(`/change-password?next=${encodeURIComponent(nextPath)}`);
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/home" className="text-sm font-medium text-neutral-300 hover:text-white">
            Home
          </Link>
          <span className="max-w-[16rem] truncate text-sm text-neutral-400">
            {[currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") ||
              currentUser.email}
          </span>
        </div>

        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <WorshipLogo href="/home" className="h-auto w-28" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#7bbc07]">
              Apostolic Worship
            </p>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Serve Matrix</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-400">
              Names down the side, positions across the top, for Band, Worship Team, and Tech.
            </p>
          </div>
        </div>

        <ServeReportView initialMode={range ? "range" : "month"} initialMonth={month} initialFrom={from} initialTo={to} />
      </div>
    </main>
  );
}
