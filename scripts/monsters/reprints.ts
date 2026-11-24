import type { NamedCreature } from './identify.ts';
import { ENTRY_LISTS } from './parse.ts';
import { nameKey } from './validate.ts';

const comparisonFields = [
  'size',
  'sizes',
  'creatureType',
  'alignment',
  'ac',
  'acNote',
  'hp',
  'hpFormula',
  'speed',
  'abilities',
  'saves',
  'skills',
  'vulnerabilities',
  'resistances',
  'immunities',
  'conditionImmunities',
  'senses',
  'languages',
  'cr',
  'xp',
  'proficiencyBonus',
  'intros',
  ...ENTRY_LISTS,
] as const satisfies readonly (keyof NamedCreature)[];

function comparable(value: unknown): unknown {
  if (typeof value === 'string') return value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, comparable(child)]),
    );
  return value;
}

export function compareReprints(
  earlier: readonly NamedCreature[],
  later: readonly NamedCreature[],
) {
  const byName = new Map<string, NamedCreature[]>();
  for (const block of later) {
    if (!block.name) continue;
    const key = nameKey(block.name);
    byName.set(key, [...(byName.get(key) ?? []), block]);
  }
  const matched = earlier.flatMap((block) => {
    if (!block.name) return [];
    const matches = byName.get(nameKey(block.name));
    if (matches?.length !== 1) return [];
    const reprint = matches[0]!;
    const differences = comparisonFields.flatMap((field) =>
      JSON.stringify(comparable(block[field])) === JSON.stringify(comparable(reprint[field]))
        ? []
        : [{ field, earlier: block[field], later: reprint[field] }],
    );
    return [
      {
        name: block.name,
        earlierPage: block.printed ?? block.page,
        laterPage: reprint.printed ?? reprint.page,
        differences,
      },
    ];
  });
  return {
    matched: matched.length,
    changed: matched.filter(({ differences }) => differences.length > 0),
  };
}
