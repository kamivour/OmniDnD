import { creatureCompanion } from '../../engine/calc/companion-templates';
import { registry } from '../../data/registry';
import type { Companion } from '../../engine/schema';
import { SUMMON_SPELL_TEMPLATES } from './summon-templates';

/** Starting points for the add form. Own-words notes; the player can change every field. */
export interface CompanionTemplate {
  label: string;
  /** Heading in the picker. */
  group: string;
  companion: Omit<Companion, 'id'>;
}

export const COMPANION_TEMPLATES: CompanionTemplate[] = [
  {
    label: 'Mastiff',
    group: 'Common',
    companion: {
      name: 'Mastiff',
      type: 'pet',
      kind: 'Medium beast',
      ac: 12,
      maxHp: 5,
      speed: { walk: 40 },
      abilities: { STR: 13, DEX: 14, CON: 12, INT: 3, WIS: 12, CHA: 7 },
      attacks: [
        {
          name: 'Bite',
          bonus: 3,
          damage: { dice: '1d6', bonus: 1, type: 'piercing' },
          range: '5 ft.',
          note: 'Target may be knocked prone (Strength save, DM rules it).',
        },
      ],
      traits: ['Keen hearing and smell.'],
      uses: [],
    },
  },
  {
    label: 'Riding horse',
    group: 'Common',
    companion: {
      name: 'Riding horse',
      type: 'mount',
      kind: 'Large beast',
      ac: 10,
      maxHp: 13,
      speed: { walk: 60 },
      abilities: { STR: 16, DEX: 10, CON: 12, INT: 2, WIS: 11, CHA: 7 },
      attacks: [
        {
          name: 'Hooves',
          bonus: 5,
          damage: { dice: '2d4', bonus: 3, type: 'bludgeoning' },
          range: '5 ft.',
        },
      ],
      traits: ['Carries a rider.'],
      uses: [],
    },
  },
];

const creature = (name: string) => registry.get('creature', `creature.${name}`);

const RANGER_BEASTS = ['wolf', 'panther', 'boar', 'giant-badger'];
const FAMILIARS = [
  'bat',
  'cat',
  'crab',
  'frog',
  'hawk',
  'lizard',
  'octopus',
  'owl',
  'poisonous-snake',
  'quipper',
  'rat',
  'raven',
  'sea-horse',
  'spider',
  'weasel',
];

const rangerCompanions: CompanionTemplate[] = RANGER_BEASTS.map((name) => {
  const companion = creatureCompanion(creature(name), {
    type: 'pet',
    ownerProficiency: true,
    hpFloor: { perLevel: 4, classId: 'class.ranger' },
    limit: { key: 'ranger-companion', max: 1 },
  });
  return {
    label: `${companion.name} (Ranger's companion)`,
    group: "Ranger's companion",
    companion: {
      ...companion,
      notes:
        "Follows the ranger's proficiency bonus for AC, attacks and damage. Max HP is its normal HP or 4 times ranger level, whichever is higher.",
    },
  };
});

const primal = (
  kind: 'Land' | 'Sea' | 'Sky',
  stats: Pick<Companion, 'speed' | 'abilities' | 'attacks' | 'traits'>,
): CompanionTemplate => ({
  label: `Beast of the ${kind}`,
  group: 'Primal companion',
  companion: {
    name: `Beast of the ${kind}`,
    type: 'pet',
    kind: 'Medium beast',
    ac: { base: 13, ownerProficiency: 1 },
    maxHp: { base: 5, ownerLevel: 5, classId: 'class.ranger' },
    ...stats,
    uses: [],
    limit: { key: 'ranger-companion', max: 1 },
    sourceId: 'feature.tce.ranger-primal-companion',
    notes:
      'Acts on your initiative. AC, attacks and damage follow your proficiency bonus; max HP is 5 plus 5 per ranger level.',
  },
});

const primalAttack = (name: string, dice: string, type: 'slashing' | 'piercing') => ({
  name,
  bonus: { ownerAbilityMod: 'WIS' as const, ownerProficiency: 1 },
  damage: { dice, bonus: { base: 2, ownerProficiency: 1 }, type },
  range: '5 ft.',
});

