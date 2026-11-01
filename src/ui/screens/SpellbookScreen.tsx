import { useState } from 'react';
import { Search } from 'lucide-react';
import { SpellCard } from '../components/cards';
import { CastFooter } from '../components/CastFooter';
import { PipStepper } from '../components/PipStepper';
import { SectionLabel } from '../components/SectionLabel';
import { SpellRow } from '../components/SpellRow';
import { cx } from '../cx';
import { fool, spells, type Cost, type SpellView } from '../fixtures/the-fool';
import { useFixtureAction } from '../fixtures/useFixtureAction';
import { signed } from '../format';
import { useDetail } from '../layout/detail-context';
import { SPELL_TYPE_ORDER, SPELL_TYPES, type SpellType } from '../spellTypes';

/** Bard 3 limits (PHB Bard table). Hard-coded for the static frame; the engine owns them from M2. */
const KNOWN = { cantrips: 2, spells: 6 };

interface Filters {
  query: string;
  level: 'all' | number;
  costs: Cost[];
  /** Any of these tags (OR). */
  types: SpellType[];
  concentration: boolean;
  ritual: boolean;
  castableNow: boolean;
}

const NO_FILTERS: Filters = {
  query: '',
  level: 'all',
  costs: [],
  types: [],
  concentration: false,
  ritual: false,
  castableNow: false,
};

const COSTS: Cost[] = ['A', 'BA', 'R'];

function hasSlotFor(spell: SpellView): boolean {
  if (spell.level === 0) return true;
  return fool.slots.some((s) => s.level >= spell.level && s.max - s.used > 0);
}

function matches(spell: SpellView, f: Filters): boolean {
  if (f.query && !spell.name.toLowerCase().includes(f.query.trim().toLowerCase())) return false;
  if (f.level !== 'all' && spell.level !== f.level) return false;
  if (f.costs.length > 0 && !f.costs.includes(spell.cost)) return false;
  if (f.types.length > 0 && !spell.tags.some((t) => f.types.includes(t))) return false;
  if (f.concentration && !spell.concentration) return false;
  if (f.ritual && !spell.ritual) return false;
  if (f.castableNow && !hasSlotFor(spell)) return false;
  return true;
}

/**
 * Frame B (DESIGN.md §8). Filters are view state only; they never touch the character.
 * Desktop: hover previews, click pins into the right panel (slot picker + Cast).
 * Mobile: tap opens the sheet with the same slot picker.
 */
