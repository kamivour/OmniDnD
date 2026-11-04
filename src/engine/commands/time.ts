import { formatClock, formatDuration } from '../clock';
import type { Command } from './runner';
import { minCheck, passTime, timeRangeChecks, warn, withNotes } from './shared';

export interface AdvanceTimePayload {
  seconds: number;
}

/** Exploration clock buttons (+1 min, +10 min, +1 h, +8 h, custom). Never real-world time. */
export const advanceTime: Command<AdvanceTimePayload> = {
  name: 'advanceTime',
  check: ({ live }, { seconds }) => {
    const checks = minCheck('Seconds', seconds, 1);
    if (checks.length === 0) checks.push(...timeRangeChecks(live.clock.seconds, seconds));
    if (live.combat) checks.push(warn('In combat: Start Turn advances the clock'));
    return checks;
  },
  apply: ({ live }, { seconds }, ctx) => {
    const notes = passTime(live, seconds, ctx);
    return withNotes(
      `Time +${formatDuration(seconds)} (${formatClock(live.clock.seconds)})`,
      notes,
    );
  },
};
