export const WORSHIP_FEATURES = [
  {
    key: "control_panel",
    label: "Control Panel",
    href: "/control-panel",
    description: "Booth dashboard for mics, ProPresenter, ATEM, Shure, and PreSonus",
  },
  {
    key: "mic_board",
    label: "Main Mic Board",
    href: "/mic-board",
    description: "Live worship team mic board for the current service",
  },
  {
    key: "select_board",
    label: "Select Mic Board",
    href: "/select",
    description: "Choose a service type and plan, then open that mic board",
  },
  {
    key: "manual_board",
    label: "Manual Board",
    href: "/manual-board",
    description: "Manual mic board",
  },
  {
    key: "docs",
    label: "Documentation",
    href: "/docs",
    description: "Tech department docs, manuals, and runbooks",
  },
  {
    key: "serve_report",
    label: "Serve Matrix",
    href: "/serve-report",
    description: "Band, worship team, and tech serve counts",
  },
  {
    key: "choir_sunday",
    label: "Choir Sunday",
    href: "/choir-sunday",
    description: "Choir Sunday practice schedule and part helpers",
  },
  {
    key: "big_top",
    label: "Big Top Check In",
    href: "/big-top",
    description: "Event check-in and backpack tracking",
  },
] as const;

export type WorshipFeatureKey = (typeof WORSHIP_FEATURES)[number]["key"];

const FEATURE_KEYS = new Set<string>(WORSHIP_FEATURES.map((feature) => feature.key));

export function isWorshipFeatureKey(value: string): value is WorshipFeatureKey {
  return FEATURE_KEYS.has(value);
}

export function worshipFeatureLabel(key: WorshipFeatureKey) {
  return WORSHIP_FEATURES.find((feature) => feature.key === key)?.label ?? key;
}
