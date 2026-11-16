import { useState } from 'react';
import { smite, smiteDice, type SmiteRule } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { useCharacter } from '../hooks/useCharacter';

/** A slot that can pay for a smite: `pact` or a slot level as text. */
type SlotKey = string;

/** Divine Smite and Eldritch Smite: pick a slot after a hit, and the app spends it. */
export function SmitePanel() {
  const { sheet } = useCharacter();
  const smites = sheet.features.flatMap(({ def }) =>
    def.smite ? [{ id: def.id, name: def.name, rule: def.smite }] : [],
  );
  if (smites.length === 0) return null;
  return (
    <div id="smite" className="flex flex-col gap-2">
      {smites.map((entry) => (
        <SmiteRow key={entry.id} {...entry} />
      ))}
    </div>
  );
}

function SmiteRow({ id, name, rule }: { id: string; name: string; rule: SmiteRule }) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const live = state.live;
  const options: { key: SlotKey; level: number; label: string }[] = [];
  if (!rule.pactOnly)
    sheet.slots.max.forEach((max, level) => {
      const left = max - (live.slotsUsed[level] ?? 0);
      if (level > 0 && left > 0)
        options.push({ key: String(level), level, label: `Level ${level} slot (${left} left)` });
    });
  const pact = sheet.slots.pact;
  if (pact) {
    const left = pact.count - (live.pactSlotsUsed ?? 0);
    if (left > 0)
      options.push({
        key: 'pact',
        level: pact.level,
        label: `Pact slot, level ${pact.level} (${left} left)`,
      });
  }
  const [picked, setPicked] = useState<SlotKey>('');
  const [bonus, setBonus] = useState(false);
  const chosen = options.find((option) => option.key === picked) ?? options[0];
  const selectId = `smite-slot-${id}`;

  return (
    <section
      aria-label={name}
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
    >
      <p className="text-sm text-text">
        <span className="font-semibold">{name}</span>
        <span className="text-text-muted"> · after a hit, spend a slot for extra damage</span>
      </p>
      {options.length === 0 ? (
        <p className="text-xs text-text-muted">
          {rule.pactOnly ? 'No pact slots left.' : 'No spell slots left.'}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={selectId} className="sr-only">
            Slot for {name}
          </label>
          <select
            id={selectId}
            value={chosen?.key}
            onChange={(event) => setPicked(event.target.value)}
            className="min-h-11 w-full min-w-0 rounded-btn border border-border bg-surface-2 px-2 text-sm text-text sm:w-auto sm:flex-1"
          >
            {options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          {rule.bonusVs && (
            <label className="flex min-h-11 items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={bonus}
                onChange={() => setBonus(!bonus)}
                className="size-4 accent-(--omni-accent)"
              />
              Target is {rule.bonusVs}
            </label>
          )}
          <button
            type="button"
            onClick={() =>
              chosen &&
              run(
                smite,
                {
                  featureId: id,
                  ...(chosen.key === 'pact' ? { pact: true } : { slotLevel: chosen.level }),
                  ...(bonus ? { bonusTarget: true } : {}),
                },
                undefined,
                () => setBonus(false),
              )
            }
            className="hover-lift min-h-11 rounded-btn border border-accent px-3 text-sm font-semibold text-accent"
          >
            Smite: {chosen && smiteDice(rule, chosen.level, bonus)} {rule.type}
          </button>
        </div>
      )}
    </section>
  );
}
