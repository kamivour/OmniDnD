import type { Registry } from '../registry';
import type { SpellDef } from '../schema';
import { FOCUS_IDS } from './class-start';
import { classifyMaterial, type MaterialInfo } from './components';
import { toolGroupOptions } from './background-choices';

/** What a caster can use in place of a plain (no cost) material component. */
type FocusRule = { ids: string[] } | { category: 'instrument' };

const POUCH = 'item.component-pouch';

const FOCUS_BY_CLASS: Record<string, FocusRule> = {
  'class.bard': { category: 'instrument' },
  'class.cleric': { ids: FOCUS_IDS['holy-symbol'] ?? [] },
  'class.paladin': { ids: FOCUS_IDS['holy-symbol'] ?? [] },
  'class.druid': { ids: FOCUS_IDS['druidic-focus'] ?? [] },
  'class.sorcerer': { ids: FOCUS_IDS['arcane-focus'] ?? [] },
  'class.warlock': { ids: FOCUS_IDS['arcane-focus'] ?? [] },
  'class.wizard': { ids: FOCUS_IDS['arcane-focus'] ?? [] },
};

interface ArtificerFocus {
  proficientTools: readonly string[];
  infusedItems: readonly string[];
  subclassFocusId?: string;
}

const ARTIFICER_TOOLS = ['item.thieves-tools', ...toolGroupOptions('artisan', [])];

export function isArtificerFocusTool(id: string, proficientTools: readonly string[]): boolean {
  return ARTIFICER_TOOLS.includes(id) && proficientTools.includes(id);
}

export interface MaterialCover {
  info: MaterialInfo;
  status: 'none' | 'covered' | 'uncovered' | 'costly';
  /** Name of the carried item that covers it. */
  by?: string;
  /** One line for the cast screen. Empty when the spell has no material. */
  note: string;
}

function trimmed(text: string) {
  return text.replace(/[.\s]+$/, '');
}

/**
 * Decide whether a carried item covers the spell's material (2014 rules: a focus or component
 * pouch replaces any material without a price). Warns only; never blocks a cast.
 */
export function materialCover(
  spell: Pick<SpellDef, 'components'>,
  classId: string,
  carriedItemIds: readonly string[],
  registry: Registry,
  artificer?: ArtificerFocus,
): MaterialCover {
  const info = classifyMaterial(spell);
  const isArtificer = classId === 'class.artificer';
  if (info.kind === 'none' && !isArtificer) return { info, status: 'none', note: '' };
  const items = carriedItemIds.flatMap((id) => {
    const entry = registry.entries.get(id);
    return entry?.kind === 'item' ? [entry] : [];
  });
  const artFocus = isArtificer
    ? items.find(
        ({ id }) =>
          id === artificer?.subclassFocusId ||
          artificer?.infusedItems.includes(id) ||
          isArtificerFocusTool(id, artificer?.proficientTools ?? []),
      )
    : undefined;
  const artNote = artFocus
    ? `Hold ${artFocus.name} as your Artificer focus.`
    : 'Artificer spells need a focus. Hold proficient artisan’s tools, thieves’ tools, or an infused item, or confirm a subclass focus at the table.';
  if (info.kind === 'costly') {
    const used = info.consumed ? ' (consumed)' : ' (not used up)';
    return {
      info,
      status: 'costly',
      note: `Needs ${info.costGp} gp of material${used}: ${trimmed(info.text)}${isArtificer ? `. ${artNote}` : ''}`,
    };
  }
  if (isArtificer)
    return {
      info,
      status: artFocus ? 'covered' : 'uncovered',
      ...(artFocus ? { by: artFocus.name } : {}),
      note: artNote,
    };
  const rule = FOCUS_BY_CLASS[classId];
  const focus = items.find((item) => {
    if (item.id === POUCH) return true;
    if (!rule) return false;
    if ('ids' in rule) return rule.ids.includes(item.id);
    return item.category === rule.category;
  });
  if (focus)
    return {
      info,
      status: 'covered',
      by: focus.name,
      note: `Material covered by your ${focus.name}`,
    };
  return {
    info,
    status: 'uncovered',
    note: `No focus or component pouch carried. Needs ${trimmed(info.text)}`,
  };
}
