import { useRef, useState, type ReactNode, type Ref } from 'react';
import { Popover } from 'radix-ui';
import { ListFilter, Search, X } from 'lucide-react';
import { SchoolSchema } from '../../engine/schema';
import { Sheet } from '../components/Sheet';
import { cx } from '../cx';
import { type Cost } from '../fixtures/the-fool';
import { POPOVER_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { SPELL_TYPE_ORDER, SPELL_TYPES } from '../spellTypes';
import {
  activeFilters,
  levelLabel,
  NO_FILTERS,
  schoolLabel,
  SORTS,
  type Filters,
  type SpellSort,
} from './spell-filters';

const PANEL_TITLE = 'Spell filters';

/**
 * One row: search, Filter (sheet on phones, popover with a mouse), Sort. Active choices show as
 * removable chips underneath. The Favorites chip takes `favoritesRef` so the screen can return
 * focus to it when un-starring removes the focused row.
 */
export function SpellFilterBar({
  filters,
  onChange,
  sort,
  onSort,
  levels,
  costs,
  favoritesRef,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  sort: SpellSort;
  onSort: (next: SpellSort) => void;
  levels: number[];
  costs: Cost[];
  favoritesRef: Ref<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const popover = useMediaQuery(POPOVER_QUERY);
  const filterButton = useRef<HTMLButtonElement>(null);
  const active = activeFilters(filters);
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const trigger = (
    <button
      ref={filterButton}
      type="button"
      aria-label={active.length > 0 ? `Filter, ${active.length} active` : 'Filter'}
      onClick={popover ? undefined : () => setOpen(true)}
      className={cx(
        'flex min-h-11 shrink-0 items-center gap-1.5 rounded-btn border px-3 text-sm',
        active.length > 0
          ? 'border-accent bg-surface-2 text-accent'
          : 'border-border bg-surface text-text',
      )}
    >
      <ListFilter size={16} aria-hidden />
      <span aria-hidden>Filter</span>
      {active.length > 0 && (
        <span aria-hidden className="rounded-full bg-accent px-1.5 text-xs font-semibold text-bg">
          {active.length}
        </span>
      )}
    </button>
  );

  const body = (done: ReactNode) => (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 text-xs text-text-muted">
          <label htmlFor="spell-level">Level</label>
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
                {levelLabel(l)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 text-xs text-text-muted">
          <label htmlFor="spell-school">School</label>
          <select
            id="spell-school"
            value={filters.school}
            onChange={(event) => set('school', event.target.value)}
            className="min-h-11 rounded-btn border border-border bg-surface px-2 text-sm text-text"
          >
            <option value="all">All schools</option>
            {SchoolSchema.options.map((school) => (
              <option key={school} value={school}>
                {schoolLabel(school)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div role="group" aria-label="Casting time" className="flex flex-wrap gap-2">
        {costs.map((c) => (
          <FilterChip
            key={c}
            pressed={filters.costs.includes(c)}
            onClick={() => set('costs', toggle(filters.costs, c))}
          >
            {c}
          </FilterChip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
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
        <FilterChip
          pressed={filters.favorites}
          onClick={() => set('favorites', !filters.favorites)}
        >
          Favorites
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
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!filtered}
          onClick={() => onChange(NO_FILTERS)}
          className="min-h-11 px-2 text-sm text-accent disabled:text-text-muted"
        >
          Clear
        </button>
        {done}
      </div>
    </div>
  );
  const doneClass = 'min-h-11 rounded-btn bg-accent px-4 text-sm font-semibold text-bg';

  return (
    <section aria-label="Filters" data-tour="spell-filters" className="flex flex-col gap-2">
      <div className="flex gap-2">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-btn border border-border bg-surface px-3 focus-within:border-accent">
          <Search size={16} aria-hidden className="shrink-0 text-text-muted" />
          <span className="sr-only">Search spells</span>
          <input
            type="search"
            value={filters.query}
            onChange={(e) => set('query', e.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-text placeholder:text-text-muted"
          />
        </label>
        {popover ? (
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>{trigger}</Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                aria-label={PANEL_TITLE}
                align="end"
                sideOffset={6}
                collisionPadding={8}
                className="z-40 max-h-[min(85dvh,var(--radix-popover-content-available-height))] w-96 max-w-[calc(100vw-16px)] overflow-y-auto rounded-card border border-border bg-surface-2 p-4 shadow-pop"
              >
                <h2 className="mb-3 font-semibold">{PANEL_TITLE}</h2>
                {body(
                  <Popover.Close type="button" className={doneClass}>
                    Done
                  </Popover.Close>,
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : (
          trigger
        )}
        <label className="sr-only" htmlFor="spell-sort">
          Sort spells
        </label>
        <select
          id="spell-sort"
          value={sort}
          onChange={(e) => onSort(e.target.value as SpellSort)}
          className="min-h-11 w-28 shrink-0 rounded-btn border border-border bg-surface px-2 text-sm text-text"
        >
          {SORTS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {(active.length > 0 || filtered) && (
        <div
          role="group"
          aria-label="Active filters"
          className="flex flex-wrap items-center gap-1.5"
        >
          {active.map(({ label, clear }) => (
            <span key={label}>
              <button
                ref={label === 'Favorites' ? favoritesRef : undefined}
                type="button"
                aria-label={`Remove ${label} filter`}
                onClick={() => onChange(clear(filters))}
                className="flex min-h-9 items-center gap-1 rounded-full border border-accent bg-surface-2 px-2.5 text-xs text-accent"
              >
                {label}
                <X size={14} aria-hidden />
              </button>
            </span>
          ))}
          <span>
            <button
              type="button"
              onClick={() => onChange(NO_FILTERS)}
              className="min-h-9 px-2 text-xs text-accent"
            >
              Clear
            </button>
          </span>
        </div>
      )}
      {!popover && (
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title={PANEL_TITLE}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            filterButton.current?.focus();
          }}
        >
          {body(
            <button type="button" onClick={() => setOpen(false)} className={doneClass}>
              Done
            </button>,
          )}
        </Sheet>
      )}
    </section>
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
