import { useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { formatClock } from '../../engine/clock';
import { advanceTime, runCommand } from '../../engine/commands';
import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from '../../engine/rules2014';
import { characterStore } from '../../state/character-store';
import { useCommand, type CommandFocusTarget } from '../commands/command-context';
import { inputClass } from '../components/fields';
import { SectionLabel } from '../components/SectionLabel';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';

const PRESETS = [
  { label: '+1 min', seconds: SECONDS_PER_MINUTE },
  { label: '+10 min', seconds: 10 * SECONDS_PER_MINUTE },
  { label: '+1 h', seconds: SECONDS_PER_HOUR },
  { label: '+8 h', seconds: 8 * SECONDS_PER_HOUR },
];

/** Explicit game-time choices; the saved clock never follows the device clock. */
export function GameClockControl() {
  const { state } = useCharacter();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <section
      aria-label="Game clock"
      className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface px-3 py-2"
    >
      <div>
        <SectionLabel>Game clock</SectionLabel>
        <p className="text-sm text-text">{formatClock(state.live.clock.seconds)}</p>
      </div>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-btn border border-border px-3 text-sm text-accent"
      >
        Advance time
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Advance game time"
        description="Choose elapsed game time. Turns and rests also advance this clock."
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        {open && (
          <ClockAdvanceForm onClose={() => setOpen(false)} returnFocusTo={() => opener.current} />
        )}
      </Sheet>
    </section>
  );
}

function ClockAdvanceForm({
  onClose,
  returnFocusTo,
}: {
  onClose: () => void;
  returnFocusTo: CommandFocusTarget;
}) {
  const { state } = useCharacter();
  const { run } = useCommand();
  const automation = useStore(characterStore, (store) => store.automation);
  const [values, setValues] = useState({ Days: '0', Hours: '1', Minutes: '0' });
  const inputId = useId();
  const entries = Object.entries(values);
  const invalid = entries.some(
    ([, value]) =>
      value.trim() !== '' &&
      (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value.trim()))),
  );
  const seconds = invalid
    ? NaN
    : Number(values.Days || 0) * SECONDS_PER_DAY +
      Number(values.Hours || 0) * SECONDS_PER_HOUR +
      Number(values.Minutes || 0) * SECONDS_PER_MINUTE;
  const customError = invalid
    ? 'Use non-negative whole numbers for days, hours and minutes.'
    : seconds === 0
      ? 'Choose a positive amount of game time.'
      : undefined;
  const options = {
    eventId: 'preview.advance-time',
    realTime: '1970-01-01T00:00:00.000Z',
    automation,
  };
  const checked = runCommand(advanceTime, state, { seconds }, registry, options);
  const projected =
    checked.result === 'warn'
      ? runCommand(advanceTime, state, { seconds }, registry, { ...options, force: true })
      : checked;
  const presets = PRESETS.map((preset) => ({
    ...preset,
    result: runCommand(advanceTime, state, { seconds: preset.seconds }, registry, options),
  }));
  const presetBlocks = [
    ...new Set(
      presets.flatMap(({ result }) => (result.result === 'blocked' ? result.reasons : [])),
    ),
  ];
  const errors = [
    ...new Set([
      ...(customError ? [customError] : projected.result !== 'ok' ? projected.reasons : []),
    ]),
  ];
  const apply = (amount: number, control: HTMLButtonElement) => {
    control.focus();
    run(advanceTime, { seconds: amount }, returnFocusTo, onClose);
  };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="flex flex-col gap-2" aria-label="Time presets">
        <SectionLabel>Advance by</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={preset.result.result === 'blocked'}
              onClick={(event) => apply(preset.seconds, event.currentTarget)}
              className="min-h-11 rounded-btn border border-border px-3 text-sm text-accent disabled:opacity-40"
            >
              {preset.label}
            </button>
          ))}
        </div>
        {presetBlocks.length > 0 && (
          <p role="note" className="text-xs text-warn">
            Some presets are unavailable: {presetBlocks.join(' · ')}
          </p>
        )}
      </section>
      <fieldset className="grid grid-cols-3 gap-2">
        <legend className="mb-2 text-xs font-semibold text-text-muted uppercase">
          Custom duration
        </legend>
        {entries.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${inputId}-${label}`} className="text-xs text-text-muted">
              {label}
            </label>
            <input
              id={`${inputId}-${label}`}
              type="text"
              inputMode="numeric"
              value={value}
              onChange={(event) =>
                setValues((current) => ({ ...current, [label]: event.target.value }))
              }
              className={inputClass}
            />
          </div>
        ))}
      </fieldset>
      <section
        aria-label="Time preview"
        className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 text-sm"
      >
        <SectionLabel>Time preview</SectionLabel>
        {errors.length > 0 ? (
          <ul role="alert" className="space-y-1 text-warn">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : (
          projected.result === 'ok' && (
            <p className="text-text">
              {formatClock(state.live.clock.seconds)} →{' '}
              {formatClock(projected.next.live.clock.seconds)}
            </p>
          )
        )}
        {checked.result === 'warn' && (
          <div role="note" className="text-warn">
            {checked.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            <p>Advancing manually will ask for confirmation.</p>
          </div>
        )}
      </section>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-btn border border-border text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!!customError || projected.result !== 'ok'}
          onClick={(event) => apply(seconds, event.currentTarget)}
          className="min-h-14 rounded-btn bg-accent px-2 font-semibold text-bg disabled:opacity-40"
        >
          Advance time
        </button>
      </div>
    </div>
  );
}
