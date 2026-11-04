import { describe, expect, it } from 'vitest';
import {
  AbilityBasesSchema,
  abilityBaseIssues,
  pointBuyCost,
  STANDARD_ARRAY,
  type AbilityBases,
} from './ability-methods';

const standard: AbilityBases = { STR: 8, DEX: 15, CON: 14, INT: 10, WIS: 12, CHA: 13 };
const purchase: AbilityBases = { STR: 15, DEX: 15, CON: 15, INT: 8, WIS: 8, CHA: 8 };

describe('ability entry methods', () => {
  it('accepts complete rolled endpoints before bonuses without changing the supplied scores', () => {
    const bases = { ...standard, STR: 3, CHA: 18 };
    const before = structuredClone(bases);
    expect(AbilityBasesSchema.safeParse(bases).success).toBe(true);
    expect(abilityBaseIssues('rolled', bases)).toEqual([]);
    expect(bases).toEqual(before);
  });

  it.each([2, 19, 10.5, NaN, Infinity, '12', null])('rejects invalid base entry %s', (score) => {
    expect(AbilityBasesSchema.safeParse({ ...standard, CON: score }).success).toBe(false);
  });

  it('requires every ability and rejects unrecognized ability keys', () => {
    const missing: Partial<AbilityBases> = { ...standard };
    delete missing.CHA;
    expect(AbilityBasesSchema.safeParse(missing).success).toBe(false);
    expect(AbilityBasesSchema.safeParse({ ...standard, LUCK: 12 }).success).toBe(false);
  });

  it('validates the standard-array multiset rather than assigning particular abilities', () => {
    const before = structuredClone(standard);
    expect(abilityBaseIssues('standard-array', standard)).toEqual([]);
    expect(abilityBaseIssues('standard-array', { ...standard, STR: 15, DEX: 8 })).toEqual([]);
    expect(abilityBaseIssues('standard-array', { ...standard, STR: 13 })).toEqual([
      'Assign each standard-array score once: 15, 14, 13, 12, 10, 8',
    ]);
    expect(standard).toEqual(before);
    expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8]);
  });

  it('computes nonlinear point-buy prices and accepts an exact budget or unused points', () => {
    expect(pointBuyCost(purchase)).toBe(27);
    expect(abilityBaseIssues('point-buy', purchase)).toEqual([]);
    expect(pointBuyCost({ ...purchase, STR: 14 })).toBe(25);
    expect(pointBuyCost({ STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 })).toBe(0);
    expect(abilityBaseIssues('point-buy', { ...purchase, STR: 14 })).toEqual([]);
    expect(abilityBaseIssues('point-buy', { ...purchase, INT: 9 })).toEqual([
      'Point-buy base scores cost more than 27 points',
    ]);
  });

  it.each([7, 16, 8.5, NaN, Infinity])('does not price an invalid point-buy score %s', (score) => {
    expect(pointBuyCost({ ...purchase, STR: score })).toBeUndefined();
    expect(abilityBaseIssues('point-buy', { ...purchase, STR: score })).toEqual([
      'Point-buy base scores must be between 8 and 15',
    ]);
  });

  it('does not show a partial purchase as if it were a complete price', () => {
    expect(pointBuyCost({})).toBeUndefined();
    expect(pointBuyCost({ STR: 15, DEX: 15, CON: 15, INT: 8, WIS: 8 })).toBeUndefined();
  });
});
