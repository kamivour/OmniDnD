import type { Registry } from '../registry';
import type { RefKind } from '../schema';

export interface RulesSearchHit {
  id: string;
  kind: RefKind;
  name: string;
  source: string;
  /** Rules text, shown only for conditions. */
  text?: string;
}

const KIND_ORDER: RefKind[] = [
  'condition',
  'spell',
  'feature',
  'item',
  'class',
  'subclass',
  'race',
  'background',
  'creature',
];

/**
 * Finds reference entries by name. Names that start with the query come first, then names
 * that contain it; ties follow kind, then name. An empty query returns nothing.
 * With `sources`, entries from books outside that list are hidden (PHB entries always show,
 * and so do entries from the SRD or the monster list, which carry no other book).
 */
export function searchRules(
  registry: Registry,
  query: string,
  limit = 40,
  sources?: readonly string[],
): RulesSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: (RulesSearchHit & { rank: number })[] = [];
  for (const entry of registry.entries.values()) {
    if (sources && entry.source !== 'PHB' && !sources.includes(entry.source)) continue;
    const name = entry.name.toLowerCase();
    const at = name.indexOf(needle);
    if (at < 0) continue;
    const hit: RulesSearchHit & { rank: number } = {
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      source: entry.source,
      rank: at === 0 ? 0 : 1,
    };
    if (entry.kind === 'condition' && 'fullText' in entry && typeof entry.fullText === 'string') {
      hit.text = entry.fullText;
    }
    hits.push(hit);
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.name.localeCompare(b.name),
  );
  return hits.slice(0, limit).map((hit) => ({
    id: hit.id,
    kind: hit.kind,
    name: hit.name,
    source: hit.source,
    ...(hit.text === undefined ? {} : { text: hit.text }),
  }));
}
