import { z } from 'zod';
import { AbilitySchema } from '../schema/common';
import type { Campaign } from '../schema/character';
import { ABILITIES, type Ability } from './abilities';

export type AbilityMethod = Campaign['abilityMethod'];

/** New 2014 base-score entry, before racial increases and other recorded bonuses. */
export const AbilityBasesSchema = z.record(AbilitySchema, z.int().min(3).max(18));
export type AbilityBases = z.infer<typeof AbilityBasesSchema>;

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
export const POINT_BUY_COSTS: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

/** Incomplete or out-of-range choices have no meaningful point-buy total. */
export function pointBuyCost(bases: Partial<Record<Ability, number>>): number | undefined {
  const scores = ABILITIES.map((ability) => bases[ability]);
  if (
    scores.some(
      (score) =>
        score === undefined || !Number.isInteger(score) || POINT_BUY_COSTS[score] === undefined,
    )
  )
    return undefined;
  return scores.reduce<number>((sum, score) => sum + POINT_BUY_COSTS[score!]!, 0);
}

/** Method-specific checks shared by creation and explicit edits of existing base scores. */
export function abilityBaseIssues(method: AbilityMethod, bases: AbilityBases): string[] {
  const scores = ABILITIES.map((ability) => bases[ability]);
  if (
    method === 'standard-array' &&
    [...scores]
      .sort((left, right) => right - left)
      .some((score, index) => score !== STANDARD_ARRAY[index])
  )
    return ['Assign each standard-array score once: 15, 14, 13, 12, 10, 8'];
  if (method === 'point-buy') {
    const cost = pointBuyCost(bases);
    if (cost === undefined) return ['Point-buy base scores must be between 8 and 15'];
    if (cost > 27) return ['Point-buy base scores cost more than 27 points'];
  }
  return [];
}
