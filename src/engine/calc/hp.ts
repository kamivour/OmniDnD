import type { HpLevelFloor } from '../schema/character';

/** Campaign rule for a level whose roll + CON is below 1 (D44). Defined with the Campaign schema. */
export type { HpLevelFloor };

export type HitDie = 6 | 8 | 10 | 12;

/** PHB 2014 fixed value for a level after 1st: half the die + 1 (d8 → 5). */
export function averageHpRoll(die: HitDie): number {
  return die / 2 + 1;
}

/** HP one level adds: its entry + the CON modifier, floored per campaign rule. */
export function levelHp(entry: number, conMod: number, floor: HpLevelFloor = 'none'): number {
  const hp = entry + conMod;
  return floor === 'one' ? Math.max(1, hp) : hp;
}

/**
 * Max HP from locked per-level entries (D15). `entries[0]` is level 1 (the die maximum);
 * each later entry is the roll or average chosen at that level-up. The current CON modifier
 * applies to every level. Max HP never drops below 1 (D44).
 */
export function maxHp(
  entries: readonly number[],
  conMod: number,
  floor: HpLevelFloor = 'none',
): number {
  if (entries.length === 0) return 0;
  const total = entries.reduce((sum, entry) => sum + levelHp(entry, conMod, floor), 0);
  return Math.max(1, total);
}
