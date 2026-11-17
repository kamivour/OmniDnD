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

const RANGER_BEASTS = [...registry.entries.values()]
  .filter(
    (entry) =>
      entry.kind === 'creature' &&
      entry.srd &&
      entry.creatureType === 'beast' &&
      ['tiny', 'small', 'medium'].includes(entry.size) &&
      entry.cr <= 0.25,
  )
  .map((entry) => entry.id.slice('creature.'.length))
  .sort();
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
    kind: kind === 'Sky' ? 'Small beast' : 'Medium beast',
    ac: { base: 13, ownerProficiency: 1 },
    maxHp: {
      base: kind === 'Sky' ? 4 : 5,
      ownerLevel: kind === 'Sky' ? 4 : 5,
      classId: 'class.ranger',
    },
    ...stats,
    uses: [],
    limit: { key: 'ranger-companion', max: 1 },
    sourceId: 'feature.tce.ranger-primal-companion',
    notes:
      'Command with a bonus action, or sacrifice an attack from your Attack action. Add your proficiency bonus to its ability checks and saves. Stats follow ranger level; Land charge adds 1d6 damage. Sea may choose bludgeoning damage.',
  },
});

const primalAttack = (name: string, dice: string, type: 'slashing' | 'piercing') => ({
  name,
  bonus: { ownerSpellAttack: true, classId: 'class.ranger' },
  damage: { dice, bonus: { base: 2, ownerProficiency: 1 }, type },
  range: '5 ft.',
});

const primalCompanions: CompanionTemplate[] = [
  primal('Land', {
    speed: { walk: 40, climb: 40 },
    abilities: { STR: 14, DEX: 14, CON: 15, INT: 8, WIS: 14, CHA: 11 },
    attacks: [primalAttack('Maul', '1d8', 'slashing')],
    traits: [
      'Charge: after moving 20 ft straight, a maul hit adds 1d6 slashing damage; a creature makes a Strength save against your spell DC or falls prone.',
    ],
  }),
  primal('Sea', {
    speed: { walk: 5, swim: 60 },
    abilities: { STR: 14, DEX: 14, CON: 15, INT: 8, WIS: 14, CHA: 11 },
    attacks: [primalAttack('Binding strike', '1d6', 'piercing')],
    traits: [
      'Amphibious.',
      'A hit grapples the target (escape DC is your spell save DC); while grappling, Binding Strike can only target that creature.',
    ],
  }),
  primal('Sky', {
    speed: { walk: 10, fly: 60 },
    abilities: { STR: 6, DEX: 16, CON: 13, INT: 8, WIS: 14, CHA: 11 },
    attacks: [
      {
        ...primalAttack('Shred', '1d4', 'slashing'),
        damage: { dice: '1d4', bonus: { base: 3, ownerProficiency: 1 }, type: 'slashing' },
      },
    ],
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
    ac: { base: 15, classLevelBonus: { classId: 'class.artificer', level: 15, bonus: 2 } },
    maxHp: { base: 2, ownerAbilityMod: 'INT', ownerLevel: 5, classId: 'class.artificer' },
    speed: { walk: 40 },
    abilities: { STR: 14, DEX: 12, CON: 14, INT: 4, WIS: 10, CHA: 6 },
    attacks: [
      {
        name: 'Force-empowered rend',
        bonus: { ownerSpellAttack: true, classId: 'class.artificer' },
        damage: { dice: '1d8', bonus: { ownerProficiency: 1 }, type: 'force' },
        range: '5 ft.',
      },
    ],
    traits: [
      'Vigilant: cannot be surprised.',
      'Deflect Attack: its reaction gives disadvantage to a visible attacker within 5 ft attacking another creature within 5 ft of the defender.',
      'Immune to poison damage, charm, exhaustion and poison. Mending heals 2d6 HP; record the roll manually.',
    ],
    uses: [{ id: 'repair', name: 'Repair', max: 3, recharge: 'long' }],
    limit: { key: 'steel-defender', max: 1 },
    sourceId: 'feature.artificer.battle-smith-steel-defender',
    notes:
      'Acts on your initiative; you command it with a bonus action. Repair: its own action heals itself or a construct/object within 5 ft for 2d8 + your proficiency bonus, 3 times per long rest. At artificer 15, Deflect Attack also deals 1d4 + your Intelligence modifier force damage to the attacker.',
  },
};

const eldritchCannon: CompanionTemplate = {
  label: 'Eldritch Cannon',
  group: 'Artificer',
  companion: {
    name: 'Eldritch Cannon',
    type: 'summon',
    kind: 'Small magical object',
    ac: 18,
    maxHp: { ownerLevel: 5, classId: 'class.artificer' },
    speed: { walk: 15, climb: 15 },
    abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    attacks: [],
    traits: [],
    uses: [],
    limit: { key: 'eldritch-cannon', max: 1 },
    durationSeconds: 3600,
    sourceId: 'feature.artificer.artillerist-eldritch-cannon',
    profile: { family: 'eldritch-cannon', form: 'Force Ballista', size: 'Small', legs: true },
    notes:
      'Choose its form when creating it. Record the creation action and free use or spell slot in Features or Spells; adding this record does not spend them again. Dismissal costs an action.',
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
      notes:
        'Cannot attack. Can deliver touch spells and share senses with you. Choose celestial, fey or fiend as its creature type, regardless of its animal shape.',
    },
  };
});

const chainFamiliars: CompanionTemplate[] = ['imp', 'pseudodragon', 'quasit', 'sprite'].map(
  (name) => {
    const companion = creatureCompanion(creature(name), {
      type: 'familiar',
      sourceId: 'feature.warlock.pact-of-the-chain',
      limit: { key: 'familiar', max: 1 },
    });
    return {
      label: `${companion.name} (Chain familiar)`,
      group: 'Pact of the Chain',
      companion: {
        ...companion,
        notes:
          'Requires the 2014 Pact of the Chain. During your Attack action you can give up one attack to let the familiar attack with its own reaction. See Reference for poison, saves, transformations and other actions; invocation benefits remain manual.',
      },
    };
  },
);

const steeds: CompanionTemplate[] = ['warhorse', 'pony', 'camel', 'elk', 'mastiff'].map((name) => {
  const companion = creatureCompanion(creature(name), {
    type: 'mount',
    sourceId: 'spell.find-steed',
    limit: { key: 'steed', max: 1 },
  });
  return {
    label: `${companion.name} (Find Steed)`,
    group: 'Find Steed',
    companion: {
      ...companion,
      kind: `${creature(name).size} spirit`,
      abilities: { ...companion.abilities, INT: Math.max(6, companion.abilities.INT) },
      notes:
        'Choose celestial, fey or fiend as its creature type and one language you speak. A spirit mount with a telepathic bond within 1 mile; mounted spell sharing and combat control remain manual.',
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
  ...chainFamiliars,
  ...steeds,
);
