import { describe, expect, it } from 'vitest';
import { abilityModifier } from './abilities';

describe('abilityModifier', () => {
  it("matches The Fool's modifiers", () => {
    // STR 11, DEX 15, CON 13, INT 12, WIS 12, CHA 20 (TEST_CHARACTER §4)
    expect([11, 15, 13, 12, 12, 20].map(abilityModifier)).toEqual([0, 2, 1, 1, 1, 5]);
  });

  it('rounds down for odd scores below 10', () => {
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(9)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(30)).toBe(10);
  });
});
