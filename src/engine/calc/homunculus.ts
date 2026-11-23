import type { Companion } from '../schema';
import { HOMUNCULUS_INFUSION } from './infusions';

const ARTIFICER = 'class.artificer';

export function homunculusServant(id: string): Companion {
  return {
    id,
    name: 'Homunculus Servant',
    type: 'summon',
    kind: 'Tiny construct',
    ac: 13,
    maxHp: { base: 1, ownerLevel: 1, ownerAbilityMod: 'INT', classId: ARTIFICER },
    speed: { walk: 20, fly: 30 },
    abilities: { STR: 4, DEX: 15, CON: 12, INT: 10, WIS: 10, CHA: 7 },
    attacks: [
      {
        name: 'Force Strike',
        bonus: { ownerSpellAttack: true, classId: ARTIFICER },
        damage: { dice: '1d4', bonus: { ownerProficiency: 1 }, type: 'force' },
        range: '30 ft.',
      },
    ],
    traits: [
      'Darkvision 60 ft. Immune to poison damage, exhaustion and the poisoned condition.',
      'Evasion applies to Dexterity saves for half damage. Mending heals 2d6 HP.',
      'Acts after you and usually dodges unless commanded. It can act freely if you are incapacitated.',
      'Channel Magic uses its reaction to deliver your touch spell while within 120 ft of you.',
    ],
    uses: [],
    limit: { key: 'homunculus-servant', max: 1 },
    sourceId: HOMUNCULUS_INFUSION,
  };
}
