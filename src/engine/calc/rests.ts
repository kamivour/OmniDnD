import type { Campaign } from '../schema';
import {
  LONG_REST_SECONDS,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  SHORT_REST_SECONDS,
} from '../rules2014';
import { optionalRules, type RestRule } from './campaign-rules';

/** 2014 DMG rest variants change duration; other recovery rules remain explicit table choices.
 * https://www.dndbeyond.com/posts/1466-9-optional-rules-you-missed-in-the-dungeon-masters
 */
export function restDurations(campaign: Pick<Campaign, 'optionalRules'>): {
  variant: RestRule;
  short: number;
  long: number;
} {
  const variant = optionalRules(campaign).rests;
  switch (variant) {
    case 'gritty':
      return { variant, short: 8 * SECONDS_PER_HOUR, long: 7 * SECONDS_PER_DAY };
    case 'epic':
      return { variant, short: 5 * SECONDS_PER_MINUTE, long: SECONDS_PER_HOUR };
    default:
      return { variant, short: SHORT_REST_SECONDS, long: LONG_REST_SECONDS };
  }
}
