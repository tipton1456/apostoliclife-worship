"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { shiftMonth, teamGroups } from "@/lib/serve-report/matrix";
import type { ServeReport, ServeTeamName } from "@/lib/serve-report/types";

const TEAM_HEADER: Record<ServeTeamName, string> = {
  Band: "bg-[#14532d] text-white",
  "Worship Team": "bg-[#7bbc07] text-[#102000]",
  Tech: "bg-[#155e75] text-white",
};

export default function ServeReportView({ initialMonth }: { initialMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [report, setReport] = useState<ServeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    fetch(`/api/serve-report?month=${month}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as ServeReport & { error?: string };
        if (!response.ok) {
          throw new Error(body.error || "Could not load the serve report.");
        }
        setReport(body);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        setReport(null);
        setError(fetchError instanceof Error ? fetchError.message : "Could not load the serve report.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [month]);

  function updateMonth(next: string) {
    setMonth(next);
    router.replace(`/serve-report?month=${next}`);
  }

  async function download(format: "pdf" | "xlsx") {
    setExporting(format);
    setError("");
    try {
      const response = await fetch(`/api/serve-report?month=${month}&format=${format}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Could not export the report.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `apostolic-worship-serve-report-${month}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Could not export the report.");
    } finally {
      setExporting(null);
    }
  }

  const groups = report ? teamGroups(report.columns) : [];
  const included = report?.plans.filter((plan) => plan.included) ?? [];
  const excluded = report?.plans.filter((plan) => !plan.included) ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => updateMonth(shiftMonth(month, -1))}
          className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold hover:border-[#7bbc07]/50"
        >
          Previous
        </button>
        <label className="text-sm text-neutral-300">
          <span className="sr-only">Month</span>
          <input
            type="month"
            value={month}
            onChange={(event) => updateMonth(event.target.value)}
            className="rounded-xl border border-white/15 bg-neutral-900 px-3 py-2 text-white outline-none ring-[#7bbc07] focus:ring-2"
          />
        </label>
        <button
          type="button"
          onClick={() => updateMonth(shiftMonth(month, 1))}
          className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold hover:border-[#7bbc07]/50"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => download("xlsx")}
          disabled={loading || !report || exporting !== null}
          className="rounded-xl bg-[#7bbc07] px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-[#8ed20a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting === "xlsx" ? "Preparing Excel..." : "Excel"}
        </button>
        <button
          type="button"
          onClick={() => download("pdf")}
          disabled={loading || !report || exporting !== null}
          className="rounded-xl border border-[#7bbc07]/60 px-4 py-2 text-sm font-semibold text-[#7bbc07] hover:bg-[#7bbc07]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting === "pdf" ? "Preparing PDF..." : "PDF"}
        </button>
      </div>

      {loading ? <p className="text-sm text-neutral-300">Loading {month} from Planning Center...</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {report && !loading ? (
        <>
          <p className="text-sm text-neutral-300">
            {report.monthLabel}: {report.people.length} people, {included.length} services,{" "}
            {report.grandTotal} scheduled times.
          </p>

          <div className="max-h-[72vh] overflow-auto rounded-2xl border border-white/10">
            <table className="border-separate border-spacing-0 text-sm">
              <caption className="sr-only">
                {report.monthLabel} serve counts by person and position
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    rowSpan={2}
                    className="sticky left-0 top-0 z-30 min-w-44 border-b border-r border-white/10 bg-neutral-950 px-3 py-2 text-left"
                  >
                    Name
                  </th>
                  {groups.map((group) => (
                    <th
                      key={group.team}
                      scope="colgroup"
                      colSpan={group.count}
                      className={`sticky top-0 z-20 border-b border-l border-white/10 px-2 py-2 text-center text-xs font-bold uppercase tracking-wide ${TEAM_HEADER[group.team]}`}
                    >
                      {group.team}
                    </th>
                  ))}
                  <th
                    scope="col"
                    rowSpan={2}
                    className="sticky right-0 top-0 z-30 min-w-16 border-b border-l border-white/10 bg-neutral-950 px-2 py-2 text-center"
                  >
                    Total
                  </th>
                </tr>
                <tr>
                  {report.columns.map((column) => (
                    <th
                      key={`${column.team}-${column.position}`}
                      scope="col"
                      className={`sticky top-9 z-20 h-40 min-w-10 border-b border-l border-white/10 px-1 align-bottom ${TEAM_HEADER[column.team]}`}
                    >
                      <span className="inline-block h-36 [writing-mode:vertical-rl] rotate-180 text-xs font-semibold">
                        {column.position}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.people.length === 0 ? (
                  <tr>
                    <td
                      colSpan={report.columns.length + 2}
                      className="px-4 py-8 text-center text-neutral-400"
                    >
                      No Band, Worship Team, or Tech assignments in this month.
                    </td>
                  </tr>
                ) : (
                  report.people.map((person) => (
                    <tr key={person.id} className="hover:bg-white/5">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b border-r border-white/10 bg-black px-3 py-2 text-left font-medium"
                      >
                        {person.name}
                      </th>
                      {person.counts.map((count, index) => (
                        <td
                          key={`${person.id}-${report.columns[index]?.position}`}
                          className="border-b border-l border-white/10 px-1 py-2 text-center tabular-nums"
                        >
                          {count > 0 ? count : <span className="text-white/15">·</span>}
                        </td>
                      ))}
                      <td className="sticky right-0 z-10 border-b border-l border-white/10 bg-neutral-950 px-2 py-2 text-center font-semibold tabular-nums">
                        {person.total}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {report.people.length > 0 ? (
                <tfoot>
                  <tr>
                    <th
                      scope="row"
                      className="sticky bottom-0 left-0 z-30 border-t border-r border-white/10 bg-neutral-950 px-3 py-2 text-left"
                    >
                      Total
                    </th>
                    {report.columnTotals.map((total, index) => (
                      <td
                        key={`${report.columns[index]?.team}-${report.columns[index]?.position}-total`}
                        className="sticky bottom-0 z-20 border-t border-l border-white/10 bg-neutral-950 px-1 py-2 text-center font-semibold tabular-nums"
                      >
                        {total}
                      </td>
                    ))}
                    <td className="sticky right-0 bottom-0 z-30 border-t border-l border-white/10 bg-[#7bbc07] px-2 py-2 text-center font-black text-neutral-950 tabular-nums">
                      {report.grandTotal}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          <ul className="max-w-4xl space-y-1 text-xs leading-5 text-neutral-500">
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>

          <details className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold">
              {included.length} services counted
            </summary>
            <ul className="mt-3 space-y-1 text-sm text-neutral-300">
              {included.map((plan) => (
                <li key={plan.id}>
                  {plan.dateLabel} · {plan.serviceName}
                  {plan.title ? ` · ${plan.title}` : ""}
                </li>
              ))}
            </ul>
          </details>

          {excluded.length > 0 ? (
            <details className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-neutral-300">
                {excluded.length} left out
              </summary>
              <ul className="mt-3 space-y-1 text-sm text-neutral-400">
                {excluded.map((plan) => (
                  <li key={plan.id}>
                    {plan.dateLabel} · {plan.serviceName}
                    {plan.title ? ` · ${plan.title}` : ""} · {plan.excludeReason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
