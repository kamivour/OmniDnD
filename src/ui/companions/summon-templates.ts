import type { Companion } from '../../engine/schema';
import type { CompanionTemplate } from './templates';

type Damage = NonNullable<Companion['attacks'][number]['damage']>['type'];

interface SummonSpec {
  slug: string;
  name: string;
  /** Base slot level; the numbers below are for a spell cast at this level. */
  level: number;
  ac: number;
  hp: number;
  speed: Companion['speed'];
  abilities: [number, number, number, number, number, number];
  attack: { name: string; dice: string; flat: number; type: Damage };
  traits: string[];
}

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;

/** Tasha's Summon spells at their base slot level, in our own words. */
const SPECS: SummonSpec[] = [
  {
    slug: 'beast',
    name: 'Bestial Spirit',
    level: 2,
    ac: 13,
    hp: 20,
    speed: { walk: 30, climb: 30 },
    abilities: [18, 11, 16, 4, 14, 5],
    attack: { name: 'Maul', dice: '1d8', flat: 4, type: 'piercing' },
    traits: [
      'Pick a land, air or water form when you cast: air flies 60 ft, water swims 30 ft.',
      'Land form has an edge when an ally of yours is next to its target.',
    ],
  },
  {
    slug: 'fey',
    name: 'Fey Spirit',
    level: 3,
    ac: 15,
    hp: 30,
    speed: { walk: 40 },
    abilities: [13, 16, 14, 14, 11, 16],
    attack: { name: 'Shortsword', dice: '1d6', flat: 6, type: 'piercing' },
    traits: [
      'Each hit adds 1d6 force damage.',
      'Can teleport a short way as a bonus action; the mood you pick adds a side effect.',
    ],
  },
  {
    slug: 'shadowspawn',
    name: 'Shadow Spirit',
    level: 3,
    ac: 14,
    hp: 35,
    speed: { walk: 40 },
    abilities: [13, 16, 15, 4, 10, 6],
    attack: { name: 'Chilling rend', dice: '1d12', flat: 6, type: 'cold' },
    traits: [
      'Resistant to necrotic damage.',
      'Fury, despair or fear: the mood you pick adds a side effect.',
    ],
  },
  {
    slug: 'undead',
    name: 'Undead Spirit',
    level: 3,
    ac: 14,
    hp: 30,
    speed: { walk: 30 },
    abilities: [12, 16, 15, 4, 10, 9],
    attack: { name: 'Deathly touch', dice: '1d8', flat: 6, type: 'necrotic' },
    traits: [
      'Ghostly, putrid or skeletal form: ghostly flies, putrid weakens foes, skeletal shoots.',
      'Resistant to necrotic damage and immune to poison.',
    ],
  },
  {
    slug: 'aberration',
    name: 'Aberrant Spirit',
    level: 4,
    ac: 15,
    hp: 40,
    speed: { walk: 30 },
    abilities: [16, 10, 15, 16, 10, 6],
    attack: { name: 'Psychic slam', dice: '1d8', flat: 7, type: 'psychic' },
    traits: [
      'Form sets extras: beholderkin floats and fires eye rays, slaad regenerates, star spawn pulses psychic damage.',
    ],
  },
  {
    slug: 'construct',
    name: 'Construct Spirit',
    level: 4,
    ac: 17,
    hp: 40,
    speed: { walk: 30 },
    abilities: [18, 10, 18, 14, 11, 5],
    attack: { name: 'Slam', dice: '1d8', flat: 8, type: 'bludgeoning' },
    traits: [
      'Resistant to poison damage; immune to charm, exhaustion and paralysis.',
      'Its material (clay, metal or stone) adds a reaction.',
    ],
  },
  {
    slug: 'elemental',
    name: 'Elemental Spirit',
    level: 4,
    ac: 15,
    hp: 50,
    speed: { walk: 40 },
    abilities: [18, 15, 17, 4, 10, 16],
    attack: { name: 'Slam', dice: '1d10', flat: 8, type: 'bludgeoning' },
    traits: [
      'Air flies 40 ft, earth burrows, fire burns, water swims.',
      'Immune to poison and resistant to the damage of its element.',
    ],
  },
  {
    slug: 'celestial',
    name: 'Celestial Spirit',
    level: 5,
    ac: 16,
    hp: 40,
    speed: { walk: 30, fly: 40 },
    abilities: [16, 14, 16, 10, 14, 16],
    attack: { name: 'Radiant mace', dice: '1d10', flat: 8, type: 'radiant' },
    traits: [
      'Avenger form shoots a radiant bow; Defender form is better armoured and can heal.',
      'Resistant to radiant damage.',
    ],
  },
  {
    slug: 'draconic-spirit',
    name: 'Draconic Spirit',
    level: 5,
    ac: 19,
    hp: 50,
    speed: { walk: 30, fly: 60, swim: 30 },
    abilities: [19, 14, 17, 10, 14, 14],
    attack: { name: 'Rend', dice: '1d6', flat: 9, type: 'piercing' },
    traits: [
      'Breath weapon in a 30-ft cone; DEX save against your spell save DC. Its damage type follows the dragon you pick.',
      'Resistant to that damage type.',
    ],
  },
  {
    slug: 'fiend',
    name: 'Fiendish Spirit',
    level: 6,
    ac: 18,
    hp: 50,
    speed: { walk: 40 },
    abilities: [13, 16, 15, 10, 10, 16],
    attack: { name: 'Bite', dice: '1d12', flat: 9, type: 'necrotic' },
    traits: [
      'Demon, devil or yugoloth form changes its extras and resistances.',
      'Resistant to fire and immune to poison.',
    ],
  },
];

export const SUMMON_SPELL_TEMPLATES: { spellId: string; template: CompanionTemplate }[] = SPECS.map(
  (spec) => {
    const spellId = `spell.summon-${spec.slug}`;
    const abilities = Object.fromEntries(
      ABILITIES.map((key, index) => [key, spec.abilities[index]]),
    ) as Companion['abilities'];
    return {
      spellId,
      template: {
        label: spec.name,
        group: 'Summon spells',
        companion: {
          name: spec.name,
          type: 'summon',
          kind: 'Medium spirit',
          ac: spec.ac,
          maxHp: spec.hp,
          speed: spec.speed,
          abilities,
          attacks: [
            {
              name: spec.attack.name,
              bonus: { ownerSpellAttack: true },
              damage: { dice: spec.attack.dice, bonus: spec.attack.flat, type: spec.attack.type },
              range: '5 ft.',
            },
          ],
          traits: spec.traits,
          uses: [],
          limit: { key: spellId, max: 1 },
          durationSeconds: 3600,
          sourceId: spellId as Companion['sourceId'],
          notes: `Numbers are for the spell cast at level ${spec.level}. Attack bonus follows your spell attack. Raise HP, AC and damage by hand when you cast at a higher level. It needs your concentration and acts on your initiative.`,
        },
      },
    };
  },
);
