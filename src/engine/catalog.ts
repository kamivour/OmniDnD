import { sourceAllows } from './calc/campaign-rules';
import type { Registry } from './registry';
import type {
  BackgroundDef,
  Campaign,
  ClassDef,
  FeatureDef,
  ItemDef,
  RaceDef,
  RefEntry,
  Source,
  SpellDef,
  SubclassDef,
} from './schema';

/** Compendium tabs (M45). Feats are features with origin `feat`; equipment is every item. */
export const CATALOG_KINDS = [
  'spells',
  'classes',
  'subclasses',
  'races',
  'backgrounds',
  'feats',
  'equipment',
] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export type CatalogEntry =
  SpellDef | ClassDef | SubclassDef | RaceDef | BackgroundDef | FeatureDef | ItemDef;

/** Item tiers in display order. Items with no rarity are mundane gear. */
export const ITEM_TIERS = [
  'mundane',
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
  'varies',
] as const;
export type ItemTier = (typeof ITEM_TIERS)[number];

/** Item types: mundane categories first, then magic item types. */
export const ITEM_TYPES = [
  'weapon',
  'armor',
  'gear',
  'tool',
  'instrument',
  'container',
  'consumable',
  'potion',
  'scroll',
  'ring',
  'rod',
  'staff',
  'wand',
  'wondrous',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export function itemTier(item: Pick<ItemDef, 'rarity'>): ItemTier {
  return item.rarity ?? 'mundane';
}

const MAGIC_TYPES: readonly [RegExp, ItemType][] = [
  [/^armou?r/i, 'armor'],
  [/^weapon/i, 'weapon'],
  [/^potion/i, 'potion'],
  [/^scroll/i, 'scroll'],
  [/^ring/i, 'ring'],
  [/^rod/i, 'rod'],
  [/^staff/i, 'staff'],
  [/^wand/i, 'wand'],
  [/^wond/i, 'wondrous'],
];

/**
 * Mundane items use their category. A magic item uses its published type where recorded,
 * with the original SRD heading as a fallback for imported items.
 */
export function itemType(
  item: Pick<ItemDef, 'category' | 'rarity' | 'magicType' | 'fullText' | 'weapon' | 'armor'>,
): ItemType {
  if (item.magicType) return item.magicType;
  if (item.category !== 'magic' && item.rarity === undefined) return item.category;
  const first =
    item.fullText
      ?.trimStart()
      .split('\n', 1)[0]
      ?.replace(/^[*_\s]+/, '') ?? '';
  for (const [pattern, type] of MAGIC_TYPES) if (pattern.test(first)) return type;
  if (item.weapon) return 'weapon';
  if (item.armor) return 'armor';
  return item.category === 'magic' ? 'wondrous' : item.category;
}

export interface CatalogFilter {
  text?: string;
  /** Empty or missing means every book. */
  books?: readonly Source[];
  /** Spells */
  levels?: readonly number[];
  schools?: readonly string[];
  classId?: string;
  /** Subclasses */
  parentClassId?: string;
  /** Equipment */
  tiers?: readonly ItemTier[];
  types?: readonly ItemType[];
}

/** Every bundled entry of one compendium kind, unsorted. */
export function catalogEntries(registry: Registry, kind: CatalogKind): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const entry of registry.entries.values())
    if (entryKind(entry) === kind) out.push(entry as CatalogEntry);
  return out;
}

export function entryKind(entry: RefEntry): CatalogKind | undefined {
  switch (entry.kind) {
    case 'spell':
      return entry.retired ? undefined : 'spells';
    case 'class':
      return 'classes';
    case 'subclass':
      return 'subclasses';
    case 'race':
      return 'races';
    case 'background':
      return 'backgrounds';
    case 'item':
      return 'equipment';
    case 'feature':
      return entry.origin === 'feat' ? 'feats' : undefined;
    default:
      return undefined;
  }
}

/** True when the campaign uses this entry's book (and that part of it). Mundane gear only needs the book. */
export function campaignAllows(
  campaign: Pick<Campaign, 'sources' | 'sourceParts'>,
  entry: CatalogEntry,
): boolean {
  if (entry.kind === 'item' && entry.rarity === undefined)
    return campaign.sources.includes(entry.source);
  return sourceAllows(campaign, entry);
}

const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘]/g, '')
    .replace(/(?<=\p{L})[-‐‑‒–—](?=\p{L})/gu, ' ');

export function matchesFilter(
  entry: CatalogEntry,
  filter: CatalogFilter,
  aliases: readonly string[] = [],
): boolean {
  if (filter.books?.length && !filter.books.includes(entry.source)) return false;
  if (filter.text) {
    const words = fold(filter.text).split(/\s+/).filter(Boolean);
    const name = fold([entry.name, ...aliases].join(' '));
    if (!words.every((w) => name.includes(w))) return false;
  }
  if (entry.kind === 'spell') {
    if (filter.levels?.length && !filter.levels.includes(entry.level)) return false;
    if (filter.schools?.length && !filter.schools.includes(entry.school)) return false;
    if (filter.classId && !entry.classes.includes(filter.classId)) return false;
  }
  if (entry.kind === 'subclass' && filter.parentClassId && entry.classId !== filter.parentClassId)
    return false;
  if (entry.kind === 'item') {
    if (filter.tiers?.length && !filter.tiers.includes(itemTier(entry))) return false;
    if (filter.types?.length && !filter.types.includes(itemType(entry))) return false;
  }
  return true;
}

const byName = (a: CatalogEntry, b: CatalogEntry) => a.name.localeCompare(b.name);

/** Spells by level then name; equipment by tier, then type, then name; the rest by name. */
export function compareEntries(a: CatalogEntry, b: CatalogEntry): number {
  if (a.kind === 'spell' && b.kind === 'spell') return a.level - b.level || byName(a, b);
  if (a.kind === 'item' && b.kind === 'item')
    return (
      ITEM_TIERS.indexOf(itemTier(a)) - ITEM_TIERS.indexOf(itemTier(b)) ||
      ITEM_TYPES.indexOf(itemType(a)) - ITEM_TYPES.indexOf(itemType(b)) ||
      byName(a, b)
    );
  return byName(a, b);
}

/** One kind, filtered and sorted. */
export function searchCatalog(
  registry: Registry,
  kind: CatalogKind,
  filter: CatalogFilter = {},
): CatalogEntry[] {
  return catalogEntries(registry, kind)
    .filter((entry) => matchesFilter(entry, filter))
    .sort(compareEntries);
}

/** Groups a sorted list by a key, keeping order. */
export function groupBy<T, K>(list: readonly T[], key: (item: T) => K): { key: K; items: T[] }[] {
  const groups: { key: K; items: T[] }[] = [];
  for (const item of list) {
    const k = key(item);
    const last = groups.at(-1);
    if (last && last.key === k) last.items.push(item);
    else groups.push({ key: k, items: [item] });
  }
  return groups;
}
