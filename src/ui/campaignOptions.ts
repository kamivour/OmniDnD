import type { HpLevelFloor } from '../engine/calc/hp';
import {
  SOURCE_NAMES,
  type EncumbranceRule,
  type OptionalRules,
  type RestRule,
} from '../engine/calc/campaign-rules';
import type { Campaign, Source } from '../engine/schema';

/** Campaign Setup choices (SPEC §5 Campaign Setup). Labels and one-line hints, own words. */

export interface Option<T extends string> {
  value: T;
  label: string;
  hint: string;
}

export const LEVELING_OPTIONS: Option<Campaign['leveling']>[] = [
  { value: 'xp', label: 'XP', hint: 'Track experience points. The app prompts at each threshold.' },
  {
    value: 'milestone',
    label: 'Milestone',
    hint: 'Level up when the DM says so. XP is hidden.',
  },
];

export const HP_OPTIONS: Option<Campaign['hpMethod']>[] = [
  { value: 'average', label: 'Average', hint: 'Each new level adds the fixed average roll.' },
  { value: 'rolled', label: 'Rolled', hint: 'Roll at the table and type the result.' },
];

export const HP_FLOOR_OPTIONS: Option<HpLevelFloor>[] = [
  {
    value: 'none',
    label: 'Allow negative',
    hint: 'A level adds roll + CON as is. With a negative CON, a low roll can lower max HP.',
  },
  { value: 'one', label: 'At least 1', hint: 'Each level adds at least 1 HP.' },
];

export const ABILITY_OPTIONS: Option<Campaign['abilityMethod']>[] = [
  { value: 'standard-array', label: 'Standard array', hint: 'Assign 15, 14, 13, 12, 10, 8.' },
  { value: 'point-buy', label: 'Point buy', hint: '27 points; the app checks the cost.' },
  { value: 'rolled', label: 'Rolled', hint: 'Roll at the table and type each score.' },
];

export function optionLabel<T extends string>(options: Option<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** One-line rules summary, e.g. "5e 2014 · Milestone · HP rolled · Abilities rolled · PHB, XGE, TCE". */
export function rulesSummary(c: Campaign): string {
  return [
    '5e 2014',
    optionLabel(LEVELING_OPTIONS, c.leveling),
    `HP ${optionLabel(HP_OPTIONS, c.hpMethod).toLowerCase()}`,
    `Abilities ${optionLabel(ABILITY_OPTIONS, c.abilityMethod).toLowerCase()}`,
    c.sources.join(', '),
  ].join(' · ');
}

export const SOURCE_OPTIONS: { value: Source; label: string; hint: string }[] = [
  { value: 'PHB', label: SOURCE_NAMES.PHB, hint: 'Always on.' },
  { value: 'DMG', label: SOURCE_NAMES.DMG, hint: 'Magic items and variant rules.' },
  { value: 'XGE', label: SOURCE_NAMES.XGE, hint: 'Extra subclasses, spells and feats.' },
  { value: 'TCE', label: SOURCE_NAMES.TCE, hint: 'Extra subclasses, spells and feats.' },
  { value: 'HB', label: SOURCE_NAMES.HB, hint: 'Items and features your table made.' },
];

type RuleFlag = Exclude<keyof OptionalRules, 'encumbrance' | 'rests'>;

export const RULE_FLAG_OPTIONS: { value: RuleFlag; label: string; hint: string }[] = [
  { value: 'feats', label: 'Feats', hint: 'A feat can replace an Ability Score Improvement.' },
  { value: 'multiclassing', label: 'Multiclassing', hint: 'Levels in more than one class.' },
  {
    value: 'optionalClassFeatures',
    label: "Tasha's optional class features",
    hint: 'Extra or replacement class features from Tasha’s.',
  },
  {
    value: 'customOrigin',
    label: "Tasha's custom origin",
    hint: 'Move racial ability bonuses and swap racial proficiencies.',
  },
  {
    value: 'potionBonusAction',
    label: 'Potions as a bonus action',
    hint: 'House rule: drinking a potion yourself takes a bonus action.',
  },
];

export const ENCUMBRANCE_OPTIONS: Option<EncumbranceRule>[] = [
  { value: 'off', label: 'Off', hint: 'Weight is shown but never warns.' },
  {
    value: 'standard',
    label: 'Standard',
    hint: 'Warn above carrying capacity (STR × 15).',
  },
  {
    value: 'variant',
    label: 'Variant',
    hint: 'Slower above STR × 5, slower still with roll penalties above STR × 10.',
  },
];

export const REST_OPTIONS: Option<RestRule>[] = [
  { value: 'standard', label: 'Standard', hint: 'Short rest 1 hour, long rest 8 hours.' },
  { value: 'gritty', label: 'Gritty realism', hint: 'Short rest 8 hours, long rest 7 days.' },
  { value: 'epic', label: 'Epic heroism', hint: 'Short rest 5 minutes, long rest 1 hour.' },
];
