export const WORSHIP_FEATURES = [
  {
    key: "photos",
    label: "Photos",
    href: "/photos",
    description: "Browse folders, tag people, and upload pictures",
  },
  {
    key: "serve_report",
    label: "Serve Matrix",
    href: "/serve-report",
    description: "Band, worship team, and tech counts by person and position",
  },
  {
    key: "choir_sunday",
    label: "Choir Sunday",
    href: "/choir-sunday",
    description: "Choir Sunday practice schedule and part helpers",
  },
  {
    key: "docs",
    label: "Documentation",
    href: "/docs",
    description: "Tech department docs, manuals, and runbooks",
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
    key: "control_panel",
    label: "Control Panel",
    href: "/control-panel",
    description: "Booth dashboard for mics, ProPresenter, ATEM, Shure, and PreSonus",
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
