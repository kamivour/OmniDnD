import type { Ability } from '../../engine/calc/abilities';
import { focusNextOnEnter } from './focus-next';
import { STANDARD_ARRAY, type AbilityMethod } from '../../engine/calc/ability-methods';

interface AbilityBaseInputProps {
  ability: Ability;
  method: AbilityMethod;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  describedBy?: string;
  invalid?: boolean;
}

/** The campaign chooses entry or assignment; derived scores never become inputs. */
export function AbilityBaseInput({
  ability,
  method,
  value,
  onChange,
  id,
  className = 'min-h-11 w-16 rounded-btn border border-border bg-surface px-2 text-text',
  describedBy,
  invalid,
}: AbilityBaseInputProps) {
  const common = {
    id,
    'aria-label': `${ability} base`,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
    value,
    required: true,
    className,
  };
  if (method === 'standard-array') {
    const retained = value !== '' && !STANDARD_ARRAY.some((score) => String(score) === value);
    return (
      <select
        {...common}
        onKeyDown={focusNextOnEnter}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">—</option>
        {retained && <option value={value}>{value} (retained)</option>}
        {STANDARD_ARRAY.map((score) => (
          <option key={score} value={score}>
            {score}
          </option>
        ))}
      </select>
    );
  }
  const [min, max] = method === 'point-buy' ? [8, 15] : [3, 18];
  return (
    <input
      {...common}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      onKeyDown={focusNextOnEnter}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
