import { registry, registryFor } from '../../data/registry';
import { TOOLS } from '../../data/tools';
import { TOOL_OBJECTIVE_LABELS } from '../../engine/calc/tools';
import { searchRules } from '../../engine/calc/rules-search';
import type { FindEntry } from '../../engine/calc/find';
import type { Sheet } from '../../engine/calc/sheet';
import type { CharacterBuild } from '../../engine/schema';

const KIND_LABEL: Record<string, string> = {
  condition: 'Condition',
  spell: 'Spell',
  feature: 'Feature',
  item: 'Item',
  class: 'Class',
  subclass: 'Subclass',
  race: 'Race',
  background: 'Background',
  creature: 'Creature',
};

export const TOOL_ENTRIES: readonly FindEntry[] = TOOLS.map((tool) => ({
  id: tool.id,
  group: 'tools',
  title: tool.name,
  detail: `${TOOL_OBJECTIVE_LABELS[tool.objective]} · ${tool.summary}`,
  synonyms: tool.synonyms,
  target: { kind: 'external', url: tool.url },
}));

/** The open character's spells, items and features, each pointing at the screen that lists it. */
export function characterEntries(build: CharacterBuild, sheet: Sheet): FindEntry[] {
  const own = registryFor(build);
  const entries = new Map<string, FindEntry>();
  const add = (entry: FindEntry) => {
    if (!entries.has(entry.id)) entries.set(entry.id, entry);
  };
  for (const list of build.spells) {
    for (const id of [...list.known, ...(list.prepared ?? [])]) {
      const spell = own.entries.get(id);
      if (spell)
        add({
          id: `character.${id}`,
          group: 'character',
          title: spell.name,
          detail: 'Spell · Spells',
          target: { kind: 'go', path: 'spells' },
        });
    }
  }
  for (const item of build.items) {
    const def = own.entries.get(item.itemId);
    if (def)
      add({
        id: `character.${item.itemId}`,
        group: 'character',
        title: def.name,
        detail: 'Item · Inventory',
        target: { kind: 'go', path: 'inventory' },
      });
  }
  for (const feature of sheet.features) {
    add({
      id: `character.${feature.def.id}`,
      group: 'character',
      title: feature.def.name,
      detail: 'Feature · Features',
      target: { kind: 'go', path: 'features' },
    });
  }
  return [...entries.values()];
}

/** Rules hits for the query, skipping anything the character section already shows. */
export function ruleEntries(
  query: string,
  books: readonly string[] | undefined,
  skip: ReadonlySet<string>,
  limit = 6,
): FindEntry[] {
  return searchRules(registry, query, limit + skip.size, books)
    .filter((hit) => !skip.has(`character.${hit.id}`))
    .slice(0, limit)
    .map((hit) => ({
      id: `rule.${hit.id}`,
      group: 'rules' as const,
      title: hit.name,
      detail: `${KIND_LABEL[hit.kind] ?? hit.kind} · ${hit.source}`,
      target: {
        kind: 'go' as const,
        path: 'reference',
        anchor: 'reference-search',
        query: hit.name,
      },
    }));
}
