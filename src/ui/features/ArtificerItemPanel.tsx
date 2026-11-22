import { useState } from 'react';
import { registry } from '../../data/registry';
import {
  artificerItemOptions,
  arcaneFirearm,
  markArcaneFirearm,
  storeArtificerSpell,
  storedSpellDetails,
  storedSpellItem,
  useArtificerStoredSpell,
} from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { inputClass } from '../components/fields';
import { useCharacter } from '../hooks/useCharacter';

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';

export function ArtificerItemPanel() {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const [itemId, setItemId] = useState('');
  const [spellId, setSpellId] = useState('');
  const [firearmId, setFirearmId] = useState('');
  const [otherHolder, setOtherHolder] = useState(false);
  const [onSelf, setOnSelf] = useState(false);
  const [healRoll, setHealRoll] = useState('');
  const context = { ...state, sheet, registry };
  const options = artificerItemOptions(context);
  if (!options.store && !options.firearm) return null;
  const stored = storedSpellItem(context);
  const currentFirearm = arcaneFirearm(context);
  const details = stored?.spell ? storedSpellDetails(context, stored.spell) : undefined;
  const canTargetSelf =
    stored?.spell && (stored.spell.heal || stored.spell.effect?.target === 'any');
  const healing = onSelf && details?.healing;
  const healValue = healRoll.trim() ? Number(healRoll) : NaN;
  const validHealing =
    !healing ||
    (Number.isInteger(healValue) && healValue >= healing.minRoll && healValue <= healing.maxRoll);

  return (
    <>
      {options.store && (
        <section
          id="spell-storing-item"
          aria-label="Spell-Storing Item"
          className="grid min-w-0 gap-3 rounded-btn border border-border p-3"
        >
          <h3 className="font-semibold text-text">Spell-Storing Item</h3>
          {stored && (
            <div className="grid gap-2">
              <p>
                {stored.spell?.name ?? 'Stored spell'} ·{' '}
                {stored.item?.def.name ?? 'Item unavailable'} · {stored.left}/{stored.saved.limit}{' '}
                uses left
              </p>
              {stored.spell?.attack && details?.casting && (
                <p>Spell attack {details.casting.attack.value}</p>
              )}
              {stored.spell?.save && details?.casting && (
                <p>Save DC {details.casting.saveDc.value}</p>
              )}
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={otherHolder}
                  onChange={(event) => setOtherHolder(event.target.checked)}
                />
                Someone else is holding the item
              </label>
              {canTargetSelf && (
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={onSelf}
                    onChange={(event) => setOnSelf(event.target.checked)}
                  />
                  Apply to me
                </label>
              )}
              {healing && (
                <label className="grid gap-1">
                  Healing dice total ({healing.dice})
                  <input
                    className={inputClass}
                    type="number"
                    min={healing.minRoll}
                    max={healing.maxRoll}
                    value={healRoll}
                    onChange={(event) => setHealRoll(event.target.value)}
                  />
                </label>
              )}
              <button
                className={button}
                type="button"
                disabled={!stored.item || !stored.spell || !stored.left || !validHealing}
                onClick={() =>
                  run(useArtificerStoredSpell, {
                    otherHolder,
                    onSelf,
                    ...(healing ? { healRoll: healValue } : {}),
                  })
                }
              >
                Use stored spell
              </button>
            </div>
          )}
          <label className="grid gap-1">
            Item to store the spell in
            <select
              value={itemId}
              onChange={(event) => setItemId(event.target.value)}
              className={inputClass}
            >
              <option value="">Choose an item</option>
              {options.storedItems.map(({ instanceId, def }) => (
                <option key={instanceId} value={instanceId}>
                  {def.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            Spell to store
            <select
              value={spellId}
              onChange={(event) => setSpellId(event.target.value)}
              className={inputClass}
            >
              <option value="">Choose a spell</option>
              {options.spells.map(({ id, level, name }) => (
                <option key={id} value={id}>
                  L{level} · {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={button}
            disabled={!itemId || !spellId}
            onClick={() =>
              run(storeArtificerSpell, { instanceId: itemId, spellId }, undefined, () => {
                setItemId('');
                setSpellId('');
                setOtherHolder(false);
                setOnSelf(false);
                setHealRoll('');
              })
            }
          >
            Store spell
          </button>
        </section>
      )}
      {options.firearm && (
        <section
          id="arcane-firearm"
          aria-label="Arcane Firearm"
          className="grid min-w-0 gap-3 rounded-btn border border-border p-3"
        >
          <h3 className="font-semibold text-text">Arcane Firearm</h3>
          {currentFirearm && <p>Marked focus · {currentFirearm.def.name}</p>}
          <label className="grid gap-1">
            Wand, staff or rod
            <select
              value={firearmId}
              onChange={(event) => setFirearmId(event.target.value)}
              className={inputClass}
            >
              <option value="">Choose a focus</option>
              {options.firearmItems.map(({ instanceId, def }) => (
                <option key={instanceId} value={instanceId}>
                  {def.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={button}
            disabled={!firearmId || firearmId === currentFirearm?.instanceId}
            onClick={() =>
              run(markArcaneFirearm, { instanceId: firearmId }, undefined, () => setFirearmId(''))
            }
          >
            Mark Arcane Firearm
          </button>
        </section>
      )}
    </>
  );
}
