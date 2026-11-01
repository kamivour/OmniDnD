import type { Ability } from './calc/abilities';

/** D&D 5e 2014 constants. Lists only: the math lives in `calc/`. */

export const SKILLS = [
  'acrobatics',
  'animal-handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight-of-hand',
  'stealth',
  'survival',
] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_ABILITY: Record<Skill, Ability> = {
  acrobatics: 'DEX',
  'animal-handling': 'WIS',
  arcana: 'INT',
  athletics: 'STR',
  deception: 'CHA',
  history: 'INT',
  insight: 'WIS',
  intimidation: 'CHA',
  investigation: 'INT',
  medicine: 'WIS',
  nature: 'INT',
  perception: 'WIS',
  performance: 'CHA',
  persuasion: 'CHA',
  religion: 'INT',
  'sleight-of-hand': 'DEX',
  stealth: 'DEX',
  survival: 'WIS',
};

/** The 14 PHB 2014 conditions. Exhaustion is a separate 0–6 level, not a condition here. */
export const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const MAX_EXHAUSTION = 6;

/** Conditions that include incapacitated: no actions or reactions, and concentration ends. */
export const INCAPACITATING_CONDITIONS: readonly Condition[] = [
  'incapacitated',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
];

/** Three death save successes make you stable; three failures and you die. */
export const DEATH_SAVES_NEEDED = 3;

export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export const SCHOOLS = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
] as const;
export type School = (typeof SCHOOLS)[number];

/** 2014 weapon properties. There is no weapon mastery in 2014. */
export const WEAPON_PROPERTIES = [
  'ammunition',
  'finesse',
  'heavy',
  'light',
  'loading',
  'reach',
  'special',
  'thrown',
  'two-handed',
  'versatile',
] as const;
export type WeaponProperty = (typeof WEAPON_PROPERTIES)[number];

/** Game clock unit is the second (D46). One combat round is 6 seconds. */
export const SECONDS_PER_ROUND = 6;
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
/** Features that recharge "at dawn" recover when the clock passes 06:00. */
export const DAWN_SECONDS = 6 * SECONDS_PER_HOUR;
export const SHORT_REST_SECONDS = SECONDS_PER_HOUR;
export const LONG_REST_SECONDS = 8 * SECONDS_PER_HOUR;
/** One long rest per 24 hours (PHB 2014). */
export const LONG_REST_INTERVAL_SECONDS = SECONDS_PER_DAY;

/** Conditions that set speed to 0 (grappled, restrained) or stop all movement. */
export const SPEED_ZERO_CONDITIONS: readonly Condition[] = [
  'grappled',
  'paralyzed',
  'petrified',
  'restrained',
  'stunned',
  'unconscious',
];

/** Carrying capacity in lb per point of STR (Medium or Small). */
export const CARRY_PER_STR = 15;

/** Speed penalty for heavy armor without its STR minimum. */
export const HEAVY_ARMOR_SPEED_PENALTY = 10;

/**
 * Full caster slots by caster level (row = level − 1, column = slot level − 1). Half and third
 * casters and multiclass casters read this table at their caster level (PHB 2014 ch. 6).
 */
export const SPELL_SLOTS: readonly (readonly number[])[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Warlock Pact Magic by warlock level (row = level − 1): slot count and slot level. */
export const PACT_SLOTS: readonly { count: number; level: number }[] = [
  { count: 1, level: 1 },
  { count: 2, level: 1 },
  { count: 2, level: 2 },
  { count: 2, level: 2 },
  { count: 2, level: 3 },
  { count: 2, level: 3 },
  { count: 2, level: 4 },
  { count: 2, level: 4 },
  { count: 2, level: 5 },
  { count: 2, level: 5 },
  ...Array.from({ length: 6 }, () => ({ count: 3, level: 5 })),
  ...Array.from({ length: 4 }, () => ({ count: 4, level: 5 })),
];
