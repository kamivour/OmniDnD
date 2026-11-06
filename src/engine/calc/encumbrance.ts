import type { Registry } from '../registry';
import { optionalRules, type EncumbranceRule } from './campaign-rules';
import { inventoryWeight } from './inventory-weight';
import type { CharacterState } from './sheet';

export interface Encumbrance {
  mode: EncumbranceRule;
  level: 'none' | 'encumbered' | 'heavy' | 'unknown';
  speedPenalty: 0 | 10 | 20;
  incomplete: boolean;
  encumberedAbove: number;
  heavyAbove: number;
}

/** 2014 Basic Rules, Using Ability Scores: variant encumbrance replaces armor STR limits.
 * https://www.dndbeyond.com/sources/dnd/basic-rules-2014/using-ability-scores#VariantEncumbrance
 */
export function encumbrance(
  state: CharacterState,
  registry: Registry,
  strength: number,
): Encumbrance {
  const mode = optionalRules(state.campaign).encumbrance;
  const encumberedAbove = strength * 5;
  const heavyAbove = strength * 10;
  const base = { mode, encumberedAbove, heavyAbove };
  if (mode !== 'variant') return { ...base, level: 'none', speedPenalty: 0, incomplete: false };

  // Compare exact weights, including purchase bundles and coins, before display rounding.
  // Unknown weights can only increase the load, so apply a penalty already proved by
  // the known subtotal without claiming it is the character's complete encumbrance.
  const heavy = inventoryWeight(state, registry, heavyAbove);
  const incomplete = !heavy.complete;
  if (heavy.overCapacity === true) return { ...base, level: 'heavy', speedPenalty: 20, incomplete };
  const light = inventoryWeight(state, registry, encumberedAbove);
  if (light.overCapacity === true)
    return { ...base, level: 'encumbered', speedPenalty: 10, incomplete };
  return { ...base, level: incomplete ? 'unknown' : 'none', speedPenalty: 0, incomplete };
}
