import { describe, expect, it } from 'vitest';
import { criticalDice, parseDice, rollD20, rollDice } from './dice';

const sequence = (...values: number[]) => {
  let at = 0;
  return () => values[at++ % values.length]!;
};

describe('dice', () => {
  it('parses expressions and rejects other text', () => {
    expect(parseDice('2d6+3')).toEqual({ terms: [{ count: 2, sides: 6 }], bonus: 3 });
    expect(parseDice(' d20 - 1 ')).toEqual({ terms: [{ count: 1, sides: 20 }], bonus: -1 });
    expect(parseDice('1d8+1d4+2')?.terms).toHaveLength(2);
    for (const bad of ['', 'abc', '5', '0d6', '2d1', '-1d6', '101d6', '1d6+', 'd'])
      expect(parseDice(bad), bad).toBeUndefined();
  });

  it('rolls with the given random source', () => {
    const roll = rollDice('2d6+3', sequence(0, 0.999))!;
    expect(roll.dice).toEqual([[1, 6]]);
    expect(roll.total).toBe(10);
    expect(roll.expression).toBe('2d6+3');
  });

  it('keeps the higher or lower d20', () => {
    expect(rollD20(5, 'advantage', sequence(0.1, 0.9))).toMatchObject({ kept: 19, total: 24 });
    expect(rollD20(5, 'disadvantage', sequence(0.1, 0.9))).toMatchObject({ kept: 3, total: 8 });
    expect(rollD20(0, 'normal', sequence(0.999))).toMatchObject({ natural: 'critical' });
    expect(rollD20(0, 'normal', sequence(0))).toMatchObject({ natural: 'fumble' });
  });

  it('doubles the dice on a critical, not the bonus', () => {
    expect(criticalDice('1d8+3')).toBe('2d8+3');
    expect(criticalDice('2d6+1d4')).toBe('4d6+2d4');
  });
});
