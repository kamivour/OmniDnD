/**
 * Find: one ranked list over places, actions, the open character's things, rules and tools.
 * Pure. The UI builds the entries and decides what "go" and "do" mean.
 */

export const FIND_GROUPS = ['go', 'do', 'character', 'rules', 'tools'] as const;
export type FindGroup = (typeof FIND_GROUPS)[number];

export const FIND_GROUP_LABELS: Record<FindGroup, string> = {
  go: 'Go to',
  do: 'Do',
  character: 'Your character',
  rules: 'Rules',
  tools: 'Tools',
};

export type FindTarget =
  /** A screen under the character base (or the hub when no character is open). '' = Home. */
  | {
      kind: 'go';
      path: string;
      anchor?: string;
      /** Prefills the screen's search box. */ query?: string;
    }
  /** A command the frame can start. */
  | { kind: 'action'; action: 'long-rest' | 'short-rest' }
  | { kind: 'external'; url: string };

export interface FindEntry {
  id: string;
  group: FindGroup;
  title: string;
  /** Second line: where it lives or what it is. */
  detail?: string;
  /** Extra words that should find it ("jump" finds Movement and body). */
  synonyms?: readonly string[];
  target: FindTarget;
  /** Only offered while a character is open. */
  needsCharacter?: boolean;
}

export interface FindResult {
  entry: FindEntry;
  rank: number;
}

/** Lower is better: 0 title starts with query, 1 a title word starts with it, 2 title contains it, 3 synonym, 4 detail. */
function rank(entry: FindEntry, words: readonly string[]): number | undefined {
  const title = entry.title.toLowerCase();
  const synonyms = (entry.synonyms ?? []).map((word) => word.toLowerCase());
  const detail = (entry.detail ?? '').toLowerCase();
  let worst = 0;
  for (const word of words) {
    let best: number | undefined;
    if (title.startsWith(word)) best = 0;
    else if (title.split(/[^a-z0-9]+/).some((part) => part.startsWith(word))) best = 1;
    else if (title.includes(word)) best = 2;
    else if (synonyms.some((synonym) => synonym.startsWith(word) || synonym.includes(word)))
      best = 3;
    else if (detail.includes(word)) best = 4;
    if (best === undefined) return undefined;
    worst = Math.max(worst, best);
  }
  return worst;
}

/**
 * Entries that match every word of the query, best first, then group order, then title.
 * An empty query returns nothing. At most `perGroup` results per group.
 */
export function searchFind(
  entries: readonly FindEntry[],
  query: string,
  perGroup = 6,
): FindResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const results: FindResult[] = [];
  for (const entry of entries) {
    const value = rank(entry, words);
    if (value !== undefined) results.push({ entry, rank: value });
  }
  results.sort(
    (a, b) =>
      FIND_GROUPS.indexOf(a.entry.group) - FIND_GROUPS.indexOf(b.entry.group) ||
      a.rank - b.rank ||
      a.entry.title.localeCompare(b.entry.title),
  );
  const counts = new Map<FindGroup, number>();
  return results.filter(({ entry }) => {
    const count = counts.get(entry.group) ?? 0;
    counts.set(entry.group, count + 1);
    return count < perGroup;
  });
}
