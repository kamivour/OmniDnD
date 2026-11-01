import type { SpellType } from '../engine/schema/common';

/**
 * Spell types: a tag set per spell plus one main type that sets the row color.
 * Display only. Class names are written out in full so Tailwind can find them.
 */

export type { SpellType };

export const SPELL_TYPE_ORDER: SpellType[] = [
  'damage',
  'control',
  'healing',
  'buff',
  'debuff',
  'utility',
];

interface SpellTypeStyle {
  label: string;
  /** One line for tooltips and the filter. */
  hint: string;
  /** Label text color. */
  text: string;
  /** Row box: tinted background + left border. */
  box: string;
  /** Small outlined chip. */
  chip: string;
}

export const SPELL_TYPES: Record<SpellType, SpellTypeStyle> = {
  damage: {
    label: 'Damage',
    hint: 'Deals damage.',
    text: 'text-type-damage',
    box: 'border-l-4 border-l-type-damage bg-type-damage/8',
    chip: 'border-type-damage/60 text-type-damage',
  },
  control: {
    label: 'Control',
    hint: 'Moves, charms, or limits what a target can do.',
    text: 'text-type-control',
    box: 'border-l-4 border-l-type-control bg-type-control/8',
    chip: 'border-type-control/60 text-type-control',
  },
  healing: {
    label: 'Healing',
    hint: 'Restores hit points.',
    text: 'text-type-healing',
    box: 'border-l-4 border-l-type-healing bg-type-healing/8',
    chip: 'border-type-healing/60 text-type-healing',
  },
  buff: {
    label: 'Buff',
    hint: 'Helps you or an ally.',
    text: 'text-type-buff',
    box: 'border-l-4 border-l-type-buff bg-type-buff/8',
    chip: 'border-type-buff/60 text-type-buff',
  },
  debuff: {
    label: 'Debuff',
    hint: 'Weakens a target or sets it up for allies.',
    text: 'text-type-debuff',
    box: 'border-l-4 border-l-type-debuff bg-type-debuff/8',
    chip: 'border-type-debuff/60 text-type-debuff',
  },
  utility: {
    label: 'Utility',
    hint: 'Tricks, disguises, and problem solving.',
    text: 'text-type-utility',
    box: 'border-l-4 border-l-type-utility bg-type-utility/8',
    chip: 'border-type-utility/60 text-type-utility',
  },
};
