import { useState, type MouseEvent } from 'react';
import { Moon, Tent } from 'lucide-react';
import { registry } from '../../data/registry';
import { endConcentration } from '../../engine/commands';
import { overridePath } from '../../engine/calc/value-overrides';
import { ConcentrationChip } from '../components/chips';
import { HpBar } from '../components/HpBar';
import { CharacterPortrait } from '../components/CharacterPortrait';
import { PipRow } from '../components/PipRow';
import { OverrideMarker, StatChip } from '../components/StatChip';
import { compactInteger, resourceOverride } from '../components/resource-override';
import { useCommand } from '../commands/command-context';
import { useCharacter } from '../hooks/useCharacter';
import { signed } from '../format';
import { useRest } from '../rest/rest-context';
import { HudAdjustments, type HudSelection } from './HudAdjustments';

/** Two HUD rows read the same engine state on every character route. */
export function HudBar() {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const { openShortRest, openLongRest } = useRest();
  const [selection, setSelection] = useState<HudSelection | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { build, live } = state;
  const open = (value: HudSelection) => (event: MouseEvent<HTMLButtonElement>) => {
    setAnchor(event.currentTarget);
    setSelection(value);
  };
  const classLine = build.classes
    .map(
      (entry) =>
        `${registry.get('class', entry.classId).name} ${entry.level}${entry.subclassId ? ` (${registry.get('subclass', entry.subclassId).name})` : ''}`,
    )
    .join(' / ');
  const slots = sheet.slots.max.flatMap((max, level) =>
    max > 0 ? [{ max, level, used: live.slotsUsed[level] ?? 0 }] : [],
  );
  const resource = sheet.features.find((feature) => feature.uses);
  const shownSlots = slots.slice(0, sheet.slots.pact && resource ? 1 : 2);
  const largeHp = [live.hp, live.tempHp, sheet.maxHp.value].some((value) => value >= 1_000_000);
  const concentration = live.concentration && registry.get('spell', live.concentration.spellId);
  const statuses = [
    ...live.conditions,
    ...live.effects.map((effect) => effect.name),
    ...(live.exhaustion > 0 ? [`Exhaustion ${live.exhaustion}`] : []),
  ];
  const control =
    'min-h-11 min-w-11 rounded-btn text-left hover:bg-surface focus-visible:outline-accent';

  return (
    <>
      <header
        aria-label="Character HUD"
        className="@container sticky top-0 z-20 border-b border-border bg-bg/95 px-4 backdrop-blur-sm"
      >
        <div className="flex min-h-11 items-center gap-2">
          <CharacterPortrait
            id={build.id}
            portrait={build.portrait}
            size={20}
            className="hidden shrink-0 text-accent sm:block"
          />
          <p className="min-w-0 truncate">
            <span className="font-display text-base">{build.name}</span>
            <span className="hidden text-xs text-text-muted md:inline"> · {classLine}</span>
          </p>
          <button
            type="button"
            aria-label="Adjust hit points"
            aria-description={`HP ${live.hp} of ${sheet.maxHp.value}; temporary HP ${live.tempHp}`}
            title={`HP ${live.hp}/${sheet.maxHp.value}; temporary HP ${live.tempHp}`}
            onClick={open('hp')}
            className={`${control} ml-auto flex shrink-0 items-center gap-2`}
          >
            <span className="text-xs text-text-muted">HP</span>
            <span className="font-semibold">
              {compactInteger(live.hp)}
              <span className="text-text-muted">/{compactInteger(sheet.maxHp.value)}</span>
              <OverrideMarker override={sheet.maxHp.override} />
            </span>
            {live.tempHp > 0 && (
              <span className="text-xs text-temp">+{compactInteger(live.tempHp)}</span>
            )}
            <HpBar
              current={live.hp}
              max={sheet.maxHp.value}
              className={largeHp ? 'hidden w-10 sm:block sm:w-20' : 'w-10 sm:w-20'}
            />
          </button>
          <button
            type="button"
            title="Armor class"
            aria-description={`Armor class ${sheet.ac.value}`}
            onClick={open('ac')}
            className={`${control} shrink-0`}
          >
            <StatChip
              label="AC"
              value={compactInteger(sheet.ac.value)}
              override={sheet.ac.override}
            />
          </button>
          <span className="hidden shrink-0 gap-2 sm:flex">
            <button
              type="button"
              title="Initiative"
              aria-description={`Initiative ${signed(sheet.initiative.value)}`}
              onClick={open('initiative')}
              className={control}
            >
              <StatChip
                label="Init"
                value={`${sheet.initiative.value >= 0 ? '+' : ''}${compactInteger(sheet.initiative.value)}`}
                override={sheet.initiative.override}
              />
            </button>
            <button
              type="button"
              title="Speed"
              aria-description={`Speed ${sheet.speed.value} feet`}
              onClick={open('speed')}
              className={control}
            >
              <StatChip
                label="Spd"
                value={compactInteger(sheet.speed.value)}
                override={sheet.speed.override}
              />
            </button>
          </span>
        </div>
        <div className="flex h-11 min-w-0 items-center gap-1 sm:gap-2">
          {slots.length > 0 && (
            <button
              type="button"
              aria-label="Adjust spell slots"
              onClick={open('slots')}
              className={`${control} flex min-w-0 shrink-0 items-center gap-1`}
            >
              {shownSlots.map((slot) => (
                <span key={slot.level} className="inline-flex max-w-18 min-w-0 items-center">
                  <PipRow label={`L${slot.level}`} max={slot.max} used={slot.used} size="sm" wrap />
                  <OverrideMarker
                    override={resourceOverride(
                      build,
                      sheet,
                      overridePath('slots', 'max', slot.level),
                      overridePath('slots', 'remaining', slot.level),
                      slot.used,
                      slot.max,
                    )}
                  />
                </span>
              ))}
              {slots.length > shownSlots.length && (
                <span className="text-xs text-magic">+{slots.length - shownSlots.length}</span>
              )}
            </button>
          )}
          {sheet.slots.pact && (
            <button
              type="button"
              aria-label="Adjust Pact Magic slots"
              onClick={open('slots')}
              className={`${control} inline-flex max-w-18 min-w-0 items-center`}
            >
              <PipRow
                label="Pact"
                max={sheet.slots.pact.count}
                used={live.pactSlotsUsed ?? 0}
                size="sm"
                wrap
              />
              <OverrideMarker
                override={resourceOverride(
                  build,
                  sheet,
                  '/slots/pact/count',
                  '/slots/pact/remaining',
                  live.pactSlotsUsed ?? 0,
                  sheet.slots.pact.count,
                )}
              />
            </button>
          )}
          {resource?.uses && (
            <button
              type="button"
              aria-label="Adjust class resources"
              onClick={open('features')}
              className={`${control} inline-flex max-w-20 min-w-0 shrink-0 items-center`}
            >
              <PipRow
                label={
                  resource.def.id === 'feature.bard.bardic-inspiration'
                    ? 'BI'
                    : (resource.def.name.split(' ')[0] ?? resource.def.name)
                }
                max={resource.uses.max}
                used={live.featureUsesSpent[resource.def.id] ?? 0}
                tone="accent"
                size="sm"
                wrap
              />
              <OverrideMarker
                override={resourceOverride(
                  build,
                  sheet,
                  overridePath('features', resource.def.id, 'uses', 'max'),
                  overridePath('features', resource.def.id, 'uses', 'remaining'),
                  live.featureUsesSpent[resource.def.id] ?? 0,
                  resource.uses.max,
                )}
              />
              <OverrideMarker override={resource.dieOverride} />
            </button>
          )}
          {concentration && (
            <ConcentrationChip
              name={concentration.name}
              onEnd={() => run(endConcentration, null)}
              className="ml-auto max-w-32"
            />
          )}
          <button
            type="button"
            aria-label="Adjust conditions and effects"
            onClick={open('status')}
            className={`${control} ml-auto flex min-w-0 shrink-0 items-center gap-1 text-xs text-text-muted`}
          >
            <span className="@min-[1000px]:hidden">
              {statuses.length ? `+${statuses.length}` : 'Status'}
            </span>
            <span className="hidden items-center gap-1 @min-[1000px]:inline-flex">
              {statuses.length
                ? statuses.slice(0, 4).map((status, index) => (
                    <span
                      key={`${status}-${index}`}
                      className="max-w-28 truncate rounded-btn border border-border px-1 capitalize"
                    >
                      {status}
                    </span>
                  ))
                : 'Status'}
              {statuses.length > 4 && `+${statuses.length - 4}`}
            </span>
          </button>
          <div className="hidden shrink-0 gap-2 lg:flex">
            <button
              type="button"
              aria-label="Short Rest"
              onClick={(event) => openShortRest(event.currentTarget)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-btn border border-border bg-surface px-3 text-xs"
            >
              <Tent size={14} aria-hidden />
              Short
            </button>
            <button
              type="button"
              aria-label="Long Rest"
              onClick={(event) => openLongRest(event.currentTarget)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-btn border border-border bg-surface px-3 text-xs"
            >
              <Moon size={14} aria-hidden />
              Long
            </button>
          </div>
        </div>
      </header>
      <HudAdjustments
        key={selection}
        selection={selection}
        anchor={anchor}
        onClose={() => setSelection(null)}
      />
    </>
  );
}
