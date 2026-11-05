import type { Registry } from '../registry';
import type { ItemDef } from '../schema';
import { computeSheet, type CharacterState, type Sheet } from './sheet';

type EquipmentState = Pick<CharacterState, 'build' | 'live'>;
type ArmorItem = ItemDef & { armor: NonNullable<ItemDef['armor']> };

export interface WornArmor {
  instanceId: string;
  def: ArmorItem;
  proficient: boolean;
}

function equippedArmor(
  state: EquipmentState,
  registry: Registry,
  includeEmpty: boolean,
): WornArmor[] {
  return state.build.items.flatMap(({ instanceId, itemId }) => {
    const live = Object.hasOwn(state.live.items, instanceId)
      ? state.live.items[instanceId]
      : undefined;
    if (!live?.equipped || (!includeEmpty && live.qty === 0)) return [];
    const def = registry.get('item', itemId);
    if (!def.armor) return [];
    return [
      {
        instanceId,
        def: def as ArmorItem,
        proficient: state.build.proficiencies.armor.includes(def.armor.category),
      },
    ];
  });
}

/** Only armor actually present contributes penalties; legacy empty equipped rows stay recorded. */
export function wornArmor(state: EquipmentState, registry: Registry): WornArmor[] {
  return equippedArmor(state, registry, false);
}

/** An explicit outfit change clears competing flags, including empty legacy copies. */
export function armorReplacements(
  state: EquipmentState,
  registry: Registry,
  instanceId: string,
): WornArmor[] {
  const item = state.build.items.find((entry) => entry.instanceId === instanceId);
  if (!item) return [];
  const def = registry.get('item', item.itemId);
  if (!def.armor) return [];
  const shield = def.armor.category === 'shield';
  return equippedArmor(state, registry, true).filter(
    (entry) =>
      entry.instanceId !== instanceId && (entry.def.armor.category === 'shield') === shield,
  );
}

/** 2014 armor penalties remain reminders; the player enters rolls and DM outcomes. */
export function armorEquipmentNotes(
  state: CharacterState,
  registry: Registry,
  sheet: Sheet = computeSheet(state, registry),
): string[] {
  const armor = wornArmor(state, registry);
  const unproficient = armor.filter((entry) => !entry.proficient);
  const notes =
    unproficient.length > 0
      ? [
          `No proficiency with ${unproficient.map(({ def }) => def.name).join(', ')}: STR/DEX checks, saves and attacks have disadvantage; you cannot cast spells.`,
        ]
      : [];
  notes.push(
    ...armor
      .filter(({ def }) => def.armor.stealthDisadvantage)
      .map(({ def }) => `${def.name}: disadvantage on Stealth checks.`),
  );
  for (const { def } of armor) {
    const required = def.armor.strMin;
    const strength = sheet.abilities.STR.score.value;
    if (required !== undefined && strength < required)
      notes.push(
        `${def.name}: STR ${required} requirement; current STR ${strength}. Review the armor speed restriction.`,
      );
  }
  if (armor.filter(({ def }) => def.armor.category !== 'shield').length > 1)
    notes.push(
      'Multiple suits of armor are recorded as equipped. AC uses the first; choose one outfit.',
    );
  if (armor.filter(({ def }) => def.armor.category === 'shield').length > 1)
    notes.push(
      'Multiple shields are recorded as equipped. Only the first shield contributes to AC.',
    );
  return notes;
}
