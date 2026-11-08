import { registry } from '../../data/registry';
import { pendingChoices } from '../../engine/calc/pending-choices';
import { useCharacter } from '../hooks/useCharacter';
import { useDismissed } from './dismissed';

/** What the character still has to decide, split into open items and hidden optional ones. */
export function useTodo() {
  const { characterId, state } = useCharacter();
  const { dismissed, dismiss, restore } = useDismissed(characterId);
  const all = pendingChoices(state, registry);
  const open = all.filter((item) => !(item.optional && dismissed.includes(item.id)));
  const hidden = all.filter((item) => item.optional && dismissed.includes(item.id));
  return { characterId, state, open, hidden, dismiss, restore };
}
