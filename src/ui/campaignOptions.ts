import type { HpLevelFloor } from '../engine/calc/hp';
import type { Campaign } from '../engine/schema';
import type { AbilityMethod, CampaignView, HpMethod, Leveling } from './fixtures/campaigns';

/** Campaign Setup choices (SPEC §5 Campaign Setup). Labels and one-line hints, own words. */

export interface Option<T extends string> {
  value: T;
  label: string;
  hint: string;
}

export const LEVELING_OPTIONS: Option<Leveling>[] = [
  { value: 'xp', label: 'XP', hint: 'Track experience points. The app prompts at each threshold.' },
  {
    value: 'milestone',
    label: 'Milestone',
    hint: 'Level up when the DM says so. XP is hidden.',
  },
];

export const HP_OPTIONS: Option<HpMethod>[] = [
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

export const ABILITY_OPTIONS: Option<AbilityMethod>[] = [
  { value: 'standard', label: 'Standard array', hint: 'Assign 15, 14, 13, 12, 10, 8.' },
  { value: 'pointBuy', label: 'Point buy', hint: '27 points; the app checks the cost.' },
  { value: 'rolled', label: 'Rolled', hint: 'Roll at the table and type each score.' },
];

export function optionLabel<T extends string>(options: Option<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** One-line rules summary, e.g. "5e 2014 · Milestone · HP rolled · Abilities rolled · PHB, XGE, TCE". */
export function rulesSummary(c: CampaignView | Campaign): string {
  const abilityMethod =
    c.abilityMethod === 'standard-array'
      ? 'standard'
      : c.abilityMethod === 'point-buy'
        ? 'pointBuy'
        : c.abilityMethod;
  return [
    '5e 2014',
    optionLabel(LEVELING_OPTIONS, c.leveling),
    `HP ${optionLabel(HP_OPTIONS, c.hpMethod).toLowerCase()}`,
    `Abilities ${optionLabel(ABILITY_OPTIONS, abilityMethod).toLowerCase()}`,
    c.sources.join(', '),
  ].join(' · ');
}
