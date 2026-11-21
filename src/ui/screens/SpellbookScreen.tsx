import { useEffect, useRef, useState } from 'react';
import { useTourAutostart } from '../tutorial/useTour';
import { registry, registryFor } from '../../data/registry';
import { adjustSlot, setSpellFavorite, spellCastDetails } from '../../engine/commands';
import { overridePath } from '../../engine/calc/value-overrides';
import { useCommand } from '../commands/command-context';
import { Sheet } from '../components/Sheet';
import { PipStepper } from '../components/PipStepper';
import { OverrideMarker } from '../components/StatChip';
import { resourceOverride } from '../components/resource-override';
import { SectionLabel } from '../components/SectionLabel';
import { SpellRow } from '../components/SpellRow';
import { type Cost, type SpellView } from '../fixtures/the-fool';
import { useCharacter } from '../hooks/useCharacter';
import { signed } from '../format';
import { useDetail } from '../layout/detail-context';
import { castingLabel, spellbookModel, spellUnavailable } from '../spells/spellbook-model';
import { SpellCastControls } from '../spells/SpellCastControls';
import { SpellManage } from '../spells/SpellManage';
import { FlexibleCastingPanel } from '../spells/FlexibleCastingPanel';
import { LiveSpellDetail } from '../spells/LiveSpellDetail';
import { useTodo } from '../todo/useTodo';
import { SpellFilterBar } from '../spells/SpellFilterBar';
import {
  levelLabel,
  matches,
  NO_FILTERS,
  sortEntries,
  type Filters,
  type SpellSort,
} from '../spells/spell-filters';

const COSTS: Cost[] = ['A', 'BA', 'R'];

/**
 * Frame B (DESIGN.md §8). Filters are view state only; they never touch the character.
 * Desktop: hover previews, click pins into the right panel (slot picker + Cast).
 * Mobile: tap opens the sheet with the same slot picker.
 */
