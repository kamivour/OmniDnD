import type { Skill } from '../rules2014';
import type { Ability } from './abilities';

/** PHB 2014, Multiclassing: what a new class needs and what it grants (not Basic Rules text). */
type ArmorKind = 'light' | 'medium' | 'shield';
type WeaponKind = 'simple' | 'martial';

export interface MulticlassRule {
  /** Every ability here must be 13+ ("all"), or at least one ("any"). */
  minimum: { abilities: Ability[]; mode: 'all' | 'any' };
  armor: ArmorKind[];
  weapons: WeaponKind[];
  /** A skill you choose, from a class list or from any skill. */
  skill?: 'any' | Skill[];
  /** A fixed tool by item id, or one instrument you choose. */
  tool?: string | 'instrument';
}

const RANGER_SKILLS: Skill[] = [
  'animal-handling',
  'athletics',
  'insight',
  'investigation',
  'nature',
  'perception',
  'stealth',
  'survival',
];

const ROGUE_SKILLS: Skill[] = [
  'acrobatics',
  'athletics',
  'deception',
  'insight',
  'intimidation',
  'investigation',
  'perception',
  'performance',
  'persuasion',
  'sleight-of-hand',
  'stealth',
];

export const MULTICLASS_RULES: Record<string, MulticlassRule> = {
  'class.barbarian': {
    minimum: { abilities: ['STR'], mode: 'all' },
    armor: ['shield'],
    weapons: ['simple', 'martial'],
  },
  'class.bard': {
    minimum: { abilities: ['CHA'], mode: 'all' },
    armor: ['light'],
    weapons: [],
    skill: 'any',
    tool: 'instrument',
  },
  'class.cleric': {
    minimum: { abilities: ['WIS'], mode: 'all' },
    armor: ['light', 'medium', 'shield'],
    weapons: [],
  },
  'class.druid': {
    minimum: { abilities: ['WIS'], mode: 'all' },
    armor: ['light', 'medium', 'shield'],
    weapons: [],
  },
  'class.fighter': {
    minimum: { abilities: ['STR', 'DEX'], mode: 'any' },
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple', 'martial'],
  },
  'class.monk': {
    minimum: { abilities: ['DEX', 'WIS'], mode: 'all' },
    armor: [],
    weapons: [],
  },
  'class.paladin': {
    minimum: { abilities: ['STR', 'CHA'], mode: 'all' },
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple', 'martial'],
  },
  'class.ranger': {
    minimum: { abilities: ['DEX', 'WIS'], mode: 'all' },
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple', 'martial'],
    skill: RANGER_SKILLS,
  },
  'class.rogue': {
    minimum: { abilities: ['DEX'], mode: 'all' },
    armor: ['light'],
    weapons: [],
    skill: ROGUE_SKILLS,
    tool: 'item.thieves-tools',
  },
  'class.sorcerer': {
    minimum: { abilities: ['CHA'], mode: 'all' },
    armor: [],
    weapons: [],
  },
  'class.warlock': {
    minimum: { abilities: ['CHA'], mode: 'all' },
    armor: ['light'],
    weapons: ['simple'],
  },
  'class.wizard': {
    minimum: { abilities: ['INT'], mode: 'all' },
    armor: [],
    weapons: [],
  },
};

export const MULTICLASS_MINIMUM = 13;

/** A readable prerequisite, e.g. "STR 13 and CHA 13" or "STR 13 or DEX 13". */
export function minimumText(rule: MulticlassRule): string {
  return rule.minimum.abilities
    .map((ability) => `${ability} ${MULTICLASS_MINIMUM}`)
    .join(rule.minimum.mode === 'all' ? ' and ' : ' or ');
}

export function meetsMinimum(rule: MulticlassRule, score: (ability: Ability) => number): boolean {
  const test = (ability: Ability) => score(ability) >= MULTICLASS_MINIMUM;
  return rule.minimum.mode === 'all'
    ? rule.minimum.abilities.every(test)
    : rule.minimum.abilities.some(test);
}
