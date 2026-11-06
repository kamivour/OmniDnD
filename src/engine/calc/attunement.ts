import type { CharacterState } from './sheet';

/** Count recorded bonds by owned instance, including depleted records awaiting manual review. */
export function attunedItems(state: Pick<CharacterState, 'build' | 'live'>) {
  return state.build.items.filter(
    (item) =>
      Object.hasOwn(state.live.items, item.instanceId) &&
      state.live.items[item.instanceId]?.attuned === true,
  );
}
