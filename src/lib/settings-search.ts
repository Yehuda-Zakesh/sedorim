// Settings search: which rows a query leaves visible.
//
// Searching hides rows; it never unmounts them. The component that renders the
// rows keeps every one in the tree, in the same shape, and only flips `hidden`,
// so something half-typed inside a hidden row (the seder-hours draft) survives
// the query being typed and cleared.

export function normalise(s: string): string {
  return s.toLowerCase().replace(/[֑-ׇ"'״׳]/g, "");
}

export function tokensOf(query: string): string[] {
  return normalise(query).split(/\s+/).filter(Boolean);
}

/** Every whitespace-separated word of the query must appear in the haystack. */
export function matches(haystack: string, tokens: string[]): boolean {
  const h = normalise(haystack);
  return tokens.every((t) => h.includes(t));
}

type Searchable = { label: string; keywords?: string };

/**
 * For one group: which of its items show. A group whose own title or hint
 * matches shows whole. With no query, everything shows.
 */
export function visibleItems(
  group: { label: string; hint: string; items: Searchable[] },
  tokens: string[],
): boolean[] {
  if (tokens.length === 0) return group.items.map(() => true);
  const groupHit = matches(`${group.label} ${group.hint}`, tokens);
  return group.items.map((it) => groupHit || matches(`${it.label} ${it.keywords ?? ""}`, tokens));
}