export function SpellbookScreen() {
  const act = useFixtureAction();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const { pin } = useDetail();

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const castSpell = (spell: SpellView, level: number) =>
    act(level > 0 ? `Cast ${spell.name} (L${level} slot)` : `Cast ${spell.name}`);

  const setPinned = (spell: SpellView) =>
    pin(
      <div className="flex flex-col gap-4">
        <SpellCard spell={spell} dc={fool.spellDc} />
        <CastFooter
          key={spell.id}
          spell={spell}
          slots={fool.slots}
          onCast={(level) => castSpell(spell, level)}
        />
      </div>,
    );

  const levels = [
    ...new Set([0, ...spells.map((s) => s.level), ...fool.slots.map((s) => s.level)]),
  ].sort((a, b) => a - b);
  const visible = spells.filter((s) => matches(s, filters));
  const cantripCount = spells.filter((s) => s.level === 0).length;
  const knownCount = spells.length - cantripCount;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-4 lg:px-6">
      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-lg text-text">Spells</h1>
          <p className="text-xs text-text-muted">
            Save DC <span className="font-semibold text-text">{fool.spellDc}</span> · Attack{' '}
            <span className="font-semibold text-text">{signed(fool.spellAttack)}</span> · Cantrips{' '}
            {cantripCount} / {KNOWN.cantrips} · Known {knownCount} / {KNOWN.spells}
          </p>
          <button
            type="button"
            onClick={() => act('Manage spells')}
            className="ml-auto min-h-11 rounded-btn px-2 text-sm text-accent"
          >
            Manage
          </button>
        </header>

        <section aria-label="Filters" className="flex flex-col gap-2">
          <div className="flex gap-2">
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-btn border border-border bg-surface px-3 focus-within:border-accent">
              <Search size={16} aria-hidden className="shrink-0 text-text-muted" />
              <span className="sr-only">Search spells</span>
              <input
                type="search"
                value={filters.query}
                onChange={(e) => set('query', e.target.value)}
                placeholder="Search"
                className="min-w-0 flex-1 bg-transparent text-text placeholder:text-text-muted focus:outline-none"
              />
            </label>
            <label className="sr-only" htmlFor="spell-level">
              Level
            </label>
            <select
              id="spell-level"
              value={filters.level}
              onChange={(e) =>
                set('level', e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="min-h-11 rounded-btn border border-border bg-surface px-2 text-sm text-text"
            >
              <option value="all">All levels</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l === 0 ? 'Cantrips' : `Level ${l}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {COSTS.map((c) => (
              <FilterChip
                key={c}
                pressed={filters.costs.includes(c)}
                onClick={() => set('costs', toggle(filters.costs, c))}
              >
                {c}
              </FilterChip>
            ))}
            <FilterChip
              pressed={filters.concentration}
              onClick={() => set('concentration', !filters.concentration)}
            >
              Conc
            </FilterChip>
            <FilterChip pressed={filters.ritual} onClick={() => set('ritual', !filters.ritual)}>
              Ritual
            </FilterChip>
            <FilterChip
              pressed={filters.castableNow}
              onClick={() => set('castableNow', !filters.castableNow)}
            >
              Castable now
            </FilterChip>
          </div>
          <div role="group" aria-label="Spell type" className="flex flex-wrap gap-2">
            {SPELL_TYPE_ORDER.map((t) => (
              <FilterChip
                key={t}
                pressed={filters.types.includes(t)}
                onClick={() => set('types', toggle(filters.types, t))}
                title={SPELL_TYPES[t].hint}
                className={SPELL_TYPES[t].text}
                pressedClassName={cx(SPELL_TYPES[t].chip, 'bg-surface-2 font-semibold')}
              >
                {SPELL_TYPES[t].label}
              </FilterChip>
            ))}
            {filtered && (
              <button
                type="button"
                onClick={() => setFilters(NO_FILTERS)}
                className="min-h-11 px-2 text-sm text-accent"
              >
                Clear
              </button>
            )}
          </div>
        </section>

        {visible.length === 0 && (
          <p className="py-8 text-center text-text-muted">No spells match these filters.</p>
        )}

        {levels.map((level) => {
          const group = visible.filter((s) => s.level === level);
          if (group.length === 0) return null;
          const slot = fool.slots.find((s) => s.level === level);
          return (
            <section key={level} className="flex flex-col gap-2">
              <div className="flex min-h-11 items-center gap-3">
                <SectionLabel>{level === 0 ? 'Cantrips' : `Level ${level}`}</SectionLabel>
                {slot && (
                  <PipStepper
                    label={`Level ${level} spell slots`}
                    max={slot.max}
                    used={slot.used}
                    onUse={() => act(`Use one: Level ${level} spell slots`)}
                    onRestore={() => act(`Restore one: Level ${level} spell slots`)}
                    className="ml-auto"
                  />
                )}
              </div>
              <ul className="flex flex-col gap-2">
                {group.map((spell) => (
                  <SpellRow
                    key={spell.id}
                    spell={spell}
                    dc={fool.spellDc}
                    slots={fool.slots}
                    concentrating={spell.id === fool.concentration.id}
                    onCast={castSpell}
                    onPin={setPinned}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({
  pressed,
  onClick,
  title,
  className = 'text-text-muted',
  pressedClassName = 'border-accent bg-surface-2 text-accent',
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  title?: string;
  /** Unpressed text color. */
  className?: string;
  pressedClassName?: string;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={cx(
        'min-h-11 rounded-btn border px-3 text-sm',
        pressed ? pressedClassName : cx('border-border bg-surface', className),
      )}
    >
      {children}
    </button>
  );
}
