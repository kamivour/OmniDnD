import { useStore } from 'zustand';
import { characterActivity, characterUndoTarget } from '../../state/activity-order';
import { characterStore } from '../../state/character-store';
import { useCommand } from '../commands/command-context';
import { useManagement } from '../commands/useManagement';
import { useCharacter } from '../hooks/useCharacter';

/** Toolbar and modal editors share the same latest command, including workspace changes. */
export function useCharacterHistory() {
  const { characterId } = useCharacter();
  const state = useStore(characterStore);
  const command = useCommand();
  const management = useManagement();
  const target = characterUndoTarget(state, characterId);
  return {
    activity: characterActivity(state, characterId),
    target,
    pending: management.pending,
    confirmation: management.confirmation,
    undo: () => {
      // Resolve again at activation so no queued click can undo an older source.
      const current = characterUndoTarget(characterStore.getState(), characterId);
      if (current?.scope === 'workspace') management.undo(current.event.id);
      else if (current) command.undo();
    },
  };
}
