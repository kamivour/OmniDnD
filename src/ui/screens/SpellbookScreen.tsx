import { useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { registry } from '../../data/registry';
import { adjustSlot, spellCastDetails } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { SpellCard } from '../components/cards';
import { Sheet } from '../components/Sheet';
import { PipStepper } from '../components/PipStepper';
import { SectionLabel } from '../components/SectionLabel';
import { SpellRow } from '../components/SpellRow';
import { cx } from '../cx';
import { type Cost, type SpellView } from '../fixtures/the-fool';
import { useFixtureAction } from '../fixtures/useFixtureAction';
import { useCharacter } from '../hooks/useCharacter';
import { signed } from '../format';
import { useDetail } from '../layout/detail-context';
import { SPELL_TYPE_ORDER, SPELL_TYPES, type SpellType } from '../spellTypes';
import { spellbookModel } from '../spells/spellbook-model';
import { SpellCastControls } from '../spells/SpellCastControls';

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

function hasSlotFor(
  spell: SpellView,
  slots: readonly { level: number; max: number; used: number }[],
): boolean {
  if (spell.level === 0) return true;
  return slots.some((s) => s.level >= spell.level && s.max - s.used > 0);
}

function matches(
  spell: SpellView,
  f: Filters,
  slots: readonly { level: number; max: number; used: number }[],
  ritualAvailable = false,
): boolean {
  if (f.query && !spell.name.toLowerCase().includes(f.query.trim().toLowerCase())) return false;
  if (f.level !== 'all' && spell.level !== f.level) return false;
  if (f.costs.length > 0 && !f.costs.includes(spell.cost)) return false;
  if (f.types.length > 0 && !spell.tags.some((t) => f.types.includes(t))) return false;
  if (f.concentration && !spell.concentration) return false;
  if (f.ritual && !spell.ritual) return false;
  if (f.castableNow && !hasSlotFor(spell, slots) && !ritualAvailable) return false;
  return true;
}

/**
 * Frame B (DESIGN.md §8). Filters are view state only; they never touch the character.
 * Desktop: hover previews, click pins into the right panel (slot picker + Cast).
 * Mobile: tap opens the sheet with the same slot picker.
 */
export function SpellbookScreen() {
  const act = useFixtureAction();
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const model = spellbookModel(state, sheet, registry);
  const { slots, levels } = model;
  const context = { ...state, sheet, registry };
  const entries = model.entries.map((entry) => ({
    ...entry,
    ritualAvailable:
      !state.live.combat &&
      spellCastDetails(context, { spellId: entry.spell.id, classId: entry.classId }).ritualEligible,
  }));
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [casting, setCasting] = useState<{
    spellId: string;
    classId: string;
    opener?: HTMLElement;
  } | null>(null);
  const castOpener = useRef<HTMLElement | null>(null);
  const { pin } = useDetail();

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const setPinned = (spell: SpellView, classId: string) =>
    pin(<LiveSpellDetail spellId={spell.id} classId={classId} />);

  const visible = entries.filter(({ spell, ritualAvailable }) =>
    matches(spell, filters, slots, ritualAvailable),
  );
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-4 lg:px-6">
      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-lg text-text">Spells</h1>
          <div className="flex flex-col gap-1 text-xs text-text-muted">
            {model.classes.map((casting) => (
              <p key={casting.classId}>
                {model.classes.length > 1 && `${casting.name} · `}
                Save DC <span className="font-semibold text-text">{casting.dc}</span> · Attack{' '}
                <span className="font-semibold text-text">{signed(casting.attack)}</span> · Cantrips{' '}
                {casting.cantrips}
                {casting.cantripLimit === undefined ? '' : ` / ${casting.cantripLimit}`} · Known{' '}
                {casting.known}
                {casting.knownLimit === undefined ? '' : ` / ${casting.knownLimit}`}
              </p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => act('Manage spells')}
            className="ml-auto min-h-11 rounded-btn px-2 text-sm text-accent"
          >
            Manage
          </button>
        </header>

        {model.unsupportedClassIds.length > 0 && (
          <p role="note" className="text-sm text-warn">
            Selected spells for{' '}
            {model.unsupportedClassIds.map((id) => registry.get('class', id).name).join(', ')} have
            no class spellcasting stats. Their DC and attack calculations are unavailable.
          </p>
        )}

        {sheet.slots.pact && (
          <p role="note" className="text-sm text-text-muted">
            Pact Magic Spellbook support is coming in Phase 3. Adjust pact slots from the HUD.
          </p>
        )}

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
          <p className="py-8 text-center text-text-muted">
            {model.entries.length === 0
              ? 'No spells selected yet.'
              : 'No spells match these filters.'}
          </p>
        )}

        {slots.length > 0 && (
          <p className="text-xs text-text-muted">
            Tap a pip to set remaining slots. − uses one; + restores one.
          </p>
        )}

        {levels.map((level) => {
          const group = visible.filter(({ spell }) => spell.level === level);
          const slot = slots.find((s) => s.level === level);
          if (group.length === 0 && !slot) return null;
          return (
            <section
              key={level}
              aria-label={level === 0 ? 'Cantrips' : `Level ${level}`}
              className="flex flex-col gap-2"
            >
              <div className="flex min-h-11 flex-wrap items-center gap-3">
                <SectionLabel>{level === 0 ? 'Cantrips' : `Level ${level}`}</SectionLabel>
                {slot && (
                  <PipStepper
                    label={`Level ${level} spell slots`}
                    max={slot.max}
                    used={slot.used}
                    onUse={() => run(adjustSlot, { level, used: slot.used + 1 })}
                    onRestore={() => run(adjustSlot, { level, used: slot.used - 1 })}
                    onSetUsed={(used) => run(adjustSlot, { level, used })}
                    className="ml-auto"
                  />
                )}
              </div>
              <ul className="flex flex-col gap-2">
                {group.map(({ spell, classId, dc, attack, ritualAvailable }) => (
                  <SpellRow
                    key={`${classId}:${spell.id}`}
                    spell={spell}
                    dc={dc}
                    attack={attack}
                    castingClass={
                      model.classes.length + model.unsupportedClassIds.length > 1
                        ? registry.get('class', classId).name
                        : undefined
                    }
                    slots={slots}
                    concentrating={spell.id === state.live.concentration?.spellId}
                    unavailable={!hasSlotFor(spell, slots) && !ritualAvailable}
                    onCast={(selected, _level, opener) => {
                      castOpener.current = opener ?? (document.activeElement as HTMLElement);
                      setCasting({ spellId: selected.id, classId, opener: castOpener.current });
                    }}
                    sheetFooter={({ close, trigger }) => (
                      <SpellCastControls
                        spellId={spell.id}
                        classId={classId}
                        returnFocusTo={trigger}
                        onApplied={close}
                      />
                    )}
                    onPin={(spell) => setPinned(spell, classId)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <Sheet
        open={casting !== null}
        onOpenChange={(open) => !open && setCasting(null)}
        title={casting ? `Cast ${registry.get('spell', casting.spellId).name}` : 'Cast spell'}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (castOpener.current?.isConnected
            ? castOpener.current
            : document.getElementById('character-workspace')
          )?.focus();
        }}
      >
        {casting && (
          <LiveSpellDetail
            key={`${casting.classId}:${casting.spellId}`}
            spellId={casting.spellId}
            classId={casting.classId}
            returnFocusTo={casting.opener}
            onApplied={() => setCasting(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

/** Pinned content reads current values instead of retaining a snapshot of the slot pool. */
function LiveSpellDetail({
  spellId,
  classId,
  returnFocusTo,
  onApplied,
}: {
  spellId: string;
  classId: string;
  returnFocusTo?: HTMLElement;
  onApplied?: () => void;
}) {
  const { state, sheet } = useCharacter();
  const model = spellbookModel(state, sheet, registry);
  const entry = model.entries.find(
    (entry) => entry.spell.id === spellId && entry.classId === classId,
  );
  if (!entry) return <p className="text-sm text-text-muted">This spell is no longer selected.</p>;
  return (
    <div className="flex flex-col gap-4">
      <SpellCard spell={entry.spell} dc={entry.dc} attack={entry.attack} />
      <SpellCastControls
        key={`${classId}:${spellId}`}
        spellId={spellId}
        classId={classId}
        returnFocusTo={returnFocusTo}
        onApplied={onApplied}
      />
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
