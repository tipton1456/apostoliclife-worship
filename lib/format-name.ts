/**
 * Standard Title Case for person names.
 * "JOHN smith" → "John Smith"
 * "mary-jane o'brien" → "Mary-Jane O'Brien"
 * "  ja’niyah   bean " → "Ja’niyah Bean"
 */
export function toStandardNameCase(input: string | null | undefined): string {
  if (!input) return "";

  // Normalize whitespace; keep curly apostrophes as-is for matching/display
  const trimmed = String(input).trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  // Split on spaces, hyphens, and straight/curly apostrophes — keep delimiters
  return trimmed
    .split(/(\s+|-|'|’)/)
    .map((part) => {
      if (!part || /^[\s\-’']$/.test(part) || /^\s+$/.test(part)) {
        return part;
      }

      const lower = part.toLowerCase();

      // McDonald, McChristian, etc.
      if (/^mc[a-z]/.test(lower) && lower.length > 2) {
        return (
          "Mc" + lower.charAt(2).toUpperCase() + lower.slice(3)
        );
      }

      // MacDonald — skip short words like Mack
      if (
        /^mac[a-z]/.test(lower) &&
        lower.length > 4 &&
        !/^mack$/.test(lower)
      ) {
        return (
          "Mac" + lower.charAt(3).toUpperCase() + lower.slice(4)
        );
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}
