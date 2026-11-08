import type { SpellDef } from '../schema';

/**
 * How a spell's material component works at the table (2014 rules).
 * - none: the spell has no material component.
 * - plain: no listed cost, so a focus or component pouch can stand in for it.
 * - costly: the text names a gold price, so only the real thing works.
 */
export type MaterialKind = 'none' | 'plain' | 'costly';

export interface MaterialInfo {
  kind: MaterialKind;
  /** The spell's own material text, empty when none. */
  text: string;
  /** Total gold pieces named in the text (0 when no price). */
  costGp: number;
  /** The text says the spell uses the material up. */
  consumed: boolean;
}

const PRICE = /(\d[\d,]*)\s*gp/gi;

/** Read a spell's material text for price and consumption. Never throws. */
export function classifyMaterial(spell: Pick<SpellDef, 'components'>): MaterialInfo {
  const text = spell.components.m?.trim() ?? '';
  if (!text) return { kind: 'none', text: '', costGp: 0, consumed: false };
  let costGp = 0;
  for (const match of text.matchAll(PRICE)) costGp += Number(match[1]!.replaceAll(',', ''));
  return {
    kind: costGp > 0 ? 'costly' : 'plain',
    text,
    costGp,
    consumed: /consum/i.test(text),
  };
}
