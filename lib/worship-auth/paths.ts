export const MENU_PATH = "/home";

export function sanitizeNextPath(value: string | undefined, fallback = MENU_PATH) {
  const trimmed = value?.trim() ?? "";

  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed === "/" ||
    trimmed === "/login" ||
    trimmed.startsWith("/login?")
  ) {
    return fallback;
  }

  return trimmed;
}
