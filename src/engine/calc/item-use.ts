import type { Campaign, ItemUse } from '../schema';
import { optionalRules } from './campaign-rules';

export type ItemUseCost = ItemUse['activation'] | 'bonus';

/** The house rule changes only drinking a recorded potion yourself; giving one stays an action. */
export function itemUseCost(
  campaign: Pick<Campaign, 'optionalRules'>,
  use: ItemUse,
  target: 'self' | 'other' = 'self',
  byAlly = false,
): ItemUseCost {
  if (byAlly) return 'none';
  return use.activation === 'action' &&
    use.potion === true &&
    target === 'self' &&
    optionalRules(campaign).potionBonusAction
    ? 'bonus'
    : use.activation;
}
