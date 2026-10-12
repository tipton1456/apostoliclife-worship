export function sanitizeNextPath(value: string | undefined, fallback = "/") {
  const trimmed = value?.trim() ?? "";

  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }

  return trimmed;
}
