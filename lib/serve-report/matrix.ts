import {
  SERVE_TEAMS,
  type CatalogPosition,
  type ServeAssignment,
  type ServeColumn,
  type ServePerson,
  type ServePlan,
  type ServeReport,
  type ServeTeamName,
} from "@/lib/serve-report/types";

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

const TEAM_RANK: Record<ServeTeamName, number> = {
  Band: 0,
  "Worship Team": 1,
  Tech: 2,
};

const PREFERRED_POSITIONS: Record<ServeTeamName, string[]> = {
  Band: [
    "Drums",
    "Bass",
    "Bass Guitar",
    "Electric Guitar",
    "Acoustic Guitar",
    "Keys / MD",
    "Keys",
    "Piano",
    "Aux or Organ",
  ],
  "Worship Team": [
    "W1 - Worship Leader",
    "W2 - FL Soprano",
    "W3 - FL Alto",
    "W4 - FL Tenor",
    "W5 - Soprano",
    "W6 - Alto",
    "W7 - Tenor",
    "W8 - Flex",
    "Mic 1 - Worship Leader",
    "Mic 2",
    "Mic 3",
    "Mic 4",
  ],
  Tech: [
    "Sound",
    "Audio",
    "Lyrics",
    "Lights",
    "Camera",
    "Video Switcher",
    "Producer",
    "Photography",
    "Photographer",
  ],
};

