import { ARMOR_MODELS, armorModelName, type ArmorModel } from '../../engine/calc/arcane-armor';
import type { Sheet } from '../../engine/calc/sheet';
import { inputClass } from '../components/fields';

export function ArcaneArmorRestSelect({
  armor,
  value,
  onChange,
}: {
  armor: Sheet['arcaneArmor'];
  value: ArmorModel | undefined;
  onChange: (value: ArmorModel | undefined) => void;
}) {
  if (!armor) return null;
  return (
    <label className="grid gap-1 text-sm">
      Arcane Armor model
      <select
        className={inputClass}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as ArmorModel | undefined)}
      >
        <option value="">Keep {armorModelName[armor.model]}</option>
        {ARMOR_MODELS.filter((model) => model !== armor.model).map((model) => (
          <option key={model} value={model}>
            {armorModelName[model]}
          </option>
        ))}
      </select>
    </label>
  );
}
