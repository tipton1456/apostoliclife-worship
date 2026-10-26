import {
  buildColumns,
  buildServeReport,
  canonicalTeam,
  displayPosition,
  formatPersonName,
  isSoloConference,
  servePeriod,
  serviceDay,
  type ServePeriod,
} from "@/lib/serve-report/matrix";
import type {
  CatalogPosition,
  ServeAssignment,
  ServePlan,
  ServeReport,
  ServeTeamName,
} from "@/lib/serve-report/types";

const BASE = "https://api.planningcenteronline.com/services/v2";

const INCLUDED_SERVICES = ["sunday am", "sunday pm", "wednesday", "special services"];

type JsonResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: { id: string; type: string } | { id: string; type: string }[] | null }
  >;
};

type JsonApi = {
  data?: JsonResource[] | JsonResource;
  included?: JsonResource[];
  links?: { next?: string | null };
};

type ServiceType = {
  id: string;
  name: string;
  rank: number;
};

type TeamInfo = {
  id: string;
  name: ServeTeamName;
  serviceTypeId: string;
  serviceRank: number;
};

const reportCache = new Map<string, { at: number; report: ServeReport }>();
const CACHE_MS = 5 * 60 * 1000;

export class ServeReportError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export async function getServeReport(input: { month?: string; from?: string; to?: string }) {
  let period: ServePeriod;
  try {
    period = servePeriod(input);
  } catch (error) {
    throw new ServeReportError(
      error instanceof Error ? error.message : "Choose a valid date range.",
      400,
    );
  }

  const cached = reportCache.get(period.key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.report;

  const report = await loadServeReport(period);
  reportCache.set(period.key, { at: Date.now(), report });
  return report;
}

export async function loadServeReport(period: ServePeriod): Promise<ServeReport> {
  const window = period;

  const serviceTypes = await loadServiceTypes();
  const teams = await loadTeams(serviceTypes);
  const catalog = await loadCatalog(teams);
  const plans = await loadPlans(serviceTypes, window);
  const included = plans.filter((plan) => plan.included);
  const assignments = await loadAssignments(included, teams);

  const columns = buildColumns(
    catalog,
    assignments.map((assignment) => ({
      team: assignment.team,
      position: assignment.position,
    })),
  );

  return buildServeReport({
    month: window.key,
    monthLabel: window.label,
    generatedAt: new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    columns,
    assignments,
    plans,
  });
}

function envValue(name: string) {
  return process.env[name]?.trim().replace(/^['"]|['"]$/g, "");
}

function authHeader() {
  const clientId = envValue("PCO_CLIENT_ID");
  const secret = envValue("PCO_SECRET");
  if (!clientId || !secret) {
    throw new ServeReportError("Planning Center is not configured on this server.");
  }
  return "Basic " + Buffer.from(`${clientId}:${secret}`).toString("base64");
}

// Planning Center allows about 100 requests per 20 seconds. A year of services
// is one request per plan, so requests are spaced under that limit and a 429
// pauses the whole queue for Retry-After instead of retrying in a burst.
const rate = {
  limit: 80,
  periodMs: 20_000,
  stamps: [] as number[],
  pauseUntil: 0,
  tail: Promise.resolve(),
};

function takeSlot() {
  const ticket = rate.tail.then(async () => {
    for (;;) {
      const now = Date.now();
      if (now < rate.pauseUntil) {
        await sleep(rate.pauseUntil - now);
        continue;
      }
      const cutoff = now - rate.periodMs;
      while (rate.stamps.length > 0 && rate.stamps[0] <= cutoff) rate.stamps.shift();
      const gap = Math.ceil(rate.periodMs / rate.limit);
      const last = rate.stamps[rate.stamps.length - 1] ?? 0;
      if (rate.stamps.length < rate.limit && now - last >= gap) {
        rate.stamps.push(now);
        return;
      }
      const windowWait = rate.stamps.length >= rate.limit ? rate.stamps[0] + rate.periodMs - now : 0;
      const gapWait = gap - (now - last);
      await sleep(Math.max(windowWait, gapWait, 25) + 15);
    }
  });
  rate.tail = ticket.then(
    () => undefined,
    () => undefined,
  );
  return ticket;
}

function noteRateHeaders(response: Response) {
  const limit = Number(response.headers.get("x-pco-api-request-rate-limit"));
  const period = Number(response.headers.get("x-pco-api-request-rate-period"));
  const count = Number(response.headers.get("x-pco-api-request-rate-count"));
  if (Number.isFinite(limit) && limit > 10) rate.limit = Math.floor(limit) - 10;
  if (Number.isFinite(period) && period > 0) rate.periodMs = period * 1000;
  if (Number.isFinite(count) && Number.isFinite(limit) && count >= limit - 2) {
    rate.pauseUntil = Math.max(rate.pauseUntil, Date.now() + 2000);
  }
}

function retryDelay(response: Response, attempt: number) {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000) + 250;
  return response.status === 429 ? 2000 * (attempt + 1) : 500 * (attempt + 1);
}

async function pcoFetch(url: string): Promise<JsonApi> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await takeSlot();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: authHeader(),
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      await sleep(500 * (attempt + 1));
      continue;
    }

    noteRateHeaders(response);

    if (response.status === 429 || response.status >= 500) {
      const delay = retryDelay(response, attempt);
      rate.pauseUntil = Math.max(rate.pauseUntil, Date.now() + delay);
      await response.body?.cancel().catch(() => undefined);
      continue;
    }