export function chicagoMonth(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

export function isMonthKey(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, delta: number) {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum - 1 + delta, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

export function monthWindow(month: string) {
  if (!isMonthKey(month)) {
    throw new Error("Choose a valid month.");
  }

  const [year, monthNum] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next =
    monthNum === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNum + 1).padStart(2, "0")}-01`;

  return {
    month,
    label: new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    start,
    next,
    after: shiftIsoDate(start, -3),
    before: shiftIsoDate(next, 3),
  };
}

export function serviceDay(dates: string, sortDate: string) {
  const match = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(dates);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month) {
      return `${match[3]}-${month}-${match[2].padStart(2, "0")}`;
    }
  }

  if (!sortDate) return null;
  const parsed = new Date(sortDate);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function isSoloConference(title: string, series: string) {
  const text = `${title} ${series}`.replace(/\s+/g, " ").toLowerCase();
  return text.includes("solo conference") || text.includes("apostolic solo");
}

export function canonicalTeam(name: string): ServeTeamName | null {
  const key = name.trim().toLowerCase();
  if (key === "band") return "Band";
  if (key === "worship team") return "Worship Team";
  if (key === "tech") return "Tech";
  return null;
}

export function displayPosition(team: string, raw: string) {
  const name = raw.trim();
  const key = name.toLowerCase();
  if (team === "Band" && (key === "aux keys" || key === "organ")) {
    return "Aux or Organ";
  }
  return name || "Unassigned";
}

export function columnKey(team: string, position: string) {
  return `${team}\u0000${position}`;
}

export function buildColumns(
  catalog: CatalogPosition[],
  used: { team: ServeTeamName; position: string }[],
) {
  const drafts = new Map<string, ServeColumn & { order: number }>();

  for (const position of catalog) {
    const label = displayPosition(position.team, position.name);
    const key = columnKey(position.team, label);
    const order = position.serviceRank * 10000 + position.sequence;
    const existing = drafts.get(key);
    if (!existing || order < existing.order) {
      drafts.set(key, { team: position.team, position: label, order });
    }
  }

  let extra = 0;
  for (const position of used) {
    const key = columnKey(position.team, position.position);
    if (drafts.has(key)) continue;
    drafts.set(key, {
      team: position.team,
      position: position.position,
      order: 50000 + extra,
    });
    extra += 1;
  }

  return [...drafts.values()]
    .sort((a, b) => {
      const teamOrder = TEAM_RANK[a.team] - TEAM_RANK[b.team];
      if (teamOrder !== 0) return teamOrder;
      const preferred = comparePreferred(a.team, a.position, b.position);
      if (preferred !== 0) return preferred;
      return a.order - b.order || a.position.localeCompare(b.position);
    })
    .map(({ team, position }) => ({ team, position }));
}

function comparePreferred(team: ServeTeamName, a: string, b: string) {
  const order = PREFERRED_POSITIONS[team];
  const aIndex = order.indexOf(a);
  const bIndex = order.indexOf(b);
  if (aIndex === -1 && bIndex === -1) return 0;
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
}

export function buildServeReport(input: {
  month: string;
  monthLabel: string;
  generatedAt: string;
  columns: ServeColumn[];
  assignments: ServeAssignment[];
  plans: ServePlan[];
}): ServeReport {
  const index = new Map(
    input.columns.map((column, columnIndex) => [
      columnKey(column.team, column.position),
      columnIndex,
    ]),
  );
  const people = new Map<
    string,
    { id: string; name: string; counts: number[]; seen: Set<string> }
  >();
  let confirmed = 0;
  let unconfirmed = 0;

  for (const assignment of input.assignments) {
    const columnIndex = index.get(columnKey(assignment.team, assignment.position));
    if (columnIndex === undefined) continue;

    const name = formatPersonName(assignment.name);
    if (!assignment.personId || !name) continue;

    let person = people.get(assignment.personId);
    if (!person) {
      person = {
        id: assignment.personId,
        name,
        counts: Array(input.columns.length).fill(0),
        seen: new Set(),
      };
      people.set(assignment.personId, person);
    }

    const dedupe = `${assignment.planId}\u0000${columnIndex}`;
    if (person.seen.has(dedupe)) continue;
    person.seen.add(dedupe);
    person.counts[columnIndex] += 1;

    if (assignment.status === "C") confirmed += 1;
    else unconfirmed += 1;
  }

  const rows: ServePerson[] = [...people.values()]
    .map((person) => {
      const total = person.counts.reduce((sum, count) => sum + count, 0);
      return {
        id: person.id,
        name: person.name,
        counts: person.counts,
        total,
      };
    })
    .filter((person) => person.total > 0)
    .sort((a, b) => nameSortKey(a.name).localeCompare(nameSortKey(b.name)));

  const columnTotals = input.columns.map((_, columnIndex) =>
    rows.reduce((sum, person) => sum + person.counts[columnIndex], 0),
  );
  const grandTotal = columnTotals.reduce((sum, count) => sum + count, 0);
  const includedPlans = input.plans.filter((plan) => plan.included).length;

  return {
    month: input.month,
    monthLabel: input.monthLabel,
    generatedAt: input.generatedAt,
    columns: input.columns,
    people: rows,
    columnTotals,
    grandTotal,
    plans: input.plans,
    confirmed,
    unconfirmed,
    notes: [
      "Each number is one scheduled time in that position. A person on Sunday morning and Sunday evening counts twice. Declined assignments are omitted.",
      "Services included: Sunday AM, Sunday PM, Wednesday, and Special Services.",
      "Youth Service is excluded. Solo Conference plans, including Navigating Solo Conference, are excluded.",
      "Aux Keys and Organ are counted together as Aux or Organ.",
      `${includedPlans} services counted. ${confirmed} confirmed and ${unconfirmed} still unconfirmed.`,
    ],
  };
}

export function teamGroups(columns: ServeColumn[]) {
  return SERVE_TEAMS.map((team) => ({
    team,
    count: columns.filter((column) => column.team === team).length,
  })).filter((group) => group.count > 0);
}

export function formatPersonName(input: string) {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  return trimmed
    .split(/(\s+|-|'|’)/)
    .map((part) => {
      if (!part || /^[\s\-’']$/.test(part)) return part;
      const lower = part.toLowerCase();
      if (/^mc[a-z]/.test(lower) && lower.length > 2) {
        return "Mc" + lower.charAt(2).toUpperCase() + lower.slice(3);
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function nameSortKey(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
  let lastIndex = parts.length - 1;
  if (lastIndex > 0 && suffix.test(parts[lastIndex] ?? "")) lastIndex -= 1;
  const last = parts[lastIndex] ?? name;
  const first = parts[0] ?? "";
  return `${last} ${first} ${name}`.toLowerCase();
}

function shiftIsoDate(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}
