import { useState } from 'react';
import type { Ability } from '../../engine/calc/abilities';
import { racialIncreaseValues } from '../../engine/calc/custom-origin';
import { setCustomOrigin } from '../../engine/commands/custom-origin';
import type { RaceDef } from '../../engine/schema';
import { useCommand } from '../commands/command-context';
import { OriginPicker } from '../components/OriginPicker';
import { defaultOriginPicks, originPicksReady, type OriginPicks } from '../components/origin-picks';
import { SectionLabel } from '../components/SectionLabel';

/** Tasha custom origin: moves each of the race's ability increases to an ability of your choice. */
export function CustomOriginSection({
  race,
  onDone,
}: {
  race: RaceDef | undefined;
  onDone: () => void;
}) {
  const { run } = useCommand();
  const [picks, setPicks] = useState<OriginPicks>(() => defaultOriginPicks(race));
  const [errors, setErrors] = useState<string[]>([]);
  const values = race ? racialIncreaseValues(race) : [];
  return (
    <section
      aria-label="Custom origin"
      className="flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-4"
    >
      <SectionLabel>Custom origin</SectionLabel>
      {race && values.length > 0 ? (
        <>
          <p className="text-sm text-text-muted">
            Move each of your race&apos;s increases to any ability, one increase per ability. It
            takes effect straight away and Undo reverses it.
          </p>
          <OriginPicker race={race} picks={picks} onChange={setPicks} />
          {errors.length > 0 && (
            <p role="alert" className="text-sm text-text">
              {errors.join(' ')}
            </p>
          )}
          <button
            type="button"
            disabled={!originPicksReady(race, picks)}
            className="min-h-11 rounded-btn border border-border px-4 text-sm disabled:opacity-40"
            onClick={() => {
              const result = run(
                setCustomOrigin,
                {
                  increases: picks.map((ability, index) => ({
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
        </>
      ) : (
        <p className="text-sm text-text-muted">This race has no ability increases to move.</p>
      )}
    </section>
  );
}
