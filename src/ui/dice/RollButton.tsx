import { useState } from 'react';
import { useStore } from 'zustand';
import { criticalDice, rollD20, rollDice, type D20Mode } from '../../engine/calc/dice';
import { deviceStore } from '../../state/device-settings';
import { describeRoll } from './dice-format';

type RollSpec =
  | { kind: 'd20'; bonus: number; mode?: D20Mode }
  | { kind: 'dice'; expression: string; critical?: boolean };

/**
 * A small Roll button, shown only when the dice roller is on. It rolls, adds the result to the
 * roll history and shows the total beside the button. It never changes the character: the player
 * enters hits, saves and damage by hand.
 */
export function RollButton({
  label,
  spec,
  text = 'Roll',
}: {
  label: string;
  spec: RollSpec;
  text?: string;
}) {
  const enabled = useStore(deviceStore, (state) => state.diceRoller);
  const [shown, setShown] = useState<string>();
  if (!enabled) return null;

  const roll = () => {
    if (spec.kind === 'd20') {
      const result = rollD20(spec.bonus, spec.mode ?? 'normal');
      const natural =
        result.natural === 'critical'
          ? 'Natural 20'
          : result.natural === 'fumble'
            ? 'Natural 1'
            : '';
      deviceStore.getState().addRoll({
        label,
        expression: result.expression,
        detail: describeRoll(result),
        total: result.total,
        ...(natural ? { note: natural } : {}),
      });
      setShown(natural ? `${result.total} (${natural.toLowerCase()})` : String(result.total));
      return;
    }
    const expression = spec.critical
      ? (criticalDice(spec.expression) ?? spec.expression)
      : spec.expression;
    const result = rollDice(expression);
    if (!result) return;
    deviceStore.getState().addRoll({
      label,
      expression: result.expression,
      detail: describeRoll(result),
      total: result.total,
      ...(spec.critical ? { note: 'Critical hit dice' } : {}),
    });
    setShown(String(result.total));
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={roll}
        aria-label={`Roll ${label}`}
        className="min-h-11 rounded-btn border border-border px-3 text-sm text-text"
      >
        {text}
      </button>
      <span role="status" aria-label={`${label} result`} className="min-w-6 text-sm font-semibold">
        {shown}
      </span>
    </span>
  );
}
