import { useId } from 'react';
import { ABILITIES, type Ability } from '../../engine/calc/abilities';
import { racialIncreaseSlots } from '../../engine/calc/custom-origin';
import type { RaceDef } from '../../engine/schema';
import { Field, inputClass } from './fields';
import type { OriginPicks } from './origin-picks';

/** Tasha custom origin: one ability picker per racial increase; an ability takes only one. */
export function OriginPicker({
  race,
  picks,
  onChange,
}: {
  race: RaceDef;
  picks: OriginPicks;
  onChange: (picks: OriginPicks) => void;
}) {
  const id = useId();
  const slots = racialIncreaseSlots(race);
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
      {slots.map(({ value }, index) => (
        <Field
          key={index}
          label={`Increase ${index + 1} (+${value})`}
          htmlFor={`${id}-pick-${index}`}
        >
          <select
            id={`${id}-pick-${index}`}
            value={picks[index] ?? ''}
            onChange={(event) =>
              onChange(
                slots.map((_slot, at) =>
                  at === index ? (event.target.value as Ability | '') : (picks[at] ?? ''),
                ),
              )
            }
            className={inputClass}
          >
            <option value="">Choose</option>
            {ABILITIES.map((ability) => (
              <option
                key={ability}
                value={ability}
                disabled={picks.some((pick, at) => at !== index && pick === ability)}
              >
                {ability}
              </option>
            ))}
          </select>
        </Field>
      ))}
    </div>
  );
}
