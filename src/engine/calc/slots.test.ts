import { describe, expect, it } from 'vitest';
import { proficiencyBonus } from './proficiency';
import { spellSlots, type CasterClass } from './slots';

/** Slot maximums for levels 1–9, dropping the always-zero cantrip index. */
const slots = (...casters: CasterClass[]) => spellSlots(casters).max.slice(1);
const row = (...counts: number[]) => [...counts, ...Array<number>(9 - counts.length).fill(0)];

describe('proficiencyBonus', () => {
  it('rises every 4 levels from +2 to +6', () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([
      2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ]);
  });
});

describe('spellSlots', () => {
  it('gives The Fool (Bard 3) four 1st and two 2nd', () => {
    const result = spellSlots([{ progression: 'full', level: 3 }]);
    expect(result.max).toHaveLength(10);
    expect(result.max[0]).toBe(0);
    expect(slots({ progression: 'full', level: 3 })).toEqual(row(4, 2));
    expect(result.pact).toBeUndefined();
  });

  it('follows the full caster table at 20', () => {
    expect(slots({ progression: 'full', level: 20 })).toEqual(row(4, 3, 3, 3, 3, 2, 2, 1, 1));
  });

  it('rounds half casters up and starts them at level 2', () => {
    expect(slots({ progression: 'half', level: 1 })).toEqual(row());
    expect(slots({ progression: 'half', level: 2 })).toEqual(row(2));
    expect(slots({ progression: 'half', level: 3 })).toEqual(row(3));
    expect(slots({ progression: 'half', level: 5 })).toEqual(row(4, 2));
    expect(slots({ progression: 'half', level: 20 })).toEqual(row(4, 3, 3, 3, 2));
  });

  it('rounds third casters up and starts them at level 3', () => {
    expect(slots({ progression: 'third', level: 2 })).toEqual(row());
    expect(slots({ progression: 'third', level: 3 })).toEqual(row(2));
    expect(slots({ progression: 'third', level: 13 })).toEqual(row(4, 3, 2));
  });

  it('uses the multiclass caster level, rounding half and third casters down', () => {
    // Bard 3 + Paladin 2 = 3 + 1 = 4.
    expect(slots({ progression: 'full', level: 3 }, { progression: 'half', level: 2 })).toEqual(
      row(4, 3),
    );
    // Paladin 3 + Ranger 3 = 1 + 1 = 2.
    expect(slots({ progression: 'half', level: 3 }, { progression: 'half', level: 3 })).toEqual(
      row(3),
    );
  });

  it('ignores a class that has no Spellcasting feature yet', () => {
    // Paladin 3 + Eldritch Knight 2: only the Paladin casts, so it keeps its own table.
    expect(slots({ progression: 'half', level: 3 }, { progression: 'third', level: 2 })).toEqual(
      row(3),
    );
  });

  it('tracks Pact Magic apart from other slots', () => {
    expect(spellSlots([{ progression: 'pact', level: 3 }])).toEqual({
      max: Array<number>(10).fill(0),
      pact: { count: 2, level: 2 },
    });
    const bardWarlock = spellSlots([
      { progression: 'full', level: 3 },
      { progression: 'pact', level: 2 },
    ]);
    expect(bardWarlock.max.slice(1)).toEqual(row(4, 2));
    expect(bardWarlock.pact).toEqual({ count: 2, level: 1 });
    expect(spellSlots([{ progression: 'pact', level: 20 }]).pact).toEqual({ count: 4, level: 5 });
  });
});
