import type { Ability } from '../../engine/calc/abilities';
import { racialIncreaseSlots } from '../../engine/calc/custom-origin';
import type { RaceDef } from '../../engine/schema';

export type OriginPicks = (Ability | '')[];

/** Starting picks: each fixed increase stays on its usual ability; free picks start empty. */
export function defaultOriginPicks(race: RaceDef | undefined): OriginPicks {
  return race ? racialIncreaseSlots(race).map(({ ability }) => ability ?? '') : [];
}

/** Picks fit the race when there is one per increase, all chosen and all different. */
export function originPicksReady(race: RaceDef | undefined, picks: OriginPicks): boolean {
  const slots = race ? racialIncreaseSlots(race) : [];
  return (
    slots.length > 0 &&
    picks.length === slots.length &&
    picks.every(Boolean) &&
    new Set(picks).size === picks.length
  );
}
