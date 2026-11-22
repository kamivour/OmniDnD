import type { Registry } from '../registry';
import { INCAPACITATING_CONDITIONS } from '../rules2014';
import type { CharacterBuild, LiveState } from '../schema';

export const BLADESONG = 'feature.wizard.bladesinging-bladesong';
export const SONG_OF_VICTORY = 'feature.wizard.bladesinging-song-of-victory';
export const BLADESONG_SECONDS = 60;

export function hasBladesong(live: Pick<LiveState, 'effects' | 'clock'>): boolean {
  return live.effects.some(
    (effect) =>
      effect.sourceId === BLADESONG &&
      (effect.endsAt === undefined || effect.endsAt > live.clock.seconds),
  );
}

export function bladesongRestriction(
  build: Pick<CharacterBuild, 'items'>,
  live: Pick<LiveState, 'items' | 'effects' | 'conditions' | 'hp'>,
  registry: Registry,
): string | undefined {
  const conditions = [...live.conditions, ...live.effects.flatMap((effect) => effect.conditions)];
  if (
    live.hp === 0 ||
    conditions.some((condition) => INCAPACITATING_CONDITIONS.includes(condition))
  )
    return 'incapacitated';
  const armor = build.items.find(({ instanceId, itemId }) => {
    const item = live.items[instanceId];
    if (!item?.equipped || item.qty <= 0) return false;
    const def = registry.entries.get(itemId);
    const category = def?.kind === 'item' ? def.armor?.category : undefined;
    return category === 'medium' || category === 'heavy' || category === 'shield';
  });
  if (armor) return 'wearing medium armor, heavy armor or a shield';
  return undefined;
}

/** End the song in the same command that ended its eligibility. */
export function endBladesong(live: Pick<LiveState, 'effects'>, reason: string): string | undefined {
  if (!live.effects.some(({ sourceId }) => sourceId === BLADESONG)) return undefined;
  live.effects = live.effects.filter(({ sourceId }) => sourceId !== BLADESONG);
  return `Bladesong ended (${reason})`;
}
