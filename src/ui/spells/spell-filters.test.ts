import { describe, expect, it } from 'vitest';
import { type SpellView } from '../fixtures/the-fool';
import { activeFilters, NO_FILTERS, sortEntries } from './spell-filters';

const spell = (name: string, level: number, school: string): SpellView => ({
  id: `spell.${name}`,
  name,
  level,
  school,
  cost: 'A',
  range: '',
  duration: '',
  concentration: false,
  ritual: false,
  components: '',
  source: '',
  lines: [],
  url: '',
  type: 'utility',
  tags: ['utility'],
});

const list = [
  { spell: spell('Bless', 1, 'enchantment'), unavailable: true },
  { spell: spell('Light', 0, 'evocation'), unavailable: false },
  { spell: spell('Aid', 2, 'abjuration'), unavailable: false },
  { spell: spell('Charm', 1, 'enchantment'), unavailable: false },
];
const names = (sorted: typeof list) => sorted.map((entry) => entry.spell.name);

describe('sortEntries', () => {
  it('keeps model order for level and sorts the rest', () => {
    expect(names(sortEntries(list, 'level'))).toEqual(['Bless', 'Light', 'Aid', 'Charm']);
    expect(names(sortEntries(list, 'name'))).toEqual(['Aid', 'Bless', 'Charm', 'Light']);
    expect(names(sortEntries(list, 'school'))).toEqual(['Aid', 'Bless', 'Charm', 'Light']);
    expect(names(sortEntries(list, 'castable'))).toEqual(['Light', 'Charm', 'Aid', 'Bless']);
  });
});

describe('activeFilters', () => {
  it('lists one removable chip per choice and each chip clears only itself', () => {
    const filters = {
      ...NO_FILTERS,
      query: 'x',
      level: 1,
      costs: ['A' as const, 'BA' as const],
      favorites: true,
    };
    const chips = activeFilters(filters);
    expect(chips.map((chip) => chip.label)).toEqual(['Level 1', 'A', 'BA', 'Favorites']);
    expect(chips[1]!.clear(filters)).toEqual({ ...filters, costs: ['BA'] });
    expect(activeFilters(NO_FILTERS)).toEqual([]);
  });
});