export function SpellbookScreen() {
  const { state, sheet, events } = useCharacter();
  const { run } = useCommand();
  useTourAutostart('spells');
  const model = spellbookModel(state, sheet, registry);
  const { slots, levels } = model;
  const context = { ...state, sheet, registry: registryFor(state.build) };
  const entries = model.entries.map((entry) => {
    // Feat spells carry the feature id in `classId` (Ritual Caster casts them as rituals).
    const via = entry.feat ? { featureId: entry.classId } : { classId: entry.classId };
    const ritualAvailable =
      !state.live.combat &&
      spellCastDetails(context, { spellId: entry.spell.id, ...via }).ritualEligible;
    return { ...entry, unavailable: spellUnavailable(entry, slots, ritualAvailable) };
  });
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SpellSort>('level');
  const [manageOpen, setManageOpen] = useState(false);
  const [manageClass, setManageClass] = useState<string | undefined>(undefined);
  const [manageFocus, setManageFocus] = useState<'cantrips' | 'spells' | undefined>(undefined);
  const manageOpener = useRef<HTMLButtonElement>(null);
  const [casting, setCasting] = useState<{
    spellId: string;
    classId: string;
    opener?: HTMLElement;
  } | null>(null);
  const castOpener = useRef<HTMLElement | null>(null);
  const favoritesFilter = useRef<HTMLButtonElement>(null);
  const restoreFavoritesFocus = useRef(false);
  useEffect(() => {
    if (restoreFavoritesFocus.current) {
      restoreFavoritesFocus.current = false;
      favoritesFilter.current?.focus();
    }
  }, [events]);
  const { pin } = useDetail();

  const setPinned = (spell: SpellView, classId: string) =>
    pin(<LiveSpellDetail spellId={spell.id} classId={classId} />);

  const visible = entries.filter(({ spell, unavailable }) =>
    matches(spell, filters, unavailable, state.build.favorites.includes(spell.id)),
  );
  const costs = [...new Set<Cost>([...COSTS, ...entries.map(({ spell }) => spell.cost)])];
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  // Picks skipped at level up stay here until made: cantrips under Cantrips, the rest under the
  // first spell level. Hidden while filtering so search results stay clean.
  const pendingSpells = useTodo().open.filter((item) => item.area === 'spells' && !filtered);
  const leveledHome = levels.find((level) => level > 0) ?? 1;
  const pendingAt = (level: number) =>
    pendingSpells.filter((item) =>
      level === 0 ? item.kind === 'cantrips' : level === leveledHome && item.kind !== 'cantrips',
    );
  const shownLevels = [
    ...new Set([
      ...levels,
      ...(pendingAt(0).length > 0 ? [0] : []),
      ...(pendingAt(leveledHome).length > 0 ? [leveledHome] : []),
    ]),
  ].sort((a, b) => a - b);
  const openManage = (classId?: string, focus?: 'cantrips' | 'spells') => {
    setManageClass(classId);
    setManageFocus(focus);
    setManageOpen(true);
  };

  type Slot = (typeof slots)[number];
  const slotStepper = (slot: Slot, className?: string) => {
    const level = slot.level;
    return (
      <PipStepper
        label={`Level ${level} spell slots`}
        max={slot.max}
        used={slot.used}
        override={resourceOverride(
          state.build,
          sheet,
          overridePath('slots', 'max', level),
          overridePath('slots', 'remaining', level),
          slot.used,
          slot.max,
        )}
        onUse={() => run(adjustSlot, { level, used: slot.used + 1 })}
        onRestore={() => run(adjustSlot, { level, used: slot.used - 1 })}
        onSetUsed={(used) => run(adjustSlot, { level, used })}
        className={className}
      />
    );
  };
  const pendingButton = (item: (typeof pendingSpells)[number]) => (
    <button
      key={item.id}
      type="button"
      onClick={() => openManage(item.classId, item.kind === 'cantrips' ? 'cantrips' : 'spells')}
      className="flex min-h-11 items-center gap-2 rounded-card border border-dashed border-accent px-3 py-2 text-left text-sm text-text hover:bg-surface-2"
    >
      <span className="font-semibold text-accent">Pending</span>
      <span className="min-w-0 wrap-anywhere">{item.label}</span>
    </button>
  );
  const spellRow = (entry: (typeof entries)[number]) => {
    const { spell, classId, dc, attack, alwaysFrom, unavailable } = entry;
    return (
      <SpellRow
        key={`${classId}:${spell.id}`}
        spell={spell}
        dc={dc}
        attack={attack}
        alwaysFrom={alwaysFrom}
        favorite={state.build.favorites.includes(spell.id)}
        onFavorite={() => {
          const favorite = state.build.favorites.includes(spell.id);
          restoreFavoritesFocus.current = filters.favorites && favorite;
          const result = run(setSpellFavorite, {
            spellId: spell.id,
            favorite: !favorite,
          });
          if (result.result !== 'ok') restoreFavoritesFocus.current = false;
        }}
        castingClass={castingLabel(entry, model, registry)}
        slots={slots}
        concentrating={spell.id === state.live.concentration?.spellId}
        unavailable={unavailable}
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
    );
  };
  const flat = sort === 'level' ? [] : sortEntries(visible, sort);

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-4 lg:px-6">
      <div className="flex min-w-0 flex-col gap-4">
        <header data-tour="spells-header" className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-lg text-text">Spells</h1>
          <div className="flex flex-col gap-1 text-xs text-text-muted">
            {model.classes.map((casting) => (
              <p key={casting.classId} className="min-w-0 wrap-anywhere">
                {model.classes.length > 1 && `${casting.name} · `}
                Save DC{' '}
                <span className="font-semibold text-text">
                  {casting.dc}
                  <OverrideMarker
                    override={
                      sheet.values[overridePath('spellcasting', casting.classId, 'saveDc')]?.stat
                        .override
                    }
                  />
                </span>{' '}
                · Attack{' '}
                <span className="font-semibold text-text">
                  {signed(casting.attack)}
                  <OverrideMarker
                    override={
                      sheet.values[overridePath('spellcasting', casting.classId, 'attack')]?.stat
                        .override
                    }
                  />
                </span>{' '}
                · Cantrips {casting.cantrips}
                {casting.cantripLimit === undefined ? '' : ` / ${casting.cantripLimit}`}
                <OverrideMarker
                  override={
                    sheet.values[overridePath('spellcasting', casting.classId, 'cantripsKnown')]
                      ?.stat.override
                  }
                />
                {casting.mode !== 'prepared' && (
                  <>
                    {' '}
                    · {casting.mode === 'spellbook' ? 'Book' : 'Known'} {casting.known}
                    {casting.knownLimit === undefined ? '' : ` / ${casting.knownLimit}`}
                    <OverrideMarker
                      override={
                        sheet.values[overridePath('spellcasting', casting.classId, 'spellsKnown')]
                          ?.stat.override
                      }
                    />
                  </>
                )}
                {(casting.mode === 'prepared' || casting.mode === 'spellbook') && (
                  <>
                    {' '}
                    · Prepared {casting.prepared}
                    {casting.preparedLimit === undefined ? '' : ` / ${casting.preparedLimit}`}
                    <OverrideMarker
                      override={
                        sheet.values[overridePath('spellcasting', casting.classId, 'preparedLimit')]
                          ?.stat.override
                      }
                    />
                  </>
                )}
              </p>
            ))}
          </div>
          <button
            ref={manageOpener}
            type="button"
            data-tour="spells-manage"
            onClick={() => openManage()}
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

        <FlexibleCastingPanel anchorId="flexible-casting" />

        <SpellFilterBar
          filters={filters}
          onChange={setFilters}
          sort={sort}
          onSort={setSort}
          levels={levels}
          costs={costs}
          favoritesRef={favoritesFilter}
        />

        {visible.length === 0 && (
          <p className="py-8 text-center text-text-muted">
            {model.entries.length === 0
              ? pendingSpells.length > 0
                ? 'No spells selected yet. Use a Pending button below to choose.'
                : 'No spells selected yet.'
              : 'No spells match these filters.'}
          </p>
        )}

        {sort === 'level' ? (
          shownLevels.map((level) => {
            const group = visible.filter(({ spell }) => spell.level === level);
            const slot = slots.find((s) => s.level === level);
            const picks = pendingAt(level);
            if (group.length === 0 && !slot && picks.length === 0) return null;
            return (
              <section key={level} aria-label={levelLabel(level)} className="flex flex-col gap-2">
                <div className="flex min-h-11 flex-wrap items-center gap-3">
                  <SectionLabel>{levelLabel(level)}</SectionLabel>
                  {slot && slotStepper(slot, 'ml-auto')}
                </div>
                {picks.map(pendingButton)}
                <ul className="flex flex-col gap-2">{group.map(spellRow)}</ul>
              </section>
            );
          })
        ) : (
          <>
            {slots.length > 0 && (
              <section aria-label="Spell slots" className="flex flex-wrap gap-x-4 gap-y-2">
                {slots.map((slot) => (
                  <div key={slot.level} className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">L{slot.level}</span>
                    {slotStepper(slot)}
                  </div>
                ))}
              </section>
            )}
            {pendingSpells.map(pendingButton)}
            {flat.length > 0 && (
              <section aria-label="Spells" className="flex flex-col gap-2">
                <ul className="flex flex-col gap-2">{flat.map(spellRow)}</ul>
              </section>
            )}
          </>
        )}

        {slots.length > 0 && (
          <p className="text-xs text-text-muted">
            − uses one slot; + restores one. Small pools also let you tap a pip to set remaining
            slots.
          </p>
        )}
      </div>
      <Sheet
        open={manageOpen}
        onOpenChange={setManageOpen}
        title="Manage spells"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (manageOpener.current?.isConnected
            ? manageOpener.current
            : document.getElementById('character-workspace')
          )?.focus();
        }}
      >
        <SpellManage
          key={`${manageClass ?? ''}:${manageFocus ?? ''}`}
          initialClassId={manageClass}
          focus={manageFocus}
          onClose={() => setManageOpen(false)}
        />
      </Sheet>
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
