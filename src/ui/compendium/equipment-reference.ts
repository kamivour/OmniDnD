import type { Registry } from '../../engine/registry';
import type { ItemDef } from '../../engine/schema';

type Weapon = NonNullable<ItemDef['weapon']>;
type Armor = NonNullable<ItemDef['armor']>;

interface EquipmentReference {
  /** The SRD header names either one base item or a set of eligible bases. */
  bases?: readonly string[];
  fit?: string;
  ammunition?: true;
  weapon?: Partial<Weapon>;
  weaponBonus?: number;
  armorBonus?: number;
  ignoreArmorPenalties?: true;
  attunement?: string;
  note?: string;
}

const axes = ['item.battleaxe', 'item.greataxe', 'item.handaxe'];
const slashingSwords = ['item.greatsword', 'item.longsword', 'item.scimitar'];
const swords = [...slashingSwords, 'item.rapier', 'item.shortsword'];
const bodyArmor = [
  'item.padded-armor',
  'item.leather-armor',
  'item.studded-leather-armor',
  'item.hide-armor',
  'item.chain-shirt',
  'item.scale-mail',
  'item.breastplate',
  'item.half-plate-armor',
  'item.ring-mail',
  'item.chain-mail',
  'item.splint-armor',
  'item.plate-armor',
];
const mediumOrHeavy = bodyArmor.slice(3);
const anySword = { bases: swords, fit: 'Any sword' };
const anyArmor = { bases: bodyArmor, fit: 'Light, medium or heavy armor' };
const shield = { bases: ['item.shield'] };
const dragonScale = { bases: ['item.scale-mail'], armorBonus: 1 };
const ammunition = { ammunition: true, fit: 'Any ammunition' } as const;
const anyWeapon = { fit: 'Any weapon' };
const devoutAmulet = { attunement: 'Cleric or Paladin' };

