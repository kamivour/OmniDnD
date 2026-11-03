import { formatDuration } from '../../engine/clock';
import { SECONDS_PER_ROUND } from '../../engine/rules2014';
import type { ActiveEffect, LiveState } from '../../engine/schema';

/** A dependent effect cannot outlast the concentration that keeps it active. */
export function effectDeadline(effect: ActiveEffect, live: LiveState): number | undefined {
  const parent = effect.concentration ? live.concentration?.endsAt : undefined;
  if (effect.endsAt === undefined) return parent;
  return parent === undefined ? effect.endsAt : Math.min(effect.endsAt, parent);
}

/** Display the saved game-time deadline; never start a real-time countdown. */
export function remainingEffectTime(
  endsAt: number | undefined,
  live: Pick<LiveState, 'clock' | 'combat'>,
  untimed = 'Until removed',
): string {
  if (endsAt === undefined) return untimed;
  const seconds = Math.max(0, endsAt - live.clock.seconds);
  if (seconds === 0) return 'Expired';
  if (!live.combat) return `${formatDuration(seconds)} left`;
  const rounds = Math.ceil(seconds / SECONDS_PER_ROUND);
  return `${rounds} ${rounds === 1 ? 'round' : 'rounds'} left`;
}
