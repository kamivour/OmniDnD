import type { RaceDef } from '../schema';
import type { Ability } from './abilities';

/** Bonus source for custom origin increases. */
export const CUSTOM_ORIGIN_SOURCE = 'Custom origin';

/** Tasha custom origin increases: each one a racial increase moved to an ability. */
export interface OriginIncrease {
  ability: Ability;
  value: number;
}

/**
 * The race's own ability increases, largest first: its fixed bonuses (with their usual ability)
 * plus its free picks. Tasha lets each of these move to another ability.
 */
export function racialIncreaseSlots(
  race: Pick<RaceDef, 'abilityBonuses' | 'abilityChoices'>,
): { value: number; ability?: Ability }[] {
  const slots: { value: number; ability?: Ability }[] = race.abilityBonuses
    .filter(({ value }) => value > 0)
    .map(({ ability, value }) => ({ value, ability }));
  const choices = race.abilityChoices;
  if (choices)
    slots.push(...Array.from({ length: choices.count }, () => ({ value: choices.value })));
  return slots.sort((a, b) => b.value - a.value);
}

/** The amounts of the race's increases, largest first; they set the custom origin shape. */
export function racialIncreaseValues(race: Pick<RaceDef, 'abilityBonuses' | 'abilityChoices'>) {
  return racialIncreaseSlots(race).map(({ value }) => value);
}

/** Why these increases are not a valid custom origin for the race, or undefined when they are. */
export function customOriginIssue(
  race: Pick<RaceDef, 'abilityBonuses' | 'abilityChoices'>,
  increases: readonly OriginIncrease[],
): string | undefined {
  const expected = racialIncreaseValues(race);
  if (expected.length === 0) return 'This race has no ability increases to move';
  const given = increases.map(({ value }) => value).sort((a, b) => b - a);
  const sameValues =
    given.length === expected.length && given.every((value, index) => value === expected[index]);
  const distinct = new Set(increases.map(({ ability }) => ability)).size === increases.length;
  if (!sameValues || !distinct)
    return `Move each racial increase (${expected.map((value) => `+${value}`).join(', ')}) to a different ability`;
  return undefined;
}
