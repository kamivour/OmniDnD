import { registry } from '../../data/registry';
import { dedicatedWeaponOptions } from '../../engine/calc/monk-weapons';
import type { CharacterState, Sheet } from '../../engine/calc/sheet';

export function DedicatedWeaponSelect({
  state,
  sheet,
  value,
  onChange,
}: {
  state: CharacterState;
  sheet: Sheet;
  value: string;
  onChange: (id: string) => void;
}) {
  const options = dedicatedWeaponOptions(state.build, state.live, sheet, registry);
  if (!options.length) return null;
  const current = options.find(({ instanceId }) => instanceId === state.live.dedicatedWeaponId);
  return (
    <label className="grid gap-1 text-sm text-text">
      Dedicated Weapon
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 min-w-0 rounded-btn border border-border bg-surface px-2 text-text"
      >
        <option value="">{current ? `Keep ${current.name}` : 'Keep current weapons'}</option>
        {options
          .filter(({ instanceId }) => instanceId !== current?.instanceId)
          .map(({ instanceId, name }) => (
            <option key={instanceId} value={instanceId}>
              {name}
            </option>
          ))}
      </select>
    </label>
  );
}
