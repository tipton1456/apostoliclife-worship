const PERSON_TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .'’-]{0,39}$/u;

export type TagSuggestion = { tag: string; create: boolean };

export function normalizePersonTag(raw: string): { tag: string; tagKey: string } | null {
  const tag = raw.trim().replace(/\s+/g, " ");
  if (!tag || tag.length > 40 || !PERSON_TAG_PATTERN.test(tag)) return null;
  return { tag, tagKey: tag.toLocaleLowerCase("en") };
}

export function matchPersonTags<T extends { tag: string }>(people: T[], query: string) {
  const key = query.trim().toLocaleLowerCase("en");
  if (!key) return [];

  const starts: T[] = [];
  const contains: T[] = [];

  for (const person of people) {
    const personKey = person.tag.toLocaleLowerCase("en");
    if (personKey.startsWith(key)) starts.push(person);
    else if (personKey.includes(key)) contains.push(person);
  }

  const byName = (left: T, right: T) => left.tag.localeCompare(right.tag, "en", { sensitivity: "base" });
  starts.sort((left, right) => left.tag.length - right.tag.length || byName(left, right));
  contains.sort(byName);
  return [...starts, ...contains];
}

export function tagSuggestions(people: { tag: string }[], currentTags: string[], query: string): TagSuggestion[] {
  const normalized = normalizePersonTag(query);
  const taken = new Set(currentTags.map((tag) => tag.toLocaleLowerCase("en")));
  const matches = matchPersonTags(people, query).filter(
    (person) => !taken.has(person.tag.toLocaleLowerCase("en")),
  );
  const create =
    normalized !== null &&
    !taken.has(normalized.tagKey) &&
    !people.some((person) => person.tag.toLocaleLowerCase("en") === normalized.tagKey);

  const existing = matches.slice(0, create ? 7 : 8).map((person) => ({ tag: person.tag, create: false }));
  if (create && normalized) existing.push({ tag: normalized.tag, create: true });
  return existing;
}
