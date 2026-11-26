import {
  CR_STEPS,
  CREATURE_SIZES,
  CREATURE_TYPES,
  creatureBaseType,
  type CreatureTypeFilter,
  type MonsterFilter,
  type MonsterSort,
} from '../../engine/bestiary';
import { SourceSchema, type CreatureDef, type CreatureSize } from '../../engine/schema';
import { crText } from '../reference/creature-format';

/** Type chips in display order; `other` is for type lines the pack could not read. */
export const TYPE_FILTERS: readonly CreatureTypeFilter[] = [...CREATURE_TYPES, 'other'];

export const SIZE_LABELS: Record<CreatureSize, string> = {
  tiny: 'Tiny',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  huge: 'Huge',
  gargantuan: 'Gargantuan',
};

export const typeLabel = (type: CreatureTypeFilter) =>
  type === 'other' ? 'Other' : type.charAt(0).toUpperCase() + type.slice(1);

export interface MonsterQuery {
  filter: MonsterFilter;
  sort: MonsterSort;
}

const list = (params: URLSearchParams, key: string) =>
  (params.get(key) ?? '').split(',').filter(Boolean);

const pick = <T extends string>(values: string[], allowed: readonly T[]): T[] =>
  values.filter((v): v is T => (allowed as readonly string[]).includes(v));

const crParam = (params: URLSearchParams, key: string) => {
  const raw = params.get(key);
  const value = raw === null || raw === '' ? NaN : Number(raw);
  return CR_STEPS.includes(value) ? value : undefined;
};

/** Reads the Monsters tab's search, filters and sort from the URL. */
export function readMonsterQuery(params: URLSearchParams): MonsterQuery {
  const filter: MonsterFilter = {};
  const text = params.get('q')?.trim();
  if (text) filter.text = text;
  const books = pick(list(params, 'book'), SourceSchema.options);
  if (books.length) filter.books = books;
  const crMin = crParam(params, 'crmin');
  if (crMin !== undefined) filter.crMin = crMin;
  const crMax = crParam(params, 'crmax');
  if (crMax !== undefined) filter.crMax = crMax;
  const types = pick(list(params, 'type'), TYPE_FILTERS);
  if (types.length) filter.types = types;
  const sizes = pick(list(params, 'size'), CREATURE_SIZES);
  if (sizes.length) filter.sizes = sizes;
  if (params.get('legendary') === '1') filter.legendary = true;
  if (params.get('npc') === '1') filter.npc = true;
  return { filter, sort: params.get('sort') === 'cr' ? 'cr' : 'name' };
}

/** Chips for every filter that is on; `key` and `value` undo it with `toggleParam`. */
export function monsterActiveFilters(filter: MonsterFilter) {
  const { crMin, crMax } = filter;
  return [
    ...(crMin !== undefined
      ? [{ key: 'crmin', value: String(crMin), label: `CR ${crText(crMin)} or more` }]
      : []),
    ...(crMax !== undefined
      ? [{ key: 'crmax', value: String(crMax), label: `CR ${crText(crMax)} or less` }]
      : []),
    ...(filter.types ?? []).map((type) => ({ key: 'type', value: type, label: typeLabel(type) })),
    ...(filter.sizes ?? []).map((size) => ({ key: 'size', value: size, label: SIZE_LABELS[size] })),
    ...(filter.books ?? []).map((book) => ({ key: 'book', value: book, label: book })),
    ...(filter.legendary ? [{ key: 'legendary', value: '1', label: 'Legendary' }] : []),
    ...(filter.npc ? [{ key: 'npc', value: '1', label: 'NPC' }] : []),
  ];
}

/** "CR 1/4 · Medium beast": the line under a monster's name. */
export function monsterMeta(creature: CreatureDef): string {
  const sizes = (creature.sizes ?? [creature.size]).map((size) => SIZE_LABELS[size]).join(' or ');
  const type = creatureBaseType(creature.creatureType);
  return `CR ${crText(creature.cr)} · ${sizes} ${type === 'other' ? creature.creatureType : type}${
    creature.npc ? ' · NPC' : ''
  }`;
}

/** Group header: the challenge rating when sorted by it, otherwise one group. */
export const monsterGroup = (sort: MonsterSort) => (creature: CreatureDef) =>
  sort === 'cr' ? `Challenge ${crText(creature.cr)}` : '';
