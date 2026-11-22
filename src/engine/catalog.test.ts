import { describe, expect, it } from 'vitest';
import { registry } from '../data/registry';
import {
  CATALOG_KINDS,
  ITEM_TIERS,
  campaignAllows,
  catalogEntries,
  entryKind,
  groupBy,
  itemTier,
  itemType,
  searchCatalog,
  type CatalogEntry,
} from './catalog';
import type { ItemDef } from './schema';

const item = (id: string) => registry.get('item', id);
const find = (kind: (typeof CATALOG_KINDS)[number], name: string) =>
  catalogEntries(registry, kind).find((e) => e.name === name);

describe('compendium catalog', () => {
  it('reaches every bundled class, subclass, race, background, feat, spell and item', () => {
    for (const entry of registry.entries.values()) {
      const wanted =
        ['spell', 'class', 'subclass', 'race', 'background', 'item'].includes(entry.kind) ||
        (entry.kind === 'feature' && entry.origin === 'feat');
      expect(entryKind(entry) !== undefined, entry.id).toBe(wanted);
    }
    for (const kind of CATALOG_KINDS)
      expect(catalogEntries(registry, kind).length).toBeGreaterThan(0);
  });

  it('non-SRD entries carry no book text', () => {
    for (const kind of CATALOG_KINDS)
      for (const e of catalogEntries(registry, kind))
        if (!e.srd) expect(e.fullText, e.id).toBeUndefined();
  });

  it('reads magic item types from the SRD text and mundane types from the category', () => {
    const counts = new Map<string, number>();
    for (const e of catalogEntries(registry, 'equipment')) {
      const key = itemType(e as ItemDef);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const type of [
      'weapon',
      'armor',
      'gear',
      'tool',
      'potion',
      'ring',
      'rod',
      'scroll',
      'staff',
      'wand',
      'wondrous',
    ])
      expect(counts.get(type), type).toBeGreaterThan(0);
    const longsword = find('equipment', 'Longsword') as ItemDef;
    expect(itemType(longsword)).toBe('weapon');
    expect(itemTier(longsword)).toBe('mundane');
    const bag = find('equipment', 'Bag of Holding') as ItemDef;
    expect([itemType(bag), itemTier(bag)]).toEqual(['wondrous', 'uncommon']);
    const healing = find('equipment', 'Potion of Healing') as ItemDef | undefined;
    if (healing) expect(itemType(healing)).toBe('potion');
  });

  it('sorts equipment by tier, then type, then name', () => {
    const list = searchCatalog(registry, 'equipment');
    const tiers = list.map((e) => ITEM_TIERS.indexOf(itemTier(e as ItemDef)));
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    const groups = groupBy(list, (e) => itemTier(e as ItemDef)).map((g) => g.key);
    expect(new Set(groups).size).toBe(groups.length);
    expect(groups[0]).toBe('mundane');
  });

  it('filters by tier, type, text, book, spell level, school and class', () => {
    const rareRings = searchCatalog(registry, 'equipment', { tiers: ['rare'], types: ['ring'] });
    expect(rareRings.length).toBeGreaterThan(0);
    for (const e of rareRings)
      expect([itemTier(e as ItemDef), itemType(e as ItemDef)]).toEqual(['rare', 'ring']);

    const fire = searchCatalog(registry, 'spells', { text: 'fire bolt' });
    expect(fire.map((e) => e.name)).toContain('Fire Bolt');

    const evocation3 = searchCatalog(registry, 'spells', {
      levels: [3],
      schools: ['evocation'],
      classId: 'class.wizard',
    });
    expect(evocation3.map((e) => e.name)).toContain('Fireball');
    for (const e of evocation3)
      expect(e.kind === 'spell' && e.level === 3 && e.school === 'evocation').toBe(true);

    const phb = searchCatalog(registry, 'spells', { books: ['XGE'] });
    for (const e of phb) expect(e.source).toBe('XGE');

    const spells = searchCatalog(registry, 'spells');
    const levels = spells.map((e) => (e.kind === 'spell' ? e.level : -1));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it('keeps mundane gear when a campaign leaves out a book’s magic items', () => {
    const campaign = {
      sources: ['PHB', 'DMG'] as const,
      sourceParts: { DMG: ['options' as const] },
    };
    const sword = item(find('equipment', 'Longsword')!.id) as CatalogEntry;
    const bag = find('equipment', 'Bag of Holding')!;
    expect(campaignAllows({ ...campaign, sources: [...campaign.sources] }, sword)).toBe(true);
    expect(campaignAllows({ ...campaign, sources: [...campaign.sources] }, bag)).toBe(
      bag.source !== 'DMG',
    );
  });

  it('finds the three Tasha’s Amulets of the Devout in their own rarity tiers', () => {
    const amulets = searchCatalog(registry, 'equipment', {
      text: 'amulet of devout',
      books: ['TCE'],
      types: ['wondrous'],
    });
    expect(amulets.map((entry) => entry.name)).toEqual([
      'Amulet of the Devout, +1',
      'Amulet of the Devout, +2',
      'Amulet of the Devout, +3',
    ]);
    expect(amulets.map((entry) => itemTier(item(entry.id)))).toEqual([
      'uncommon',
      'rare',
      'very-rare',
    ]);
    expect(
      amulets.every((entry) =>
        campaignAllows({ sources: ['TCE'], sourceParts: { TCE: ['items'] } }, entry),
      ),
    ).toBe(true);
    expect(
      amulets.some((entry) =>
        campaignAllows({ sources: ['TCE'], sourceParts: { TCE: ['spells'] } }, entry),
      ),
    ).toBe(false);
    expect(amulets.map((entry) => item(entry.id).charges)).toEqual(
      Array.from({ length: 3 }, () => ({ max: 1, recharge: 'dawn', regain: 'all' })),
    );
  });

  it.each([
    ['XGE', 48, 48],
    ['TCE', 72, 47],
  ] as const)(
    'covers the %s printed magic-item lists, including variants',
    (book, entries, families) => {
      const items = searchCatalog(registry, 'equipment', { books: [book] }).map((entry) =>
        item(entry.id),
      );
      expect(items).toHaveLength(entries);
      expect(new Set(items.map((entry) => entry.url)).size).toBe(families);
      expect(
        items.every(
          (entry) => entry.summary && entry.url && !entry.srd && entry.rarity && entry.magicType,
        ),
      ).toBe(true);
      expect(
        items.every((entry) =>
          campaignAllows({ sources: [book], sourceParts: { [book]: ['items'] } }, entry),
        ),
      ).toBe(true);
      expect(
        items.some((entry) =>
          campaignAllows({ sources: [book], sourceParts: { [book]: ['options'] } }, entry),
        ),
      ).toBe(false);
    },
  );

  it('uses the printed 2014 equipment kinds and attunement', () => {
    expect(itemType(item('item.moon-touched-sword'))).toBe('weapon');
    expect(itemType(item('item.shield-of-expression'))).toBe('armor');
    expect(itemType(item('item.wand-of-smiles'))).toBe('wand');
    expect(itemType(item('item.staff-of-flowers'))).toBe('staff');
    expect(item('item.boots-of-false-tracks').attunement).toBeUndefined();
    expect(item('item.ersatz-eye').attunement).toBe(true);
    expect(item('item.prosthetic-limb').attunement).toBeUndefined();
    expect(item('item.bell-branch').attunementBy).toBe('Druid or Warlock');
  });
});
