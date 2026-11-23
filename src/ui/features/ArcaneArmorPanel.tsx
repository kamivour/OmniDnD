import { useState } from 'react';
import { registryFor } from '../../data/registry';
import {
  ARMOR_MODELS,
  armorModelName,
  wornSuit,
  type ArmorModel,
} from '../../engine/calc/arcane-armor';
import { ARCANE_ARMOR, configureArcaneArmor } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { inputClass } from '../components/fields';
import { useCharacter } from '../hooks/useCharacter';

export function ArcaneArmorPanel() {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const [model, setModel] = useState<ArmorModel>('guardian');
  if (!sheet.features.some(({ def }) => def.id === ARCANE_ARMOR)) return null;
  const suit = wornSuit(state.build, state.live, registryFor(state.build));
  const armor = sheet.arcaneArmor;
  return (
    <section
      id="arcane-armor"
      aria-label="Arcane Armor"
      className="grid gap-2 rounded-btn border border-border p-3"
    >
      <h3 className="font-semibold">Arcane Armor</h3>
      {armor ? (
        <>
          <p>
            {armor.def.name} · {armorModelName[armor.model]}
          </p>
          <p className="text-text-muted">
            Your armor is a spellcasting focus. Change its model at the end of a short or long rest.
          </p>
          <p>
            {armor.model === 'guardian'
              ? 'Thunder Gauntlets and Defensive Field'
              : 'Lightning Launcher, +5 ft walking speed and Stealth advantage'}
          </p>
        </>
      ) : suit ? (
        <>
          <label className="grid gap-1">
            Armor model
            <select
              className={inputClass}
              value={model}
              onChange={(event) => setModel(event.target.value as ArmorModel)}
            >
              {ARMOR_MODELS.map((option) => (
                <option key={option} value={option}>
                  {armorModelName[option]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="min-h-11 rounded-btn border border-border px-3"
            onClick={() => run(configureArcaneArmor, { model })}
          >
            Configure {suit.def.name}
          </button>
        </>
      ) : (
        <p className="text-text-muted">Equip a suit of armor to configure it with smith’s tools.</p>
      )}
    </section>
  );
}