/** 2014 reference metadata only. Equipping these IDs continues to use the existing registry. */
export const equipmentReferences: Partial<Record<string, EquipmentReference>> = {
  'item.adamantine-armor': {
    bases: mediumOrHeavy.filter((id) => id !== 'item.hide-armor'),
    fit: 'Medium or heavy armor, except hide',
  },
  'item.ammunition-1': { ...ammunition, weaponBonus: 1 },
  'item.ammunition-2': { ...ammunition, weaponBonus: 2 },
  'item.ammunition-3': { ...ammunition, weaponBonus: 3 },
  'item.amulet-of-the-devout-1': devoutAmulet,
  'item.amulet-of-the-devout-2': devoutAmulet,
  'item.amulet-of-the-devout-3': devoutAmulet,
  'item.animated-shield': shield,
  'item.armor-1': { ...anyArmor, armorBonus: 1 },
  'item.armor-2': { ...anyArmor, armorBonus: 2 },
  'item.armor-3': { ...anyArmor, armorBonus: 3 },
  'item.armor-of-invulnerability': { bases: ['item.plate-armor'] },
  'item.armor-of-resistance': anyArmor,
  'item.armor-of-vulnerability': { bases: ['item.plate-armor'] },
  'item.arrow-catching-shield': { ...shield, note: '+2 additional AC against ranged attacks.' },
  'item.arrow-of-slaying': { ammunition: true, fit: 'Arrow' },
  'item.berserker-axe': { bases: axes, fit: 'Any axe', weaponBonus: 1 },
  'item.dagger-of-venom': { bases: ['item.dagger'], weaponBonus: 1 },
  'item.dancing-sword': anySword,
  'item.defender': {
    ...anySword,
    weaponBonus: 3,
    note: 'You can move some or all of this bonus to AC under the conditions in the item rules.',
  },
  'item.demon-armor': {
    bases: ['item.plate-armor'],
    armorBonus: 1,
    note: 'Clawed unarmed strikes use 1d8 slashing and gain +1 to attack and damage.',
  },
  'item.dragon-scale-mail-black': dragonScale,
  'item.dragon-scale-mail-blue': dragonScale,
  'item.dragon-scale-mail-brass': dragonScale,
  'item.dragon-scale-mail-bronze': dragonScale,
  'item.dragon-scale-mail-copper': dragonScale,
  'item.dragon-scale-mail-gold': dragonScale,
  'item.dragon-scale-mail-green': dragonScale,
  'item.dragon-scale-mail-red': dragonScale,
  'item.dragon-scale-mail-silver': dragonScale,
  'item.dragon-scale-mail-white': dragonScale,
  'item.dragon-slayer': anySword,
  'item.dwarven-plate': { bases: ['item.plate-armor'], armorBonus: 2 },
  'item.dwarven-thrower': {
    bases: ['item.warhammer'],
    weaponBonus: 3,
    attunement: 'Dwarf',
    weapon: { properties: ['thrown', 'versatile'], range: { normal: 20, long: 60 } },
    note: 'Thrown hits deal an extra 1d8 damage, or 2d8 against giants. It returns after the attack.',
  },
  'item.elven-chain': {
    bases: ['item.chain-shirt'],
    armorBonus: 1,
    note: 'You count as proficient with this armor.',
  },
  'item.flame-tongue': { ...anySword, note: 'While lit, hits deal an extra 2d6 fire damage.' },
  'item.frost-brand': { ...anySword, note: 'Hits deal an extra 1d6 cold damage.' },
  'item.giant-slayer': { bases: [...axes, ...swords], fit: 'Any axe or sword', weaponBonus: 1 },
  'item.glamoured-studded-leather-armor': { bases: ['item.studded-leather-armor'], armorBonus: 1 },
  'item.hammer-of-thunderbolts': {
    bases: ['item.maul'],
    weaponBonus: 1,
    note: 'Giant’s Bane requires attunement while wearing a belt of giant strength and gauntlets of ogre power. That property gives its charged throw a 20/60 ft range.',
  },
  'item.holy-avenger': { ...anySword, weaponBonus: 3, attunement: 'Paladin' },
  'item.javelin-of-lightning': {
    bases: ['item.javelin'],
    note: 'The lightning effect has its own range of up to 120 ft.',
  },
  'item.luck-blade': { ...anySword, weaponBonus: 1 },
  'item.mace-of-disruption': { bases: ['item.mace'] },
  'item.mace-of-smiting': {
    bases: ['item.mace'],
    weaponBonus: 1,
    note: 'The weapon bonus is +3 against constructs.',
  },
  'item.mace-of-terror': { bases: ['item.mace'] },
  'item.mithral-armor': {
    bases: mediumOrHeavy,
    fit: 'Medium or heavy armor',
    ignoreArmorPenalties: true,
    note: 'Mithral removes the usual Strength requirement and Stealth disadvantage.',
  },
  'item.nine-lives-stealer': { ...anySword, weaponBonus: 2 },
  'item.oathbow': { bases: ['item.longbow'] },
  'item.plate-armor-of-etherealness': { bases: ['item.plate-armor'] },
  'item.scimitar-of-speed': { bases: ['item.scimitar'], weaponBonus: 2 },
  'item.shield-of-missile-attraction': shield,
  'item.spellguard-shield': shield,
  'item.sun-blade': {
    bases: ['item.longsword'],
    weaponBonus: 2,
    weapon: { properties: ['finesse', 'versatile'], damageType: 'radiant' },
    note: 'These weapon stats apply with the blade active.',
  },
  'item.sword-of-life-stealing': anySword,
  'item.sword-of-sharpness': { bases: slashingSwords, fit: 'Any sword that deals slashing damage' },
  'item.sword-of-wounding': anySword,
  'item.trident-of-fish-command': { bases: ['item.trident'] },
  'item.vicious-weapon': anyWeapon,
  'item.vorpal-sword': {
    bases: slashingSwords,
    fit: 'Any sword that deals slashing damage',
    weaponBonus: 3,
  },
  'item.weapon-1': { ...anyWeapon, weaponBonus: 1 },
  'item.weapon-2': { ...anyWeapon, weaponBonus: 2 },
  'item.weapon-3': { ...anyWeapon, weaponBonus: 3 },
};

type ReferenceItem = ItemDef & ({ weapon: Weapon } | { armor: Armor });

export function equipmentBases(item: ItemDef, registry: Registry): ReferenceItem[] {
  const reference = equipmentReferences[item.id];
  const ids = reference?.bases ?? (item.baseItemId ? [item.baseItemId] : []);
  const bases = (
    reference?.fit === 'Any weapon'
      ? [...registry.entries.values()].filter((entry) => entry.kind === 'item' && entry.weapon)
      : ids.map((id) => registry.entries.get(id))
  ).filter(
    (entry): entry is ReferenceItem =>
      entry?.kind === 'item' && Boolean(entry.weapon || entry.armor),
  );
  return bases.sort((left, right) => left.name.localeCompare(right.name));
}

export function equipmentProfile(item: ItemDef, registry: Registry, variantId?: string) {
  const reference = equipmentReferences[item.id];
  const bases = equipmentBases(item, registry);
  const base = bases.length === 1 ? bases[0] : bases.find(({ id }) => id === variantId);
  const weapon = item.weapon ?? base?.weapon;
  const armor = item.armor ?? base?.armor;
  return {
    reference,
    bases,
    base,
    weapon: weapon && reference?.weapon ? { ...weapon, ...reference.weapon } : weapon,
    armor: armor && {
      ...armor,
      baseAc: armor.baseAc + (reference?.armorBonus ?? 0),
      ...(reference?.ignoreArmorPenalties && { strMin: undefined, stealthDisadvantage: false }),
    },
  };
}
