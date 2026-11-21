import {
  CATALOG_KINDS,
  ITEM_TIERS,
  ITEM_TYPES,
  itemTier,
  itemType,
  type CatalogEntry,
  type CatalogFilter,
  type CatalogKind,
  type ItemTier,
  type ItemType,
} from '../../engine/catalog';
import { SCHOOLS } from '../../engine/rules2014';
import { SourceSchema, type Source } from '../../engine/schema';
import { spellLevelLabel } from '../format';

export const KIND_LABELS: Record<CatalogKind, string> = {
  spells: 'Spells',
  classes: 'Classes',
  subclasses: 'Subclasses',
  races: 'Races',
  backgrounds: 'Backgrounds',
  feats: 'Feats',
  equipment: 'Equipment',
};

export const TIER_LABELS: Record<ItemTier, string> = {
  mundane: 'Mundane',
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very rare',
  legendary: 'Legendary',
  artifact: 'Artifact',
  varies: 'Varies',
};

export const TYPE_LABELS: Record<ItemType, string> = {
  weapon: 'Weapons',
  armor: 'Armor',
  gear: 'Adventuring gear',
  tool: 'Tools',
  instrument: 'Instruments',
  container: 'Containers',
  consumable: 'Consumables',
  potion: 'Potions',
  scroll: 'Scrolls',
  ring: 'Rings',
  rod: 'Rods',
  staff: 'Staffs',
  wand: 'Wands',
  wondrous: 'Wondrous items',
};

/** Singular type names for list rows. */
export const TYPE_NAMES: Record<ItemType, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  gear: 'Gear',
  tool: 'Tool',
  instrument: 'Instrument',
  container: 'Container',
  consumable: 'Consumable',
  potion: 'Potion',
  scroll: 'Scroll',
  ring: 'Ring',
  rod: 'Rod',
  staff: 'Staff',
  wand: 'Wand',
  wondrous: 'Wondrous item',
};

export interface CompendiumQuery {
  kind: CatalogKind;
  filter: CatalogFilter;
  /** Open entry id, if any. */
  entryId?: string;
  /** Inside a character: ignore the campaign's books. */
  allBooks: boolean;
}

const list = (params: URLSearchParams, key: string) =>
  (params.get(key) ?? '').split(',').filter(Boolean);

const pick = <T extends string>(values: string[], allowed: readonly T[]): T[] =>
  values.filter((v): v is T => (allowed as readonly string[]).includes(v));

/** Reads tab, search and filters from the URL so they survive Back and reloads. */
export function readQuery(params: URLSearchParams): CompendiumQuery {
  const raw = params.get('kind') ?? '';
  const kind = (CATALOG_KINDS as readonly string[]).includes(raw) ? (raw as CatalogKind) : 'spells';
  const filter: CatalogFilter = {};
  const text = params.get('q')?.trim();
  if (text) filter.text = text;
  const books = pick(list(params, 'book'), SourceSchema.options);
  if (books.length) filter.books = books;
  if (kind === 'spells') {
    const levels = list(params, 'level')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 9);
    if (levels.length) filter.levels = levels;
    const schools = pick(list(params, 'school'), SCHOOLS);
    if (schools.length) filter.schools = schools;
    const classId = params.get('class');
    if (classId) filter.classId = classId;
  }
  if (kind === 'subclasses') {
    const classId = params.get('class');
    if (classId) filter.parentClassId = classId;
  }
  if (kind === 'equipment') {
    const tiers = pick(list(params, 'tier'), ITEM_TIERS);
    if (tiers.length) filter.tiers = tiers;
    const types = pick(list(params, 'type'), ITEM_TYPES);
    if (types.length) filter.types = types;
  }
  const entryId = params.get('entry') ?? undefined;
  return { kind, filter, ...(entryId && { entryId }), allBooks: params.get('books') === 'all' };
}

/** Adds or removes one value from a comma list parameter. */
export function toggleParam(params: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  const values = list(params, key);
  const updated = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
  if (updated.length) next.set(key, updated.join(','));
  else next.delete(key);
  return next;
}

/** Switching tabs keeps the search text and books but drops kind-specific filters. */
export function switchKind(params: URLSearchParams, kind: CatalogKind): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of ['q', 'book', 'books']) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  next.set('kind', kind);
  return next;
}

/** True when any filter beyond the tab and the books is on. */
export function hasFilters(params: URLSearchParams): boolean {
  return ['q', 'level', 'school', 'class', 'tier', 'type', 'book'].some((key) => params.get(key));
}

export function clearFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of ['kind', 'books']) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return next;
}

/** Group header for a sorted list: spell level or item tier. Other kinds are one group. */
export function groupLabel(entry: CatalogEntry): string {
  if (entry.kind === 'spell') return entry.level === 0 ? 'Cantrips' : `Level ${entry.level}`;
  if (entry.kind === 'item') return TIER_LABELS[itemTier(entry)];
  return '';
}

/** Short line under a list row's name. */
export function rowMeta(entry: CatalogEntry, className?: (id: string) => string): string {
  switch (entry.kind) {
    case 'spell':
      return `${spellLevelLabel(entry.level)} ${entry.school}${entry.ritual ? ' · ritual' : ''}${
        entry.duration.concentration ? ' · concentration' : ''
      }`;
    case 'item': {
      const tier = itemTier(entry);
      return [
        TYPE_NAMES[itemType(entry)],
        tier === 'mundane' ? undefined : TIER_LABELS[tier].toLowerCase(),
      ]
        .filter(Boolean)
        .join(', ');
    }
    case 'class':
      return `Hit die ${entry.hitDie}`;
    case 'subclass':
      return className?.(entry.classId) ?? '';
    case 'race':
      return entry.subraceOf
        ? `Subrace of ${className?.(entry.subraceOf) ?? ''}`
        : `Speed ${entry.speed} ft`;
    case 'background':
      return entry.skills.length ? entry.skills.map(titleCase).join(', ') : '';
    case 'feature':
      return 'Feat';
  }
}

/** 'animal-handling' to 'Animal Handling'. */
export const titleCase = (text: string) =>
  text
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export type { Source };
