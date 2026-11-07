/**
 * Dice for the optional roller (M16, Q5). Pure: the random source is passed in, so tests are exact.
 * A roll is only shown to the player; nothing here changes character state.
 */

export type Rng = () => number;

export interface DiceTerm {
  count: number;
  sides: number;
}

export interface DiceExpression {
  terms: DiceTerm[];
  /** Sum of the flat numbers. */
  bonus: number;
}

export interface DiceRoll {
  expression: string;
  /** Each die, in order, grouped by term. */
  dice: number[][];
  bonus: number;
  total: number;
}

const MAX_DICE = 100;
const MAX_SIDES = 1000;

/** "2d6+3", "d20-1", "1d8 + 1d4 + 2". Returns undefined when the text is not dice. */
export function parseDice(text: string): DiceExpression | undefined {
  const cleaned = text.replaceAll(/\s+/g, '').toLowerCase();
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(cleaned)) return undefined;
  const terms: DiceTerm[] = [];
  let bonus = 0;
  let total = 0;
  for (const part of cleaned.match(/[+-]?[^+-]+/g)!) {
    const sign = part.startsWith('-') ? -1 : 1;
    const body = part.replace(/^[+-]/, '');
    const dice = /^(\d*)d(\d+)$/.exec(body);
    if (dice) {
      const count = dice[1] === '' ? 1 : Number(dice[1]);
      const sides = Number(dice[2]);
      if (sign < 0 || count < 1 || count > MAX_DICE || sides < 2 || sides > MAX_SIDES)
        return undefined;
      total += count;
      terms.push({ count, sides });
    } else bonus += sign * Number(body);
  }
  if (terms.length === 0 || total > MAX_DICE) return undefined;
  return { terms, bonus };
}

const die = (sides: number, rng: Rng) => Math.floor(rng() * sides) + 1;

const describe = (expression: DiceExpression) =>
  expression.terms.map((term) => `${term.count}d${term.sides}`).join('+') +
  (expression.bonus === 0 ? '' : `${expression.bonus > 0 ? '+' : ''}${expression.bonus}`);

export function rollDice(text: string, rng: Rng = Math.random): DiceRoll | undefined {
  const parsed = parseDice(text);
  if (!parsed) return undefined;
  const dice = parsed.terms.map((term) =>
    Array.from({ length: term.count }, () => die(term.sides, rng)),
  );
  const total = dice.flat().reduce((sum, value) => sum + value, parsed.bonus);
  return { expression: describe(parsed), dice, bonus: parsed.bonus, total };
}

export type D20Mode = 'normal' | 'advantage' | 'disadvantage';

export interface D20Roll extends DiceRoll {
  mode: D20Mode;
  /** Both d20s when rolled with advantage or disadvantage; the first one counts when equal. */
  kept: number;
  natural: 'critical' | 'fumble' | undefined;
}

/** A d20 check, attack or save with a flat bonus. */
export function rollD20(bonus: number, mode: D20Mode = 'normal', rng: Rng = Math.random): D20Roll {
  const first = die(20, rng);
  const second = mode === 'normal' ? undefined : die(20, rng);
  const kept =
    second === undefined
      ? first
      : mode === 'advantage'
        ? Math.max(first, second)
        : Math.min(first, second);
  return {
    expression: `d20${bonus === 0 ? '' : bonus > 0 ? `+${bonus}` : bonus}`,
    dice: [second === undefined ? [first] : [first, second]],
    bonus,
    total: kept + bonus,
    mode,
    kept,
    natural: kept === 20 ? 'critical' : kept === 1 ? 'fumble' : undefined,
  };
}

/** Damage dice doubled on a critical hit (2014: roll all the damage dice twice). */
export function criticalDice(text: string): string | undefined {
  const parsed = parseDice(text);
  if (!parsed) return undefined;
  const doubled = parsed.terms.map((term) => `${term.count * 2}d${term.sides}`).join('+');
  return doubled + (parsed.bonus === 0 ? '' : `${parsed.bonus > 0 ? '+' : ''}${parsed.bonus}`);
}
