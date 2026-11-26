import { entryBooks, sourceAllows, type SourceRules } from './calc/campaign-rules';
import { fold } from './catalog';
import type { Registry } from './registry';
import { CreatureSizeSchema, type CreatureDef, type CreatureSize, type Source } from './schema';

/** The fourteen creature types of the 2014 rules, in alphabetical order. */
export const CREATURE_TYPES = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
] as const;
export type CreatureType = (typeof CREATURE_TYPES)[number];
/** `other` holds stat blocks whose type line could not be read. */
export type CreatureTypeFilter = CreatureType | 'other';

export const CREATURE_SIZES: readonly CreatureSize[] = CreatureSizeSchema.options;

/** Every challenge rating a stat block can have, lowest first. */
export const CR_STEPS: readonly number[] = [
  0,
  0.125,
  0.25,
  0.5,
  ...Array.from({ length: 30 }, (_, i) => i + 1),
];

/**
 * The base type of a type line: "humanoid (goblinoid)" is a humanoid and a
 * "swarm of Tiny beasts" is a beast.
 */
export function creatureBaseType(typeLine: string): CreatureTypeFilter {
  const words = typeLine
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
  const swarm = /^swarm of \w+ (\w+)/.exec(words);
  const word = swarm?.[1] ?? words;
  return (
    CREATURE_TYPES.find(
      (type) => word.startsWith(type) || (swarm && word.startsWith(type.replace(/y$/, 'i'))),
    ) ?? 'other'
  );
}

export const isLegendary = (creature: CreatureDef) =>
  creature.legendaryActions.length > 0 || (creature.mythicActions?.length ?? 0) > 0;

export interface MonsterFilter {
  text?: string;
  crMin?: number;
  crMax?: number;
  types?: readonly CreatureTypeFilter[];
  sizes?: readonly CreatureSize[];
  /** Empty or missing means every book. A creature matches when any of its books is chosen. */
  books?: readonly Source[];
  legendary?: boolean;
  npc?: boolean;
}

export type MonsterSort = 'name' | 'cr';

/** Every creature in the registry: the SRD ones plus a loaded monster pack. */
export function monsterEntries(registry: Registry, campaign?: SourceRules): CreatureDef[] {
  const out: CreatureDef[] = [];
  for (const entry of registry.entries.values())
    if (entry.kind === 'creature' && (!campaign || sourceAllows(campaign, entry))) out.push(entry);
  return out;
}

export function matchesMonster(creature: CreatureDef, filter: MonsterFilter): boolean {
  if (filter.books?.length && !entryBooks(creature).some((book) => filter.books!.includes(book)))
    return false;
  if (filter.crMin !== undefined && creature.cr < filter.crMin) return false;
  if (filter.crMax !== undefined && creature.cr > filter.crMax) return false;
  if (filter.types?.length && !filter.types.includes(creatureBaseType(creature.creatureType)))
    return false;
  if (
    filter.sizes?.length &&
    !(creature.sizes ?? [creature.size]).some((size) => filter.sizes!.includes(size))
  )
    return false;
  if (filter.legendary && !isLegendary(creature)) return false;
  if (filter.npc && !creature.npc) return false;
  if (filter.text) {
    const name = fold(creature.name);
    if (
      !fold(filter.text)
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => name.includes(word))
    )
      return false;
  }
  return true;
}

const byName = (a: CreatureDef, b: CreatureDef) => a.name.localeCompare(b.name);

export function compareMonsters(sort: MonsterSort): (a: CreatureDef, b: CreatureDef) => number {
  return sort === 'cr' ? (a, b) => a.cr - b.cr || byName(a, b) : byName;
}

/** One filtered, sorted list. */
export function searchMonsters(
  registry: Registry,
  filter: MonsterFilter = {},
  sort: MonsterSort = 'name',
  campaign?: SourceRules,
): CreatureDef[] {
  return monsterEntries(registry, campaign)
    .filter((creature) => matchesMonster(creature, filter))
    .sort(compareMonsters(sort));
}
