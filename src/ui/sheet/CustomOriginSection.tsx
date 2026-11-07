import { useId, useState } from 'react';
import { ABILITIES, type Ability } from '../../engine/calc/abilities';
import { setCustomOrigin } from '../../engine/commands/custom-origin';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { SectionLabel } from '../components/SectionLabel';

type Mode = 'two' | 'three';

/** Tasha custom origin: replaces racial ability bonuses with a +2/+1 or +1/+1/+1 spread. */
export function CustomOriginSection({ onDone }: { onDone: () => void }) {
  const id = useId();
  const { run } = useCommand();
  const [mode, setMode] = useState<Mode>('two');
  const [picks, setPicks] = useState<(Ability | '')[]>(['', '', '']);
  const [errors, setErrors] = useState<string[]>([]);
  const values = mode === 'two' ? [2, 1] : [1, 1, 1];
  const chosen = picks.slice(0, values.length);
  const ready = chosen.every(Boolean) && new Set(chosen).size === chosen.length;
  return (
    <section
      aria-label="Custom origin"
      className="flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-4"
    >
      <SectionLabel>Custom origin</SectionLabel>
      <p className="text-sm text-text-muted">
        Replaces your race&apos;s ability bonuses with one spread of your choice. It takes effect
        straight away and Undo reverses it.
      </p>
      <Field label="Spread" htmlFor={`${id}-mode`}>
        <select
          id={`${id}-mode`}
          value={mode}
          onChange={(event) => setMode(event.target.value as Mode)}
          className={inputClass}
        >
          <option value="two">+2 and +1</option>
          <option value="three">+1, +1 and +1</option>
        </select>
      </Field>
      {values.map((value, index) => (
        <Field key={index} label={`Ability +${value}`} htmlFor={`${id}-pick-${index}`}>
          <select
            id={`${id}-pick-${index}`}
            value={picks[index]}
            onChange={(event) =>
              setPicks((current) =>
                current.map((entry, at) =>
                  at === index ? (event.target.value as Ability) : entry,
                ),
              )
            }
            className={inputClass}
          >
            <option value="">Choose an ability</option>
            {ABILITIES.map((ability) => (
              <option key={ability} value={ability}>
                {ability}
              </option>
            ))}
          </select>
        </Field>
      ))}
      {errors.length > 0 && (
        <p role="alert" className="text-sm text-text">
          {errors.join(' ')}
        </p>
      )}
      <button
        type="button"
        disabled={!ready}
        className="min-h-11 rounded-btn border border-border px-4 text-sm disabled:opacity-40"
        onClick={() => {
          const result = run(
            setCustomOrigin,
            {
              increases: chosen.map((ability, index) => ({
                ability: ability as Ability,
                value: values[index] as 1 | 2,
              })),
            },
            undefined,
            onDone,
          );
          if (result.result === 'blocked') setErrors(result.reasons);
        }}
      >
        Apply custom origin
      </button>
    </section>
  );
}
