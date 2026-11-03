import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { healthDetails, rollDeathSave } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { useCharacter } from '../hooks/useCharacter';

/** A manual d20 result drives the engine's 2014 death-save outcomes. */
export function DeathSaveTracker({
  focusFallback,
}: {
  focusFallback?: RefObject<HTMLElement | null>;
}) {
  const { state, sheet, events } = useCharacter();
  const { run } = useCommand();
  const health = healthDetails({ live: state.live, sheet });
  const container = useRef<HTMLElement>(null);
  const rollInput = useRef<HTMLInputElement>(null);
  const recordButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const rollId = useId();
  const modifierId = useId();
  const [value, setValue] = useState('');
  const [modifierValue, setModifierValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const roll = value.trim() ? Number(value) : Number.NaN;
  const modifier = modifierValue.trim() ? Number(modifierValue) : 0;
  const valid = Number.isInteger(roll) && roll >= 1 && roll <= 20 && Number.isSafeInteger(modifier);

  useEffect(() => {
    if (restoreFocus.current) {
      restoreFocus.current = false;
      const target =
        [rollInput.current, container.current, focusFallback?.current].find(
          (element) =>
            element?.isConnected &&
            element.getClientRects().length &&
            !element.matches(':disabled'),
        ) ?? document.getElementById('character-workspace');
      target?.focus();
    }
  }, [events, focusFallback]);

  if (health.hp > 0 && health.status !== 'dead') return null;
  const submit = (rolled: number, includeModifier = false) => {
    setError(null);
    const result = run(
      rollDeathSave,
      { roll: rolled, ...(includeModifier && modifier !== 0 ? { modifier } : {}) },
      container.current ?? undefined,
      () => {
        setValue('');
        setModifierValue('');
        restoreFocus.current = true;
      },
    );
    if (result.result === 'blocked') setError(result.reasons.join(' · '));
  };
  return (
    <section
      ref={container}
      tabIndex={-1}
      aria-label="Death saves"
      className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3"
    >
      <h3 className="font-semibold text-text">
        {health.status === 'dead'
          ? 'Dead'
          : health.status === 'stable'
            ? 'Stable at 0 HP'
            : 'Death saves'}
      </h3>
      <div className="flex flex-wrap gap-3 text-sm">
        <DeathSavePips
          label="Successes"
          count={state.live.deathSaves.success}
          tone="bg-heal border-heal"
        />
        <DeathSavePips
          label="Failures"
          count={state.live.deathSaves.fail}
          tone="bg-danger border-danger"
        />
      </div>
      {health.status === 'stable' && (
        <p className="text-xs text-text-muted">You are stable. No death-save roll is needed.</p>
      )}
      {health.status === 'dead' && (
        <p className="text-xs text-text-muted">
          Death-save rolls and normal healing are unavailable.
        </p>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!health.canRollDeathSave || !valid) return;
          recordButton.current?.focus();
          submit(roll, true);
        }}
      >
        <Field
          label="Death save d20"
          htmlFor={rollId}
          hint="Enter the d20 you rolled, from 1 to 20."
        >
          <input
            ref={rollInput}
            id={rollId}
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            step={1}
            value={value}
            disabled={!health.canRollDeathSave}
            className={inputClass}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field
          label="Other bonus or penalty"
          htmlFor={modifierId}
          hint="Optional external aid or DM adjustment; features are not added automatically. Natural 1 and 20 ignore modifiers."
        >
          <input
            id={modifierId}
            type="number"
            inputMode="numeric"
            step={1}
            placeholder="0"
            value={modifierValue}
            disabled={!health.canRollDeathSave}
            className={inputClass}
            onChange={(event) => {
              setModifierValue(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <button
          ref={recordButton}
          type="submit"
          disabled={!health.canRollDeathSave || !valid}
          className="min-h-14 rounded-btn bg-accent px-3 font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40"
        >
          Record death save
        </button>
        <div className="grid grid-cols-2 gap-2">
          {([1, 20] as const).map((natural) => (
            <button
              key={natural}
              type="button"
              disabled={!health.canRollDeathSave}
              className="min-h-14 rounded-btn border border-border px-3 text-text disabled:cursor-not-allowed disabled:opacity-40"
              onClick={(event) => {
                event.currentTarget.focus();
                submit(natural);
              }}
            >
              Natural {natural}
            </button>
          ))}
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
    </section>
  );
}

function DeathSavePips({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <span
      role="img"
      aria-label={`${label}: ${count} of 3`}
      className="inline-flex items-center gap-2"
    >
      <span>
        {label} {count}/3
      </span>
      <span aria-hidden className="inline-flex gap-1">
        {Array.from({ length: 3 }, (_, index) => (
          <span
            key={index}
            className={`size-2.5 rounded-full border ${index < count ? tone : 'border-text-muted'}`}
          />
        ))}
      </span>
    </span>
  );
}
