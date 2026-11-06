import { useRef, useState } from 'react';
import { EXHAUSTION_LEVELS } from '../../engine/calc/conditions';
import { Popover, Tabs } from 'radix-ui';
import { X } from 'lucide-react';
import {
  adjustSlot,
  adjustFeatureUses,
  removeEffect,
  toggleCondition,
  setExhaustion,
} from '../../engine/commands';
import { CONDITIONS } from '../../engine/rules2014';
import { overridePath } from '../../engine/calc/value-overrides';
import { HpAdjustmentBody, type HpKind } from '../components/HpControl';
import { DeathSaveTracker } from '../health/DeathSaveTracker';
import { StatBreakdown } from '../components/StatBreakdown';
import { PipStepper } from '../components/PipStepper';
import { OverrideMarker } from '../components/StatChip';
import { resourceOverride } from '../components/resource-override';
import { Sheet } from '../components/Sheet';
import { useCommand } from '../commands/command-context';
import { useCharacter } from '../hooks/useCharacter';
import { POPOVER_QUERY, useMediaQuery } from '../hooks/useMediaQuery';

export type HudSelection = 'hp' | 'slots' | 'features' | 'ac' | 'initiative' | 'speed' | 'status';
const TITLES: Record<HudSelection, string> = {
  hp: 'Hit points',
  slots: 'Spell slots',
  features: 'Class resources',
  ac: 'Armor class',
  initiative: 'Initiative',
  speed: 'Speed',
  status: 'Conditions and effects',
};

