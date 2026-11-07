import { useState } from 'react';
import { Dices } from 'lucide-react';
import { useStore } from 'zustand';
import { parseDice, rollD20, rollDice, type D20Mode } from '../../engine/calc/dice';
import { deviceStore } from '../../state/device-settings';
import { Sheet } from '../components/Sheet';
import { Field, inputClass } from '../components/fields';
import { describeRoll } from './dice-format';

const QUICK = [4, 6, 8, 10, 12, 20, 100];
const MODES: { value: D20Mode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'advantage', label: 'Advantage' },
  { value: 'disadvantage', label: 'Disadvantage' },
];

/** Floating dice button and tray. Rendered only while the roller is on in Settings. */
export function DiceTray() {
  const enabled = useStore(deviceStore, (state) => state.diceRoller);
  const history = useStore(deviceStore, (state) => state.history);
  const [open, setOpen] = useState(false);
  const [expression, setExpression] = useState('');
  const [mode, setMode] = useState<D20Mode>('normal');
  if (!enabled) return null;

  const add = deviceStore.getState().addRoll;
  const quick = (sides: number) => {
    if (sides === 20) {
      const result = rollD20(0, mode);
      add({
        label: 'd20',
        expression: result.expression,
        detail: describeRoll(result),
        total: result.total,
        ...(mode === 'normal' ? {} : { note: mode }),
      });
      return;
    }
    const result = rollDice(`1d${sides}`)!;
    add({
      label: `d${sides}`,
      expression: result.expression,
      detail: describeRoll(result),
      total: result.total,
    });
  };
  const custom = parseDice(expression);
  const rollCustom = () => {
    const result = rollDice(expression);
    if (!result) return;
    add({
      label: 'Custom',
      expression: result.expression,
      detail: describeRoll(result),
      total: result.total,
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open dice roller"
        className="fixed right-3 bottom-20 z-30 flex size-12 items-center justify-center rounded-full border border-border bg-surface-2 text-accent shadow-pop sm:bottom-4"
      >
        <Dices aria-hidden className="size-6" />
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Dice roller"
        description="Results are only shown here. Enter hits, saves and damage yourself."
      >
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-wrap gap-x-4">
            <legend className="mb-1 text-xs text-text-muted">d20 rolls</legend>
            {MODES.map(({ value, label }) => (
              <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="d20-mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="accent-(--omni-accent)"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((sides) => (
              <button
                key={sides}
                type="button"
                onClick={() => quick(sides)}
                className="min-h-11 min-w-14 rounded-btn border border-border px-3 text-sm"
              >
                d{sides}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              rollCustom();
            }}
          >
            <Field
              label="Expression"
              htmlFor="dice-expression"
              hint="Example: 2d6+3"
              className="flex-1"
            >
              <input
                id="dice-expression"
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
                className={inputClass}
                autoComplete="off"
              />
            </Field>
            <button
              type="submit"
              disabled={!custom}
              className="min-h-11 rounded-btn border border-accent px-4 text-sm text-accent disabled:opacity-50"
            >
              Roll
            </button>
          </form>
          <section aria-label="Roll history" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">History</h3>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => deviceStore.getState().clearHistory()}
                  className="min-h-11 px-2 text-sm text-text-muted"
                >
                  Clear
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-text-muted">No rolls yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-baseline justify-between gap-3 rounded-card border border-border bg-surface px-3 py-2"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{entry.label}</span>{' '}
                      <span className="text-text-muted">
                        {entry.expression} {entry.detail}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </span>
                    </span>
                    <span className="text-lg font-semibold">{entry.total}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Sheet>
    </>
  );
}
