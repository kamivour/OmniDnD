import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { catalogEntries } from '../../engine/catalog';
import {
  clearFilters,
  groupLabel,
  hasFilters,
  readQuery,
  rowMeta,
  switchKind,
  titleCase,
  toggleParam,
} from './compendium-model';

const p = (s: string) => new URLSearchParams(s);

describe('compendium URL state', () => {
  it('defaults to spells and ignores unknown values', () => {
    expect(readQuery(p('kind=nope&level=12&tier=gold&book=XX'))).toEqual({
      kind: 'spells',
      filter: {},
      allBooks: false,
    });
  });

  it('reads filters for the open tab only', () => {
    const spells = readQuery(
      p('kind=spells&q=fire&level=0,3&school=evocation&class=class.wizard&tier=rare'),
    );
    expect(spells.filter).toEqual({
      text: 'fire',
      levels: [0, 3],
      schools: ['evocation'],
      classId: 'class.wizard',
    });
    const items = readQuery(
      p('kind=equipment&tier=rare,legendary&type=ring&level=3&entry=item.x&books=all'),
    );
    expect(items.filter).toEqual({ tiers: ['rare', 'legendary'], types: ['ring'] });
    expect(items.entryId).toBe('item.x');
    expect(items.allBooks).toBe(true);
    expect(readQuery(p('kind=subclasses&class=class.cleric')).filter).toEqual({
      parentClassId: 'class.cleric',
    });
  });

  it('toggles list values and switches tabs keeping search and books', () => {
    const on = toggleParam(p('kind=equipment&tier=rare'), 'tier', 'uncommon');
    expect(on.get('tier')).toBe('rare,uncommon');
    expect(toggleParam(on, 'tier', 'rare').get('tier')).toBe('uncommon');
    expect(toggleParam(p('tier=rare'), 'tier', 'rare').has('tier')).toBe(false);
    const switched = switchKind(p('kind=equipment&tier=rare&q=sword&book=DMG&books=all'), 'feats');
    expect(switched.toString()).toBe('q=sword&book=DMG&books=all&kind=feats');
    expect(hasFilters(p('kind=feats&books=all'))).toBe(false);
    expect(hasFilters(p('kind=feats&q=x'))).toBe(true);
    expect(clearFilters(p('kind=feats&q=x&books=all')).toString()).toBe('kind=feats&books=all');
  });

  it('labels groups and rows', () => {
    const spell = catalogEntries(registry, 'spells').find((e) => e.name === 'Fireball')!;
    expect(groupLabel(spell)).toBe('Level 3');
    expect(rowMeta(spell)).toBe('L3 evocation');
    const bag = catalogEntries(registry, 'equipment').find((e) => e.name === 'Bag of Holding')!;
    expect(groupLabel(bag)).toBe('Uncommon');
    expect(rowMeta(bag)).toBe('Wondrous item, uncommon');
    const sword = catalogEntries(registry, 'equipment').find((e) => e.name === 'Longsword')!;
    expect([groupLabel(sword), rowMeta(sword)]).toEqual(['Mundane', 'Weapon']);
    expect(titleCase('animal-handling')).toBe('Animal Handling');
  });
});