/** Editable pools use commands. Derived stats show their engine breakdowns. */
export function HudAdjustments({
  selection,
  anchor,
  onClose,
}: {
  selection: HudSelection | null;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const desktop = useMediaQuery(POPOVER_QUERY);
  const { state, sheet } = useCharacter();
  const { run, warningOpen } = useCommand();
  const [kind, setKind] = useState<HpKind>('damage');
  const hpBody = useRef<HTMLDivElement>(null);
  const title = selection ? TITLES[selection] : '';
  const { build, live } = state;
  const body = (
    <>
      {selection === 'hp' && (
        <div ref={hpBody} tabIndex={-1}>
          {sheet.maxHp.override && (
            <p className="mb-3 text-sm break-all text-text-muted">
              Maximum HP {sheet.maxHp.value}
              <OverrideMarker override={sheet.maxHp.override} />
            </p>
          )}
          <Tabs.Root value={kind} onValueChange={(value) => setKind(value as HpKind)}>
            <Tabs.List
              aria-label="HP adjustment"
              className="mb-3 grid grid-cols-3 gap-1 rounded-btn bg-bg p-1"
            >
              {(['damage', 'heal', 'temp'] as const).map((value) => (
                <Tabs.Trigger
                  key={value}
                  value={value}
                  className="min-h-11 rounded-btn text-sm text-text-muted data-[state=active]:bg-surface data-[state=active]:text-accent"
                >
                  {value === 'damage' ? 'Damage' : value === 'heal' ? 'Heal' : 'Temp HP'}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value={kind}>
              <HpAdjustmentBody
                key={kind}
                kind={kind}
                returnFocusTo={anchor ?? undefined}
                onApplied={onClose}
              />
            </Tabs.Content>
          </Tabs.Root>
          <div className="mt-3">
            <DeathSaveTracker focusFallback={hpBody} />
          </div>
        </div>
      )}
      {selection === 'slots' && (
        <div className="flex flex-col gap-3">
          {sheet.slots.max.map(
            (max, level) =>
              (max > 0 || (level > 0 && (live.slotsUsed[level] ?? 0) > 0)) && (
                <div key={level} className="flex flex-wrap items-center justify-between gap-2">
                  <span>Level {level}</span>
                  <PipStepper
                    label={`Level ${level} spell slots`}
                    max={max}
                    used={live.slotsUsed[level] ?? 0}
                    override={resourceOverride(
                      build,
                      sheet,
                      overridePath('slots', 'max', level),
                      overridePath('slots', 'remaining', level),
                      live.slotsUsed[level] ?? 0,
                      max,
                    )}
                    onUse={() => run(adjustSlot, { level, used: (live.slotsUsed[level] ?? 0) + 1 })}
                    onRestore={() =>
                      run(adjustSlot, { level, used: (live.slotsUsed[level] ?? 0) - 1 })
                    }
                  />
                  {(live.slotsUsed[level] ?? 0) > max && (
                    <p className="basis-full text-xs text-warn">
                      Recorded spending exceeds this maximum. Correct remaining in Sheet Edit mode,
                      or undo the maximum change.
                    </p>
                  )}
                </div>
              ),
          )}
          {sheet.slots.pact && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Pact L{sheet.slots.pact.level}
                <OverrideMarker override={sheet.values['/slots/pact/level']?.stat.override} />
              </span>
              <PipStepper
                label="Pact Magic slots"
                max={sheet.slots.pact.count}
                used={live.pactSlotsUsed ?? 0}
                override={resourceOverride(
                  build,
                  sheet,
                  '/slots/pact/count',
                  '/slots/pact/remaining',
                  live.pactSlotsUsed ?? 0,
                  sheet.slots.pact.count,
                )}
                onUse={() =>
                  run(adjustSlot, { level: 'pact', used: (live.pactSlotsUsed ?? 0) + 1 })
                }
                onRestore={() =>
                  run(adjustSlot, { level: 'pact', used: (live.pactSlotsUsed ?? 0) - 1 })
                }
              />
              {(live.pactSlotsUsed ?? 0) > sheet.slots.pact.count && (
                <p className="basis-full text-xs text-warn">
                  Recorded spending exceeds this maximum. Correct remaining in Sheet Edit mode, or
                  undo the maximum change.
                </p>
              )}
            </div>
          )}
          {!sheet.slots.max.some(
            (max, level) => max > 0 || (level > 0 && (live.slotsUsed[level] ?? 0) > 0),
          ) &&
            !sheet.slots.pact && <p className="text-text-muted">No spell slots.</p>}
        </div>
      )}
      {selection === 'features' && (
        <div className="flex flex-col gap-4">
          {sheet.features
            .filter((feature) => feature.uses)
            .map((feature) => (
              <section key={feature.def.id}>
                <h3 className="mb-2 font-semibold">
                  {feature.def.name}
                  {feature.die && ` (${feature.die})`}
                  <OverrideMarker override={feature.dieOverride} />
                </h3>
                <PipStepper
                  label={feature.def.name}
                  max={feature.uses!.max}
                  used={live.featureUsesSpent[feature.def.id] ?? 0}
                  tone="accent"
                  override={resourceOverride(
                    build,
                    sheet,
                    overridePath('features', feature.def.id, 'uses', 'max'),
                    overridePath('features', feature.def.id, 'uses', 'remaining'),
                    live.featureUsesSpent[feature.def.id] ?? 0,
                    feature.uses!.max,
                  )}
                  onUse={() =>
                    run(adjustFeatureUses, {
                      featureId: feature.def.id,
                      spent: (live.featureUsesSpent[feature.def.id] ?? 0) + 1,
                    })
                  }
                  onRestore={() =>
                    run(adjustFeatureUses, {
                      featureId: feature.def.id,
                      spent: (live.featureUsesSpent[feature.def.id] ?? 0) - 1,
                    })
                  }
                />
                {(live.featureUsesSpent[feature.def.id] ?? 0) > feature.uses!.max && (
                  <p className="mt-2 text-xs text-warn">
                    Recorded spending exceeds this maximum. Correct remaining in Sheet Edit mode, or
                    undo the maximum change.
                  </p>
                )}
                <p className="mt-2 text-xs text-text-muted">
                  Restores:{' '}
                  {
                    {
                      short: 'Short rest',
                      long: 'Long rest',
                      dawn: 'Dawn',
                      none: 'Manual adjustment',
                    }[feature.uses!.recharge]
                  }
                  .
                </p>
              </section>
            ))}
        </div>
      )}
      {(selection === 'ac' || selection === 'initiative' || selection === 'speed') && (
        <>
          <StatBreakdown
            stat={
              selection === 'ac'
                ? sheet.ac
                : selection === 'initiative'
                  ? sheet.initiative
                  : sheet.speed
            }
          />
          <p className="mt-3 text-xs text-text-muted">
            Edit noted overrides from Character Sheet Edit mode.
          </p>
        </>
      )}
      {selection === 'status' && (
        <div className="flex flex-col gap-4">
          <section>
            <h3 className="mb-2 font-semibold">Conditions</h3>
            <div className="grid grid-cols-2 gap-1">
              {CONDITIONS.map((condition) => (
                <label key={condition} className="flex min-h-11 items-center gap-2 capitalize">
                  <input
                    type="checkbox"
                    checked={live.conditions.includes(condition)}
                    onChange={() => run(toggleCondition, { condition })}
                  />
                  {condition}
                </label>
              ))}
            </div>
          </section>
          <label className="flex min-h-11 items-center justify-between">
            Exhaustion (2014)
            <select
              aria-label="Exhaustion"
              value={live.exhaustion}
              onChange={(event) => run(setExhaustion, { level: Number(event.target.value) })}
              className="min-h-11 rounded-btn border border-border bg-bg px-3"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          {live.exhaustion > 0 && (
            <p className="-mt-3 text-xs text-text-muted">
              {EXHAUSTION_LEVELS.slice(0, live.exhaustion).join(' · ')}
            </p>
          )}
          <section>
            <h3 className="mb-2 font-semibold">Effects on you</h3>
            {live.effects.length === 0 ? (
              <p className="text-text-muted">None</p>
            ) : (
              live.effects.map((effect) => (
                <div key={effect.id} className="flex min-h-11 items-center justify-between gap-2">
                  <span>{effect.name}</span>
                  <button
                    type="button"
                    onClick={() => run(removeEffect, { effectId: effect.id })}
                    className="min-h-11 px-2 text-accent"
                  >
                    End {effect.name}
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </>
  );

  if (!desktop)
    return (
      <Sheet
        open={selection !== null}
        onOpenChange={(open) => !open && onClose()}
        title={title}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          anchor?.focus();
        }}
      >
        {body}
      </Sheet>
    );
  return (
    <Popover.Root open={selection !== null} onOpenChange={(open) => !open && onClose()}>
      <Popover.Anchor virtualRef={{ current: anchor }} />
      <Popover.Portal>
        <Popover.Content
          aria-label={title}
          align="end"
          sideOffset={6}
          collisionPadding={8}
          onInteractOutside={(event) => {
            if (warningOpen) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            anchor?.focus();
          }}
          className="z-40 max-h-[min(85dvh,var(--radix-popover-content-available-height))] w-96 max-w-[calc(100vw-16px)] overflow-y-auto rounded-card border border-border bg-surface-2 p-4 shadow-pop"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{title}</h2>
            <Popover.Close
              aria-label="Close"
              className="grid size-11 place-items-center text-text-muted"
            >
              <X size={20} aria-hidden />
            </Popover.Close>
          </div>
          {body}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