const primalCompanions: CompanionTemplate[] = [
  primal('Land', {
    speed: { walk: 40, climb: 40 },
    abilities: { STR: 14, DEX: 14, CON: 15, INT: 8, WIS: 14, CHA: 11 },
    attacks: [primalAttack('Maul', '1d8', 'slashing')],
    traits: [
      'Charge: after moving 20 ft straight at a target, its maul hit knocks the target prone on a failed Strength save.',
    ],
  }),
  primal('Sea', {
    speed: { walk: 5, swim: 60 },
    abilities: { STR: 14, DEX: 14, CON: 15, INT: 5, WIS: 12, CHA: 8 },
    attacks: [primalAttack('Binding strike', '1d6', 'piercing')],
    traits: [
      'Amphibious.',
      'A hit grapples the target (escape DC is your spell save DC); one grapple at a time.',
    ],
  }),
  primal('Sky', {
    speed: { walk: 10, fly: 60 },
    abilities: { STR: 6, DEX: 16, CON: 13, INT: 8, WIS: 14, CHA: 11 },
    attacks: [primalAttack('Rend', '1d4', 'slashing')],
    traits: ['Flyby: does not provoke opportunity attacks when it flies out of reach.'],
  }),
];

const steelDefender: CompanionTemplate = {
  label: 'Steel Defender',
  group: 'Artificer',
  companion: {
    name: 'Steel Defender',
    type: 'summon',
    kind: 'Medium construct',
    ac: 15,
    maxHp: { base: 2, ownerAbilityMod: 'INT', ownerLevel: 5, classId: 'class.artificer' },
    speed: { walk: 40 },
    abilities: { STR: 14, DEX: 12, CON: 14, INT: 4, WIS: 10, CHA: 6 },
    attacks: [
      {
        name: 'Force-empowered rend',
        bonus: { ownerAbilityMod: 'INT', ownerProficiency: 1 },
        damage: { dice: '1d8', bonus: { ownerProficiency: 1 }, type: 'force' },
        range: '5 ft.',
      },
    ],
    traits: [
      'Vigilant: cannot be surprised.',
      'Deflect attack (reaction): imposes disadvantage on an attack against a nearby creature.',
      'Immune to poison and charm, exhaustion and similar effects.',
    ],
    uses: [{ id: 'repair', name: 'Repair', max: 3, recharge: 'long' }],
    limit: { key: 'steel-defender', max: 1 },
    sourceId: 'feature.artificer.battle-smith-steel-defender',
    notes:
      'Acts on your initiative; you command it with a bonus action. Repair: a magical mending that heals it, 3 times per long rest.',
  },
};

const eldritchCannon: CompanionTemplate = {
  label: 'Eldritch Cannon',
  group: 'Artificer',
  companion: {
    name: 'Eldritch Cannon',
    type: 'summon',
    kind: 'Small construct',
    ac: 18,
    maxHp: { ownerLevel: 5, classId: 'class.artificer' },
    speed: { walk: 15 },
    abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    attacks: [
      {
        name: 'Force ballista',
        bonus: { ownerAbilityMod: 'INT', ownerProficiency: 1 },
        damage: { dice: '2d8', type: 'force' },
        range: '120 ft.',
        note: 'Pushes the target 5 feet away on a hit.',
      },
    ],
    traits: [
      'Flamethrower: a 15-foot cone, targets make a Dexterity save against your spell save DC. 2d8 fire, half on a save.',
      'Protector: gives nearby allies temporary HP of 1d8 plus your Intelligence modifier.',
      'Immune to poison and psychic damage.',
    ],
    uses: [],
    limit: { key: 'eldritch-cannon', max: 1 },
    durationSeconds: 3600,
    sourceId: 'feature.artificer.artillerist-eldritch-cannon',
    notes:
      'Lasts 1 hour. You can have one at a time; a second at artificer level 15 is tracked by hand. It acts when you use a bonus action to command it.',
  },
};

const familiars: CompanionTemplate[] = FAMILIARS.map((name) => {
  const companion = creatureCompanion(creature(name), {
    type: 'familiar',
    noAttacks: true,
    sourceId: 'spell.find-familiar',
    limit: { key: 'familiar', max: 1 },
  });
  return {
    label: `${companion.name} (familiar)`,
    group: 'Familiar forms',
    companion: {
      ...companion,
      notes: 'Cannot attack. Can deliver touch spells and share senses with you.',
    },
  };
});

COMPANION_TEMPLATES.push(
  ...rangerCompanions,
  ...primalCompanions,
  ...SUMMON_SPELL_TEMPLATES.map((entry) => entry.template),
  steelDefender,
  eldritchCannon,
  ...familiars,
);
