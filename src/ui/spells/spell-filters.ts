import { type Cost, type SpellView } from '../fixtures/the-fool';
import { SPELL_TYPES, type SpellType } from '../spellTypes';

/** Spellbook view state only; never stored on the character. */
export interface Filters {
  query: string;
  level: 'all' | number;
  costs: Cost[];
  /** Any of these tags (OR). */
  types: SpellType[];
  concentration: boolean;
  ritual: boolean;
  castableNow: boolean;
  school: string;
  favorites: boolean;
}

export const NO_FILTERS: Filters = {
  query: '',
  level: 'all',
  costs: [],
  types: [],
  concentration: false,
  ritual: false,
  castableNow: false,
  school: 'all',
  favorites: false,
};

export type SpellSort = 'level' | 'name' | 'school' | 'castable';

export const SORTS: { value: SpellSort; label: string }[] = [
  { value: 'level', label: 'Level' },
  { value: 'name', label: 'Name' },
  { value: 'school', label: 'School' },
  { value: 'castable', label: 'Castable' },
];

export function matches(
  spell: SpellView,
  f: Filters,
  unavailable: boolean,
  favorite = false,
): boolean {
  if (f.query && !spell.name.toLowerCase().includes(f.query.trim().toLowerCase())) return false;
  if (f.level !== 'all' && spell.level !== f.level) return false;
  if (f.costs.length > 0 && !f.costs.includes(spell.cost)) return false;
  if (f.types.length > 0 && !spell.tags.some((t) => f.types.includes(t))) return false;
  if (f.concentration && !spell.concentration) return false;
  if (f.ritual && !spell.ritual) return false;
  if (f.school !== 'all' && spell.school.toLowerCase() !== f.school) return false;
  if (f.favorites && !favorite) return false;
  if (f.castableNow && unavailable) return false;
  return true;
}

export const levelLabel = (level: number) => (level === 0 ? 'Cantrips' : `Level ${level}`);
export const schoolLabel = (school: string) => school[0]!.toUpperCase() + school.slice(1);

/** One removable chip per active choice (search stays in its own box). */
export function activeFilters(f: Filters): { label: string; clear: (f: Filters) => Filters }[] {
  const chips: { label: string; clear: (f: Filters) => Filters }[] = [];
  if (f.level !== 'all')
    chips.push({ label: levelLabel(f.level), clear: (x) => ({ ...x, level: 'all' }) });
  if (f.school !== 'all')
    chips.push({ label: schoolLabel(f.school), clear: (x) => ({ ...x, school: 'all' }) });
  for (const cost of f.costs)
    chips.push({ label: cost, clear: (x) => ({ ...x, costs: x.costs.filter((c) => c !== cost) }) });
  if (f.concentration)
    chips.push({ label: 'Conc', clear: (x) => ({ ...x, concentration: false }) });
  if (f.ritual) chips.push({ label: 'Ritual', clear: (x) => ({ ...x, ritual: false }) });
  if (f.castableNow)
    chips.push({ label: 'Castable now', clear: (x) => ({ ...x, castableNow: false }) });
  if (f.favorites) chips.push({ label: 'Favorites', clear: (x) => ({ ...x, favorites: false }) });
  for (const type of f.types)
    chips.push({
      label: SPELL_TYPES[type].label,
      clear: (x) => ({ ...x, types: x.types.filter((t) => t !== type) }),
    });
  return chips;
}

/** Level keeps the model order (level, then name); the others give one flat list. */
export function sortEntries<T extends { spell: SpellView; unavailable: boolean }>(
  list: T[],
  sort: SpellSort,
): T[] {
  const byName = (a: T, b: T) => a.spell.name.localeCompare(b.spell.name);
  const copy = [...list];
  switch (sort) {
    case 'level':
      return copy;
    case 'name':
      return copy.sort(byName);
    case 'school':
      return copy.sort((a, b) => a.spell.school.localeCompare(b.spell.school) || byName(a, b));
    case 'castable':
      return copy.sort(
        (a, b) =>
          Number(a.unavailable) - Number(b.unavailable) ||
          a.spell.level - b.spell.level ||
          byName(a, b),
      );
  }
}
