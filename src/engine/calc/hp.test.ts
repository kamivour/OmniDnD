import { describe, expect, it } from 'vitest';
import { averageHpRoll, levelHp, maxHp } from './hp';

describe('averageHpRoll', () => {
  it('is half the die + 1', () => {
    expect([6, 8, 10, 12].map((d) => averageHpRoll(d as 6 | 8 | 10 | 12))).toEqual([4, 5, 6, 7]);
  });
});

describe('maxHp', () => {
  // The Fool: L1 max 8, rolled 4 and 4, CON +1 (TEST_CHARACTER §4).
  const fool = [8, 4, 4];

  it("matches The Fool's max HP", () => {
    expect(maxHp(fool, 1)).toBe(19);
  });

  it('applies a CON change to every level', () => {
    expect(maxHp(fool, 2)).toBe(22);
  });

  it('adds only the new entry on level-up', () => {
    expect(maxHp([...fool, 5], 1)).toBe(25);
  });

  it('subtracts a negative level total by default', () => {
    // Level 2 rolled 1 with CON −2: that level takes 1 HP away.
    expect(maxHp([6, 1], -2)).toBe(4 - 1);
  });

  it('gives at least 1 HP per level when the campaign floors levels at 1', () => {
    expect(maxHp([6, 1], -2, 'one')).toBe(4 + 1);
  });

  it('uses each saved floor, falling back to the campaign for legacy entries', () => {
    expect(maxHp([8, 1, 1], -2, 'none', ['none', 'one', 'none'])).toBe(6 + 1 - 1);
    expect(maxHp([8, 1, 1], -2, 'none', [undefined, 'one'])).toBe(6 + 1 - 1);
    expect(maxHp([8, 1, 1], -2, 'one', ['none', 'none'])).toBe(6 - 1 + 1);
  });

  it('keeps frozen levels unchanged when the campaign floor changes', () => {
    expect(maxHp([8, 1, 1], -2, 'none', ['none', 'none', 'none'])).toBe(4);
    expect(maxHp([8, 1, 1], -2, 'one', ['none', 'none', 'none'])).toBe(4);
    expect(maxHp([8, 1, 1], -2, 'none', ['one', 'one', 'one'])).toBe(8);
    expect(maxHp([8, 1, 1], -2, 'one', ['one', 'one', 'one'])).toBe(8);
  });

  it('still applies CON changes to every entry with its saved floor', () => {
    expect(maxHp([8, 1, 1], -2, 'one', ['none', 'one', 'none'])).toBe(6);
    expect(maxHp([8, 1, 1], 0, 'one', ['none', 'one', 'none'])).toBe(10);
  });

  it('never drops below 1 max HP', () => {
    expect(maxHp([6, 1, 1, 1], -4)).toBe(1);
  });

  it('is 0 with no entries', () => {
    expect(maxHp([], 3)).toBe(0);
  });
});

describe('levelHp', () => {
  it('is entry + CON, floored only by the campaign rule', () => {
    expect(levelHp(2, -3)).toBe(-1);
    expect(levelHp(2, -3, 'one')).toBe(1);
    expect(levelHp(4, 1, 'one')).toBe(5);
  });
});
