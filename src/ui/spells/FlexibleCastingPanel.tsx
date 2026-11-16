import { useId, useState } from 'react';
import {
  convertSlotToPoints,
  CONVERT_SLOT,
  createSlot,
  CREATE_SLOT,
  sorceryPoints,
} from '../../engine/commands';
import { SLOT_CREATION_COST } from '../../engine/rules2014';
import { useCommand } from '../commands/command-context';
import { useCharacter } from '../hooks/useCharacter';

const SELECT =
  'min-h-11 w-full min-w-0 rounded-btn border border-border bg-surface-2 px-2 text-sm text-text sm:w-auto sm:flex-1';
const BUTTON =
  'hover-lift min-h-11 rounded-btn border border-accent px-3 text-sm font-semibold text-accent disabled:opacity-40';

/** Sorcerer Flexible Casting: trade spell slots and sorcery points both ways. */
export function FlexibleCastingPanel({ anchorId }: { anchorId?: string }) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const id = useId();
  const [convertKey, setConvertKey] = useState('');
  const [createLevel, setCreateLevel] = useState('');
  const has = (id: string) => sheet.features.some(({ def }) => def.id === id);
  const points = sorceryPoints({ live: state.live, sheet });
  if (!points || (!has(CONVERT_SLOT) && !has(CREATE_SLOT))) return null;
  const live = state.live;

  const slotOptions: { key: string; level: number; label: string }[] = [];
  sheet.slots.max.forEach((max, level) => {
    const left = max - (live.slotsUsed[level] ?? 0);
    if (level > 0 && left > 0)
      slotOptions.push({ key: String(level), level, label: `Level ${level} slot (${left} left)` });
  });
  const pact = sheet.slots.pact;
  if (pact && pact.count - (live.pactSlotsUsed ?? 0) > 0)
    slotOptions.push({
      key: 'pact',
      level: pact.level,
      label: `Pact slot, level ${pact.level} (${pact.count - (live.pactSlotsUsed ?? 0)} left)`,
    });
  const toConvert = slotOptions.find((option) => option.key === convertKey) ?? slotOptions[0];

  const createOptions = Object.entries(SLOT_CREATION_COST).map(([level, cost]) => ({
    level: Number(level),
    cost,
  }));
  const affordable = createOptions.filter(({ cost }) => cost <= points.remaining);
  const toCreate = affordable.find(({ level }) => String(level) === createLevel) ?? affordable[0];
  const created = (sheet.slots.created ?? []).flatMap((count, level) =>
    count > 0 ? [`L${level} ×${count}`] : [],
  );

  return (
    <section
      id={anchorId}
      aria-label="Flexible Casting"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
    >
      <p className="text-sm text-text">
        <span className="font-semibold">Flexible Casting</span>
        <span className="text-text-muted">
          {' '}
          · {points.remaining}/{points.max} sorcery points · bonus action
        </span>
      </p>
      {created.length > 0 && (
        <p className="text-xs text-text-muted">
          Created slots: {created.join(', ')}. They fade on a long rest.
        </p>
      )}
      {has(CONVERT_SLOT) && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-convert`} className="sr-only">
            Slot to turn into sorcery points
          </label>
          {slotOptions.length === 0 ? (
            <p className="text-xs text-text-muted">No spell slots left to convert.</p>
          ) : (
            <>
              <select
                id={`${id}-convert`}
                value={toConvert?.key}
                onChange={(event) => setConvertKey(event.target.value)}
                className={SELECT}
              >
                {slotOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  toConvert &&
                  run(
                    convertSlotToPoints,
                    toConvert.key === 'pact' ? { pact: true } : { slotLevel: toConvert.level },
                  )
                }
                className={BUTTON}
              >
                Convert to {toConvert?.level} point{toConvert?.level === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      )}
      {has(CREATE_SLOT) && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-create`} className="sr-only">
            Slot level to create
          </label>
          {affordable.length === 0 ? (
            <p className="text-xs text-text-muted">
              Creating a slot needs at least {createOptions[0]!.cost} sorcery points.
            </p>
          ) : (
            <>
              <select
                id={`${id}-create`}
                value={toCreate?.level}
                onChange={(event) => setCreateLevel(event.target.value)}
                className={SELECT}
              >
                {affordable.map(({ level, cost }) => (
                  <option key={level} value={level}>
                    Level {level} slot ({cost} points)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => toCreate && run(createSlot, { slotLevel: toCreate.level })}
                className={BUTTON}
              >
                Create level {toCreate?.level} slot
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
