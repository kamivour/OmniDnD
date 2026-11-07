import type { D20Roll, DiceRoll } from '../../engine/calc/dice';

export function describeRoll(roll: DiceRoll | D20Roll): string {
  const dice = roll.dice.map((group) => `[${group.join(', ')}]`).join(' + ');
  const bonus = roll.bonus === 0 ? '' : ` ${roll.bonus > 0 ? '+' : '-'} ${Math.abs(roll.bonus)}`;
  return `${dice}${bonus}`;
}