    if (!response.ok) {
      throw new ServeReportError(`Planning Center error ${response.status}`);
    }

    return (await response.json()) as JsonApi;
  }

  throw new ServeReportError("Planning Center is busy. Try this range again in a moment.");
}

async function loadServiceTypes(): Promise<ServiceType[]> {
  const body = await pcoFetch(`${BASE}/service_types?per_page=100`);
  const rows = asList(body.data);
  const services = rows
    .map((row) => {
      const name = stringAttr(row, "name");
      const rank = INCLUDED_SERVICES.indexOf(name.trim().toLowerCase());
      if (rank === -1) return null;
      return { id: row.id, name, rank };
    })
    .filter((service): service is ServiceType => Boolean(service))
    .sort((a, b) => a.rank - b.rank);

  if (services.length === 0) {
    throw new ServeReportError("No Sunday, Wednesday, or Special Services were found.");
  }

  return services;
}

async function loadTeams(services: ServiceType[]) {
  const teams = new Map<string, TeamInfo>();

  await mapPool(services, 4, async (service) => {
    const body = await pcoFetch(
      `${BASE}/service_types/${service.id}/teams?per_page=100`,
    );
    for (const row of asList(body.data)) {
      const name = canonicalTeam(stringAttr(row, "name"));
      if (!name) continue;
      teams.set(row.id, {
        id: row.id,
        name,
        serviceTypeId: service.id,
        serviceRank: service.rank,
      });
    }
  });

  return teams;
}

async function loadCatalog(teams: Map<string, TeamInfo>) {
  const catalog: CatalogPosition[] = [];

  await mapPool([...teams.values()], 4, async (team) => {
    const rows = await pcoList(
      `${BASE}/service_types/${team.serviceTypeId}/teams/${team.id}/team_positions?per_page=100`,
    );
    for (const row of rows) {
      catalog.push({
        team: team.name,
        name: stringAttr(row, "name"),
        serviceRank: team.serviceRank,
        sequence: numberAttr(row, "sequence"),
      });
    }
  });

  return catalog;
}

async function loadPlans(services: ServiceType[], window: ServePeriod) {
  const plans: ServePlan[] = [];

  await mapPool(services, 4, async (service) => {
    let url: string | null =
      `${BASE}/service_types/${service.id}/plans?per_page=100&order=sort_date&filter=after,before&after=${window.after}&before=${window.before}&include=series`;
    let pages = 0;

    while (url) {
      pages += 1;
      if (pages > 5) {
        throw new ServeReportError("That range returned too many plans.");
      }

      const body = await pcoFetch(url);
      const included = new Map(
        (body.included ?? []).map((item) => [`${item.type}:${item.id}`, item]),
      );

      for (const row of asList(body.data)) {
        const dates = stringAttr(row, "dates");
        const sortDate = stringAttr(row, "sort_date");
        const day = serviceDay(dates, sortDate);
        if (!day || day < window.start || day >= window.next) continue;

        const title = stringAttr(row, "title");
        const seriesId = relationId(row, "series");
        const series = seriesId
          ? stringAttr(included.get(`Series:${seriesId}`), "title")
          : "";
        const excluded = isSoloConference(title, series);
        const dateLabel = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });

        plans.push({
          id: `${service.id}:${row.id}`,
          serviceName: service.name,
          day,
          dateLabel,
          title: title || series,
          included: !excluded,
          excludeReason: excluded ? "Solo Conference" : null,
        });
      }

      url = body.links?.next ?? null;
    }
  });

  return plans.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      a.serviceName.localeCompare(b.serviceName) ||
      a.title.localeCompare(b.title),
  );
}

async function loadAssignments(plans: ServePlan[], teams: Map<string, TeamInfo>) {
  const assignments: ServeAssignment[] = [];

  await mapPool(plans, 4, async (plan) => {
    const [serviceTypeId, planId] = plan.id.split(":");
    const rows = await pcoList(
      `${BASE}/service_types/${serviceTypeId}/plans/${planId}/team_members?per_page=100&filter=not_declined,not_deleted,not_archived`,
    );

    for (const row of rows) {
      const team = teams.get(relationId(row, "team") ?? "");
      if (!team) continue;

      const status = stringAttr(row, "status");
      if (status === "D") continue;

      const name = formatPersonName(stringAttr(row, "name"));
      const personId = relationId(row, "person") || (name ? `name:${name.toLowerCase()}` : "");
      if (!personId || !name) continue;

      const position = displayPosition(team.name, stringAttr(row, "team_position_name"));
      if (!position) continue;

      assignments.push({
        planId: plan.id,
        personId,
        name,
        team: team.name,
        position,
        status,
      });
    }
  });

  return assignments;
}

async function pcoList(url: string) {
  const rows: JsonResource[] = [];
  let next: string | null = url;
  let pages = 0;

  while (next) {
    pages += 1;
    if (pages > 5) break;
    const body = await pcoFetch(next);
    rows.push(...asList(body.data));
    next = body.links?.next ?? null;
  }

  return rows;
}

function asList(data: JsonApi["data"]) {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function stringAttr(resource: JsonResource | undefined, key: string) {
  const value = resource?.attributes?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function numberAttr(resource: JsonResource, key: string) {
  const value = resource.attributes?.[key];
  return typeof value === "number" ? value : 0;
}

function relationId(resource: JsonResource, name: string) {
  const data = resource.relationships?.[name]?.data;
  if (!data || Array.isArray(data)) return "";
  return data.id;
}

async function mapPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current]);
    }
  });
  await Promise.all(runners);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
