import { useStore } from 'zustand';
import { useParams } from 'react-router';
import { registry } from '../../data/registry';
import { computeSheet } from '../../engine/calc/sheet';
import { characterState, characterStore } from '../../state/character-store';

/** Read the active character once and derive display values from the engine. */
export function useCharacter() {
  const { characterId = '' } = useParams();
  const store = useStore(characterStore);
  const state = characterState(store, characterId);
  if (!state) throw new Error(`Character not found: ${characterId}`);
  return {
    characterId,
    state,
    sheet: computeSheet(state, registry),
    events: store.characters[characterId]!.events,
  };
}
