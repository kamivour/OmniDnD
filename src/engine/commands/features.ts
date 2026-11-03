import type { CharacterFeature } from '../calc/features';
import type { Die, FeatureDef, Recharge } from '../schema';
import type { Check, Command, CommandContext } from './runner';
import {
  block,
  economyChecks,
  featureName,
  isDead,
  rangeCheck,
  spendEconomy,
  usesLeft,
  type EconomySlot,
} from './shared';

const ECONOMY_BY_ACTIVATION: Partial<Record<FeatureDef['activation'], EconomySlot>> = {
  action: 'action',
  bonus: 'bonus',
  reaction: 'reaction',
};

/**
 * The feature and the feature whose uses it spends: itself, or its `usesFrom` pool
 * (Cutting Words spends Bardic Inspiration).
 */
function lookup({ sheet }: Pick<CommandContext, 'sheet'>, featureId: string) {
  const feature = sheet.features.find(({ def }) => def.id === featureId);
  const poolId = feature?.def.usesFrom ?? featureId;
  const pool: CharacterFeature | undefined =
    poolId === featureId ? feature : sheet.features.find(({ def }) => def.id === poolId);
  return { feature, pool, poolId };
}

export interface FeatureUseDetails {
  feature?: CharacterFeature;
  pool?: CharacterFeature;
  poolId: string;
  uses?: { max: number; spent: number; remaining: number; recharge: Recharge };
  die?: Die;
  unavailableReason?: string;
}

/** The same resolved resource data drives display and commands, including shared-use features. */
export function featureUseDetails(
  ctx: Pick<CommandContext, 'live' | 'sheet'>,
  featureId: string,
): FeatureUseDetails {
  const { feature, pool, poolId } = lookup(ctx, featureId);
  const spent = ctx.live.featureUsesSpent[poolId] ?? 0;
  const uses = pool?.uses && {
    max: pool.uses.max,
    spent,
    remaining: Math.max(0, pool.uses.max - spent),
    recharge: pool.uses.recharge,
  };
  const die = feature?.die ?? pool?.die;
  let unavailableReason: string | undefined;
  if (!feature) unavailableReason = 'You do not have this feature';
  else if (isDead(ctx.live)) unavailableReason = 'You are dead';
  else if (feature.def.activation === 'passive')
    unavailableReason = `${feature.def.name} is passive`;
  else if (feature.def.usesFrom && !pool?.uses)
    unavailableReason = `${feature.def.name}'s required resource pool is unavailable`;
  else if (uses?.remaining === 0) unavailableReason = `No ${pool!.def.name} uses left`;
  return {
    ...(feature ? { feature } : {}),
    ...(pool ? { pool } : {}),
    poolId,
    ...(uses ? { uses } : {}),
    ...(die ? { die } : {}),
    ...(unavailableReason ? { unavailableReason } : {}),
  };
}

export interface UseFeaturePayload {
  featureId: string;
}

export const useFeature: Command<UseFeaturePayload> = {
  name: 'useFeature',
  check: (ctx, { featureId }) => {
    const { feature, unavailableReason } = featureUseDetails(ctx, featureId);
    if (!feature) return [block(`You don't have ${featureName(ctx, featureId)}`)];
    if (unavailableReason) return [block(unavailableReason)];
    const checks: Check[] = [];
    const slot = ECONOMY_BY_ACTIVATION[feature.def.activation];
    if (slot) checks.push(...economyChecks(ctx, slot));
    return checks;
  },
  apply: ({ live }, { featureId }, ctx) => {
    const { feature, pool, poolId, uses, die } = featureUseDetails(ctx, featureId);
    const name = feature?.def.name ?? featureId;
    const slot = feature && ECONOMY_BY_ACTIVATION[feature.def.activation];
    if (slot) spendEconomy(live, slot);
    const notes: string[] = [];
    if (die) notes.push(die);
    if (uses) {
      const spent = uses.spent + 1;
      live.featureUsesSpent[poolId] = spent;
      notes.push(
        poolId === featureId
          ? `${uses.max - spent}/${uses.max} left`
          : usesLeft(pool!.def.name, spent, uses.max),
      );
    }
    return notes.length > 0 ? `Used ${name} (${notes.join(', ')})` : `Used ${name}`;
  },
};

export interface AdjustFeatureUsesPayload {
  featureId: string;
  /** New number of spent uses of the feature's pool. */
  spent: number;
}

/** Manual correction from the `− / +` steppers. A `usesFrom` feature adjusts its pool. */
export const adjustFeatureUses: Command<AdjustFeatureUsesPayload> = {
  name: 'adjustFeatureUses',
  check: (ctx, { featureId, spent }) => {
    const { uses } = featureUseDetails(ctx, featureId);
    if (!uses) return [block(`${featureName(ctx, featureId)} has no limited uses`)];
    return rangeCheck('Spent uses', spent, 0, uses.max);
  },
  apply: ({ live }, { featureId, spent }, ctx) => {
    const { pool, poolId, uses } = featureUseDetails(ctx, featureId);
    if (spent === 0) delete live.featureUsesSpent[poolId];
    else live.featureUsesSpent[poolId] = spent;
    const max = uses?.max ?? 0;
    return `${pool?.def.name ?? poolId}: ${max - spent}/${max} left`;
  },
};
