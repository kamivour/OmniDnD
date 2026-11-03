import { useState, type MouseEvent } from 'react';
import { Moon, Tent } from 'lucide-react';
import { registry } from '../../data/registry';
import { endConcentration } from '../../engine/commands';
import { ConcentrationChip } from '../components/chips';
import { HpBar } from '../components/HpBar';
import { Icon } from '../components/Icon';
import { PipRow } from '../components/PipRow';
import { StatChip } from '../components/StatChip';
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
          <Icon
            id={`character.${build.id}`}
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
            onClick={open('hp')}
            className={`${control} ml-auto flex shrink-0 items-center gap-2`}
          >
            <span className="text-xs text-text-muted">HP</span>
            <span className="font-semibold">
              {live.hp}
              <span className="text-text-muted">/{sheet.maxHp.value}</span>
            </span>
            {live.tempHp > 0 && <span className="text-xs text-temp">+{live.tempHp}</span>}
            <HpBar current={live.hp} max={sheet.maxHp.value} className="w-10 sm:w-20" />
          </button>
          <button
            type="button"
            title="Armor class"
            onClick={open('ac')}
            className={`${control} shrink-0`}
          >
            <StatChip label="AC" value={sheet.ac.value} />
          </button>
          <span className="hidden shrink-0 gap-2 sm:flex">
            <button
              type="button"
              title="Initiative"
              onClick={open('initiative')}
              className={control}
            >
              <StatChip label="Init" value={signed(sheet.initiative.value)} />
            </button>
            <button type="button" title="Speed" onClick={open('speed')} className={control}>
              <StatChip label="Spd" value={sheet.speed.value} />
            </button>
          </span>
        </div>
        <div className="flex h-11 min-w-0 items-center gap-2">
          {slots.length > 0 && (
            <button
              type="button"
              aria-label="Adjust spell slots"
              onClick={open('slots')}
              className={`${control} flex shrink-0 items-center gap-2`}
            >
              {slots.slice(0, 2).map((slot) => (
                <PipRow
                  key={slot.level}
                  label={`L${slot.level}`}
                  max={slot.max}
                  used={slot.used}
                  size="sm"
                />
              ))}
              {slots.length > 2 && <span className="text-xs text-magic">+{slots.length - 2}</span>}
            </button>
          )}
          {sheet.slots.pact && (
            <button
              type="button"
              aria-label="Adjust Pact Magic slots"
              onClick={open('slots')}
              className={control}
            >
              <PipRow
                label="Pact"
                max={sheet.slots.pact.count}
                used={live.pactSlotsUsed ?? 0}
                size="sm"
              />
            </button>
          )}
          {resource?.uses && (
            <button
              type="button"
              aria-label="Adjust class resources"
              onClick={open('features')}
              className={`${control} shrink-0`}
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
              />
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
