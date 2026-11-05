import type { CharacterState, Sheet } from '../../engine/calc/sheet';
import type { Registry } from '../../engine/registry';
import { spellbookModel, type SpellbookModel } from '../spells/spellbook-model';

/** Exploration uses the same selected spells and resources, limited by display tags. */
export function explorationModel(
  state: CharacterState,
  sheet: Sheet,
  registry: Registry,
): SpellbookModel {
  const book = spellbookModel(state, sheet, registry);
  return {
    ...book,
    entries: book.entries.filter(({ spell }) => spell.tags.includes('utility') || spell.ritual),
  };
}
