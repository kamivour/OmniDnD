import type { Registry } from '../registry';
import type { CharacterBuild, ItemDef, LiveState } from '../schema';

export const DEFENSIVE_FIELD = 'feature.artificer.armorer-defensive-field';
export const ARMOR_MODELS = ['guardian', 'infiltrator'] as const;
export type ArmorModel = (typeof ARMOR_MODELS)[number];
export const armorModelName: Record<ArmorModel, string> = {
  guardian: 'Guardian',
  infiltrator: 'Infiltrator',
};

export function wornSuit(build: CharacterBuild, live: LiveState, registry: Registry) {
  for (const { instanceId, itemId } of build.items) {
    const item = live.items[instanceId];
    if (!item?.equipped || item.qty <= 0) continue;
    const def = registry.get('item', itemId);
    if (def.armor && def.armor.category !== 'shield') return { instanceId, def };
  }
  return undefined;
}

export function arcaneArmor(build: CharacterBuild, live: LiveState, registry: Registry) {
  const armor = live.arcaneArmor;
  if (
    !armor ||
    !build.classes.some(
      ({ classId, subclassId, level }) =>
        classId === 'class.artificer' && subclassId === 'subclass.artificer.armorer' && level >= 3,
    )
  )
    return undefined;
  const suit = wornSuit(build, live, registry);
  return suit && suit.instanceId === armor.instanceId ? { ...suit, model: armor.model } : undefined;
}

export function armorWeapon(armor: NonNullable<ReturnType<typeof arcaneArmor>>) {
  const guardian = armor.model === 'guardian';
  const weapon: ItemDef['weapon'] = {
    category: 'simple',
    type: guardian ? 'melee' : 'ranged',
    damage: guardian ? '1d8' : '1d6',
    damageType: guardian ? 'thunder' : 'lightning',
    properties: [],
    ...(guardian ? {} : { range: { normal: 90, long: 300 } }),
  };
  return {
    instanceId: `arcane-armor:${armor.instanceId}`,
    def: { ...armor.def, name: guardian ? 'Thunder Gauntlets' : 'Lightning Launcher', weapon },
  };
}
