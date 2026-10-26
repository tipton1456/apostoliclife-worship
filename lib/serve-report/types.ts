export const SERVE_TEAMS = ["Band", "Worship Team", "Tech"] as const;

export type ServeTeamName = (typeof SERVE_TEAMS)[number];

export type ServeColumn = {
  team: ServeTeamName;
  position: string;
};

export type ServePerson = {
  id: string;
  name: string;
  counts: number[];
  total: number;
};

export type ServePlan = {
  id: string;
  serviceName: string;
  day: string;
  dateLabel: string;
  title: string;
  included: boolean;
  excludeReason: string | null;
};

export type ServeReport = {
  month: string;
  monthLabel: string;
  generatedAt: string;
  columns: ServeColumn[];
  people: ServePerson[];
  columnTotals: number[];
  grandTotal: number;
  plans: ServePlan[];
  confirmed: number;
  unconfirmed: number;
  notes: string[];
};

export type ServeAssignment = {
  planId: string;
  personId: string;
  name: string;
  team: ServeTeamName;
  position: string;
  status: string;
};

export type CatalogPosition = {
  team: ServeTeamName;
  name: string;
  serviceRank: number;
  sequence: number;
};
