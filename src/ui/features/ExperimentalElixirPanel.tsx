import { useState } from 'react';
import {
  ELIXIR_DETAILS,
  ELIXIR_RESULTS,
  elixirRestLimit,
  type ElixirResult,
} from '../../engine/calc/elixirs';
import {
  brewExperimentalElixir,
  elixirSlots,
  hasRestorativeReagents,
  useExperimentalElixir,
} from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { inputClass } from '../components/fields';
import { useCharacter } from '../hooks/useCharacter';

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';

export function ExperimentalElixirPanel() {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const [result, setResult] = useState<ElixirResult>('healing');
  const [slot, setSlot] = useState('');
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<'self' | 'administer' | 'other'>('self');
  const [healRoll, setHealRoll] = useState('');
  const [tempHpRoll, setTempHpRoll] = useState('');
  if (!elixirRestLimit(sheet.features)) return null;
  const slots = elixirSlots({ ...state, sheet });
  const remaining = state.live.experimentalElixirs ?? [];
  const picked = remaining.find(({ id }) => id === selected);
  const needHealing = mode === 'self' && picked?.result === 'healing';
  const needTempHp = mode === 'self' && hasRestorativeReagents({ sheet });
  const valid = (raw: string, max: number) =>
    /^\d+$/.test(raw) && Number(raw) >= 2 && Number(raw) <= max;
  return (
    <section
      id="experimental-elixirs"
      aria-label="Experimental Elixirs"
      className="grid min-w-0 gap-3 rounded-btn border border-border p-3"
    >
      <h3 className="font-semibold text-text">Experimental Elixirs</h3>
      {remaining.length ? (
        <label className="grid gap-1">
          Available elixirs ({remaining.length})
          <select
            value={selected}
            className={inputClass}
            onChange={(event) => {
              setSelected(event.target.value);
              setHealRoll('');
              setTempHpRoll('');
            }}
          >
            <option value="">Choose an elixir</option>
            {remaining.map((elixir, index) => (
              <option key={elixir.id} value={elixir.id}>
                {index + 1}. {ELIXIR_DETAILS[elixir.result].name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-text-muted">
          No elixirs. Make them at your next long rest or spend a spell slot.
        </p>
      )}
      {picked && (
        <>
          <p>{ELIXIR_DETAILS[picked.result].note}</p>
          <label className="grid gap-1">
            Who uses the elixir
            <select
              className={inputClass}
              value={mode}
              onChange={(event) => setMode(event.target.value as typeof mode)}
            >
              <option value="self">I drink it (action)</option>
              <option value="administer">I give it to an incapacitated creature (action)</option>
              <option value="other">Another creature drinks it</option>
            </select>
          </label>
          {needHealing && (
            <label className="grid gap-1">
              Healing 2d4 total
              <input
                className={inputClass}
                type="number"
                min={2}
                max={8}
                value={healRoll}
                onChange={(event) => setHealRoll(event.target.value)}
              />
            </label>
          )}
          {needTempHp && (
            <label className="grid gap-1">
              Temporary HP 2d6 total
              <input
                className={inputClass}
                type="number"
                min={2}
                max={12}
                value={tempHpRoll}
                onChange={(event) => setTempHpRoll(event.target.value)}
              />
            </label>
          )}
          <button
            className={button}
            type="button"
            disabled={
              (needHealing && !valid(healRoll, 8)) || (needTempHp && !valid(tempHpRoll, 12))
            }
            onClick={() =>
              run(
                useExperimentalElixir,
                {
                  id: picked.id,
                  mode,
                  ...(needHealing ? { healRoll: Number(healRoll) } : {}),
                  ...(needTempHp ? { tempHpRoll: Number(tempHpRoll) } : {}),
                },
                undefined,
                () => setSelected(''),
              )
            }
          >
            Use elixir
          </button>
        </>
      )}
      <label className="grid gap-1">
        Elixir to brew
        <select
          className={inputClass}
          value={result}
          onChange={(event) => setResult(event.target.value as ElixirResult)}
        >
          {ELIXIR_RESULTS.map((id) => (
            <option key={id} value={id}>
              {ELIXIR_DETAILS[id].name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        Spell slot to spend
        <select
          className={inputClass}
          value={slot}
          onChange={(event) => setSlot(event.target.value)}
        >
          <option value="">Choose a slot</option>
          {slots.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={button}
        disabled={!slots.some(({ id }) => id === slot)}
        onClick={() =>
          run(
            brewExperimentalElixir,
            { result, slot: slot === 'pact' ? 'pact' : Number(slot) },
            undefined,
            () => setSlot(''),
          )
        }
      >
        Brew elixir
      </button>
    </section>
  );
}
